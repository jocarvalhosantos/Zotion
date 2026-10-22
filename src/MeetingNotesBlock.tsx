import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AudioLines, Check, CircleStop, Download, FileText, Mic, Pause, Play, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { createEmptyMeetingData, makeId } from "./model";
import type { ContentBlock, MeetingActionItem, MeetingNotesData } from "./model";
import { deleteMeetingAudioSegment, listMeetingAudioSegments, saveMeetingAudioSegment } from "./meetingAudioStore";
import type { MeetingAudioSegment } from "./meetingAudioStore";

type RecorderStatus = "idle" | "requesting" | "recording" | "paused" | "saving";

interface MeetingNotesBlockProps {
  block: ContentBlock;
  onChange: (update: Partial<ContentBlock>) => void;
  onRecorderBusyChange: (blockId: string, busy: boolean) => void;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Áudio salvo neste navegador";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function createSummaryDraft(transcript: string): { summary: string; actions: MeetingActionItem[] } {
  const sentences = transcript
    .split(/\r?\n+|(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
  const summary = sentences.slice(0, 5).join(" ").slice(0, 1400);
  const actionPattern = /\b(ação|ac(?:ao|ão)|pr[oó]ximo passo|ficou combinado|ficou definido|respons[aá]vel|pend[eê]ncia|vou |vamos |precisa|deve )\b/i;
  const actions = sentences
    .filter((sentence) => actionPattern.test(sentence))
    .slice(0, 12)
    .map((sentence) => ({ id: makeId("action"), text: sentence, owner: "", done: false }));
  return { summary, actions };
}

export function MeetingNotesBlock({ block, onChange, onRecorderBusyChange }: MeetingNotesBlockProps) {
  const meeting = { ...createEmptyMeetingData(), ...block.meeting };
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [segments, setSegments] = useState<MeetingAudioSegment[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [errorMessage, setErrorMessage] = useState("");
  const [newActionText, setNewActionText] = useState("");
  const [failedAudioUrl, setFailedAudioUrl] = useState("");
  const [failedAudioFormat, setFailedAudioFormat] = useState("webm");
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const segmentStartedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const filenameStem = useMemo(() => {
    const base = (block.text.trim() || "reuniao")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return base || "reuniao";
  }, [block.text]);

  const updateMeeting = (update: Partial<MeetingNotesData>) => {
    onChange({ meeting: { ...meeting, ...update } });
  };

  const currentElapsed = elapsed + (status === "recording" && segmentStartedAtRef.current !== null
    ? Math.max(0, clockNow - segmentStartedAtRef.current)
    : 0);

  const refreshSegments = async () => {
    const storedSegments = await listMeetingAudioSegments(block.id);
    if (mountedRef.current) setSegments(storedSegments);
  };

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void listMeetingAudioSegments(block.id)
      .then((storedSegments) => { if (!cancelled) setSegments(storedSegments); })
      .catch((error: unknown) => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir o áudio salvo.");
      });
    return () => { cancelled = true; };
  }, [block.id]);

  useEffect(() => {
    const nextUrls = Object.fromEntries(segments.map((segment) => [segment.id, URL.createObjectURL(segment.blob)]));
    setAudioUrls(nextUrls);
    return () => Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
  }, [segments]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    onRecorderBusyChange(block.id, status !== "idle");
    return () => onRecorderBusyChange(block.id, false);
  }, [block.id, onRecorderBusyChange, status]);

  useEffect(() => {
    if (!failedAudioUrl) return;
    return () => URL.revokeObjectURL(failedAudioUrl);
  }, [failedAudioUrl]);

  useEffect(() => {
    const protectActiveRecording = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (status === "recording" || status === "paused" || status === "saving") {
      window.addEventListener("beforeunload", protectActiveRecording);
      return () => window.removeEventListener("beforeunload", protectActiveRecording);
    }
    return undefined;
  }, [status]);

  useEffect(() => () => {
    mountedRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* The browser may already have stopped the recorder. */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startRecording = async () => {
    setErrorMessage("");
    if (!consentConfirmed) {
      setErrorMessage("Confirme a autorização de todas as pessoas antes de gravar.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("Este navegador não oferece suporte à gravação local. Tente abrir o app em uma versão recente do Chrome, Edge ou Firefox.");
      return;
    }
    if (!window.isSecureContext) {
      setErrorMessage("A gravação precisa de uma conexão segura (HTTPS) ou de um endereço local.");
      return;
    }

    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      elapsedRef.current = 0;
      segmentStartedAtRef.current = Date.now();
      setElapsed(0);
      setClockNow(Date.now());

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setErrorMessage("O navegador encontrou um erro durante a gravação. Encerre o trecho para salvar o que foi capturado.");
      };
      recorder.onstop = () => {
        const durationMs = elapsedRef.current + (segmentStartedAtRef.current === null ? 0 : Math.max(0, Date.now() - segmentStartedAtRef.current));
        segmentStartedAtRef.current = null;
        elapsedRef.current = 0;
        setElapsed(0);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        chunksRef.current = [];
        if (mountedRef.current) setStatus("saving");

        void (async () => {
          if (blob.size > 0) {
            const segment: MeetingAudioSegment = {
              id: makeId("recording"),
              blockId: block.id,
              createdAt: new Date().toISOString(),
              durationMs,
              mimeType: blob.type,
              blob,
            };
            try {
              await saveMeetingAudioSegment(segment);
              if (mountedRef.current) {
                await refreshSegments();
                setErrorMessage("");
              }
            } catch (error) {
              if (mountedRef.current) {
                setFailedAudioUrl(URL.createObjectURL(blob));
                setFailedAudioFormat(blob.type.includes("mp4") ? "mp4" : "webm");
                setErrorMessage(error instanceof Error ? error.message : "Não foi possível guardar o áudio. Baixe o arquivo para não perdê-lo.");
              }
            }
          } else if (mountedRef.current) {
            setErrorMessage("O navegador não capturou áudio neste trecho.");
          }
          if (mountedRef.current) setStatus("idle");
        })();
      };
      recorder.start(1000);
      setStatus("recording");
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus("idle");
      const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setErrorMessage(denied
        ? "O acesso ao microfone foi recusado. Libere a permissão do navegador e tente novamente."
        : "Não foi possível iniciar a gravação. Confira o microfone e tente novamente.");
    }
  };

  const pauseRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (segmentStartedAtRef.current !== null) elapsedRef.current += Date.now() - segmentStartedAtRef.current;
    segmentStartedAtRef.current = null;
    setElapsed(elapsedRef.current);
    recorder.pause();
    setStatus("paused");
  };

  const resumeRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    segmentStartedAtRef.current = Date.now();
    recorder.resume();
    setClockNow(Date.now());
    setStatus("recording");
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (segmentStartedAtRef.current !== null) elapsedRef.current += Date.now() - segmentStartedAtRef.current;
    segmentStartedAtRef.current = null;
    setElapsed(elapsedRef.current);
    setStatus("saving");
    recorder.stop();
  };

  const removeSegment = async (segment: MeetingAudioSegment) => {
    if (!window.confirm("Excluir este áudio salvo neste navegador? A transcrição e as anotações permanecerão.")) return;
    try {
      await deleteMeetingAudioSegment(segment.id);
      setSegments((current) => current.filter((item) => item.id !== segment.id));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível excluir o áudio.");
    }
  };

  const addActionItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = newActionText.trim();
    if (!text) return;
    updateMeeting({ actionItems: [...meeting.actionItems, { id: makeId("action"), text, owner: "", done: false }] });
    setNewActionText("");
  };

  const updateActionItem = (id: string, update: Partial<MeetingActionItem>) => {
    updateMeeting({ actionItems: meeting.actionItems.map((item) => item.id === id ? { ...item, ...update } : item) });
  };

  const createDraft = () => {
    if (!meeting.transcript.trim()) {
      setErrorMessage("Adicione ou cole uma transcrição antes de gerar o rascunho.");
      return;
    }
    if ((meeting.summary.trim() || meeting.actionItems.length > 0)
      && !window.confirm("Substituir o resumo e as ações atuais pelo novo rascunho local?")) return;
    const draft = createSummaryDraft(meeting.transcript);
    updateMeeting({ summary: draft.summary, actionItems: draft.actions });
    setErrorMessage("");
  };

  return (
    <section className="meeting-notes" aria-label="Notas e gravação da reunião" onClick={(event) => event.stopPropagation()}>
      <div className="meeting-header">
        <div className="meeting-title-wrap">
          <AudioLines size={18} aria-hidden="true" />
          <input
            className="meeting-title"
            aria-label="Nome da reunião"
            value={block.text}
            onChange={(event) => onChange({ text: event.target.value })}
            placeholder="Nome da reunião"
          />
        </div>
        <div className={`meeting-recording-status status-${status}`} aria-live="polite">
          {status === "recording" && <span className="meeting-recording-dot" />}
          {status === "idle" && `${segments.length} ${segments.length === 1 ? "trecho" : "trechos"} salvos`}
          {status === "requesting" && "Aguardando permissão"}
          {status === "recording" && "Gravando"}
          {status === "paused" && "Pausado"}
          {status === "saving" && "Salvando áudio…"}
        </div>
      </div>

      <div className="meeting-recorder-panel">
        <div className="meeting-recorder-topline">
          <span><Mic size={15} /> Gravação pelo microfone</span>
          <strong className="meeting-timer" aria-label={`Duração ${formatDuration(currentElapsed)}`}>{formatDuration(currentElapsed)}</strong>
        </div>
        <p className="meeting-recorder-hint">Este app grava somente o microfone. Não faz transcrição automática nem envia o áudio para serviços externos. Ao sair desta página, encerra e salva o trecho atual.</p>
        <label className="meeting-consent">
          <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} disabled={status !== "idle"} />
          <span><Users size={15} /> Tenho autorização de todas as pessoas para gravar esta reunião.</span>
        </label>
        <div className="meeting-recorder-actions">
          {status === "idle" && <button className="meeting-primary-button" type="button" onClick={() => void startRecording()} disabled={!consentConfirmed}>
            <Mic size={15} /> {segments.length > 0 ? "Gravar novo trecho" : "Iniciar gravação"}
          </button>}
          {status === "requesting" && <button className="meeting-secondary-button" type="button" disabled><Mic size={15} /> Aguardando microfone…</button>}
          {status === "recording" && <>
            <button className="meeting-secondary-button" type="button" onClick={pauseRecording}><Pause size={15} /> Pausar</button>
            <button className="meeting-danger-button" type="button" onClick={stopRecording}><CircleStop size={15} /> Encerrar e salvar</button>
          </>}
          {status === "paused" && <>
            <button className="meeting-primary-button" type="button" onClick={resumeRecording}><Play size={15} /> Retomar</button>
            <button className="meeting-danger-button" type="button" onClick={stopRecording}><CircleStop size={15} /> Encerrar e salvar</button>
          </>}
          {status === "saving" && <button className="meeting-secondary-button" type="button" disabled><AudioLines size={15} /> Gravando no dispositivo…</button>}
        </div>
      </div>

      {errorMessage && <p className="meeting-error" role="status">{errorMessage}</p>}

      {segments.length > 0 && <div className="meeting-segments">
        <h4>Áudio salvo neste navegador</h4>
        {segments.map((segment, index) => <div className="meeting-segment" key={segment.id}>
          <div className="meeting-segment-heading"><strong>Trecho {index + 1}</strong><span>{formatRecordedAt(segment.createdAt)} · {formatDuration(segment.durationMs)}</span></div>
          {audioUrls[segment.id] && <audio className="meeting-audio-player" controls preload="metadata" src={audioUrls[segment.id]} />}
          <div className="meeting-segment-actions">
            <a href={audioUrls[segment.id]} download={`${filenameStem}-trecho-${index + 1}.${segment.mimeType.includes("mp4") ? "mp4" : "webm"}`}><Download size={14} /> Baixar áudio</a>
            <button type="button" className="meeting-text-danger" onClick={() => void removeSegment(segment)}><Trash2 size={14} /> Excluir áudio</button>
          </div>
        </div>)}
      </div>}

      {failedAudioUrl && <div className="meeting-failed-download"><span>O áudio não coube no armazenamento do navegador.</span><a href={failedAudioUrl} download={`${filenameStem}-audio-nao-salvo.${failedAudioFormat}`}><Download size={14} /> Baixar agora</a></div>}

      <div className="meeting-fields-grid">
        <label className="meeting-field meeting-agenda-field">
          <span><FileText size={15} /> Pauta</span>
          <textarea value={meeting.agenda} onChange={(event) => updateMeeting({ agenda: event.target.value })} placeholder="Tópicos que precisam ser discutidos…" rows={3} />
        </label>
        <label className="meeting-field meeting-participants-field">
          <span><Users size={15} /> Participantes</span>
          <textarea value={meeting.participants} onChange={(event) => updateMeeting({ participants: event.target.value })} placeholder="Nomes separados por vírgula…" rows={3} />
        </label>
        <label className="meeting-field meeting-summary-field">
          <span><Sparkles size={15} /> Resumo e decisões</span>
          <textarea value={meeting.summary} onChange={(event) => updateMeeting({ summary: event.target.value })} placeholder="Registre as decisões e os principais pontos…" rows={4} />
        </label>
      </div>

      <section className="meeting-field meeting-transcript-field">
        <label htmlFor={`transcript-${block.id}`}><span><FileText size={15} /> Transcrição</span><small>Edite ou cole um texto. O áudio não é transcrito automaticamente.</small></label>
        <textarea id={`transcript-${block.id}`} value={meeting.transcript} onChange={(event) => updateMeeting({ transcript: event.target.value })} placeholder="Cole ou digite a transcrição da reunião…" rows={7} />
        <button className="meeting-draft-button" type="button" onClick={createDraft}><Sparkles size={14} /> Gerar rascunho local do resumo e das ações</button>
      </section>

      <section className="meeting-actions-section">
        <div className="meeting-section-heading"><h4>Próximas ações</h4><span>{meeting.actionItems.filter((item) => !item.done).length} pendentes</span></div>
        {meeting.actionItems.length > 0 && <ul className="meeting-action-list">
          {meeting.actionItems.map((item) => <li className={item.done ? "is-done" : ""} key={item.id}>
            <button type="button" className={`meeting-action-check ${item.done ? "checked" : ""}`} aria-label={item.done ? "Reabrir ação" : "Concluir ação"} onClick={() => updateActionItem(item.id, { done: !item.done })}>{item.done && <Check size={13} />}</button>
            <input className="meeting-action-text" value={item.text} onChange={(event) => updateActionItem(item.id, { text: event.target.value })} aria-label="Descrição da ação" />
            <input className="meeting-action-owner" value={item.owner} onChange={(event) => updateActionItem(item.id, { owner: event.target.value })} placeholder="Responsável" aria-label="Responsável pela ação" />
            <button type="button" className="meeting-action-delete" aria-label="Excluir ação" onClick={() => updateMeeting({ actionItems: meeting.actionItems.filter((action) => action.id !== item.id) })}><Trash2 size={14} /></button>
          </li>)}
        </ul>}
        <form className="meeting-add-action" onSubmit={addActionItem}>
          <Plus size={15} />
          <input value={newActionText} onChange={(event) => setNewActionText(event.target.value)} placeholder="Adicionar uma ação ou próximo passo…" aria-label="Nova ação" />
          <button type="submit" disabled={!newActionText.trim()}>Adicionar</button>
        </form>
      </section>

      <p className="meeting-storage-note">As notas ficam no armazenamento deste navegador. O áudio é salvo separadamente; exporte cada trecho para incluí-lo fora deste dispositivo. O backup JSON inclui pauta, transcrição, resumo e ações, mas não os arquivos de áudio.</p>
    </section>
  );
}
