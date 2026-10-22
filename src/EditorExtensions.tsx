import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, FileText, ImagePlus, Link, Palette, Plus, Trash2 } from "lucide-react";
import type { ContentBlock, Page } from "./model";
import "./EditorExtensions.css";

const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGE_DATA_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const COLORS = [
  { id: "gray", label: "Cinza" },
  { id: "brown", label: "Marrom" },
  { id: "orange", label: "Laranja" },
  { id: "yellow", label: "Amarelo" },
  { id: "green", label: "Verde" },
  { id: "blue", label: "Azul" },
  { id: "purple", label: "Roxo" },
  { id: "pink", label: "Rosa" },
  { id: "red", label: "Vermelho" },
];

function isBlockColor(value: string | undefined): boolean {
  return COLORS.some((color) => color.id === value);
}

export function BlockColorMenu({ block, onChange }: { block: ContentBlock; onChange: (update: Partial<ContentBlock>) => void }) {
  return (
    <details className="editor-block-colors">
      <summary><Palette size={14} /> Cor do bloco <ChevronDown size={12} /></summary>
      {(["color", "background"] as const).map((property) => (
        <fieldset key={property}>
          <legend>{property === "color" ? "Texto" : "Fundo"}</legend>
          <div className="editor-color-options">
            <button type="button" className={!isBlockColor(block[property]) ? "is-active" : ""} aria-label={`${property === "color" ? "Texto" : "Fundo"} padrão`} aria-pressed={!isBlockColor(block[property])} title="Padrão" onClick={() => onChange({ [property]: undefined })}>A</button>
            {COLORS.map((color) => (
              <button
                type="button"
                key={color.id}
                className={block[property] === color.id ? "is-active" : ""}
                aria-label={`${property === "color" ? "Texto" : "Fundo"} ${color.label.toLowerCase()}`}
                aria-pressed={block[property] === color.id}
                title={color.label}
                style={{ color: `var(--editor-color-${color.id})`, background: property === "background" ? `var(--editor-background-${color.id})` : undefined }}
                onClick={() => onChange({ [property]: color.id })}
              >A</button>
            ))}
          </div>
        </fieldset>
      ))}
    </details>
  );
}

interface ExtensionBlockProps {
  block: ContentBlock;
  onChange: (update: Partial<ContentBlock>) => void;
  onInsertAfter: () => void;
}

function AddBelow({ onInsertAfter }: Pick<ExtensionBlockProps, "onInsertAfter">) {
  return <button type="button" className="editor-extension-add" onClick={onInsertAfter}><Plus size={12} /> Adicionar bloco abaixo</button>;
}

function insertOnShortcut(event: KeyboardEvent<HTMLElement>, onInsertAfter: () => void) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    onInsertAfter();
  }
}

export function ToggleBlock({ block, onChange, onInsertAfter }: ExtensionBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  return (
    <div className="editor-extension-block editor-toggle" onKeyDown={(event) => insertOnShortcut(event, onInsertAfter)}>
      <div className="editor-toggle-heading">
        <button className="editor-toggle-trigger" type="button" aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
        <input className="editor-extension-title" data-block-id={block.id} aria-label="Título da lista recolhível" value={block.text} placeholder="Título da lista recolhível" onChange={(event) => onChange({ text: event.target.value })} />
      </div>
      {expanded && (
        <div className="editor-toggle-content" id={bodyId}>
          <textarea className="editor-toggle-body" aria-label="Detalhes da lista recolhível" value={block.details ?? ""} rows={Math.max(2, (block.details ?? "").split("\n").length)} placeholder="Escreva os detalhes que serão exibidos ao expandir..." onChange={(event) => onChange({ details: event.target.value })} />
          <AddBelow onInsertAfter={onInsertAfter} />
        </div>
      )}
    </div>
  );
}

function isSupportedImageData(value: string | undefined): value is string {
  if (!value || value.length > MAX_IMAGE_DATA_LENGTH) return false;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return false;
  try {
    const signature = Uint8Array.from(atob(match[2].slice(0, 24)), (character) => character.charCodeAt(0));
    return matchesImageSignature(signature, match[1]);
  } catch {
    return false;
  }
}

function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(text(0, 6));
  if (mimeType === "image/webp") return text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
  return false;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler esta imagem."));
    reader.onload = () => typeof reader.result === "string" && isSupportedImageData(reader.result)
      ? resolve(reader.result)
      : reject(new Error("Formato de imagem inválido."));
    reader.readAsDataURL(file);
  });
}

export function ImageBlock({ block, onChange, onInsertAfter }: ExtensionBlockProps) {
  const fileInputId = useId();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const latestOnChange = useRef(onChange);
  const mounted = useRef(true);
  const imageData = isSupportedImageData(block.imageData) ? block.imageData : undefined;

  useEffect(() => { latestOnChange.current = onChange; }, [onChange]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const upload = async (file: File) => {
    setError("");
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      setError("Escolha uma imagem PNG, JPEG, WebP ou GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("A imagem precisa ter no máximo 512 KB para caber no backup local.");
      return;
    }
    setLoading(true);
    try {
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!matchesImageSignature(bytes, file.type)) throw new Error("O conteúdo do arquivo não corresponde ao formato da imagem.");
      const data = await readImage(file);
      if (mounted.current) latestOnChange.current({ imageData: data, text: file.name });
    } catch (uploadError) {
      if (mounted.current) setError(uploadError instanceof Error ? uploadError.message : "Não foi possível adicionar a imagem.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <div className="editor-extension-block editor-image-block" onKeyDown={(event) => insertOnShortcut(event, onInsertAfter)}>
      {imageData ? <img className="editor-local-image" src={imageData} alt={block.caption || block.text || "Imagem enviada"} /> : <div className="editor-image-placeholder"><ImagePlus size={25} /><strong>Adicionar imagem</strong><span>PNG, JPEG, WebP ou GIF · até 512 KB</span><span>O arquivo fica salvo neste navegador e no backup JSON.</span></div>}
      <div className="editor-image-actions">
        <label className={`editor-upload-label${loading ? " is-loading" : ""}`} htmlFor={fileInputId}><ImagePlus size={13} /> {loading ? "Carregando..." : imageData ? "Substituir imagem" : "Escolher imagem"}</label>
        <input id={fileInputId} className="editor-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Enviar imagem local de até 512 KB" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
        {imageData && <button className="editor-extension-danger" type="button" onClick={() => onChange({ imageData: undefined })}><Trash2 size={13} /> Remover imagem</button>}
      </div>
      {error && <p className="editor-extension-error" role="alert">{error}</p>}
      <input className="editor-image-caption" data-block-id={block.id} aria-label="Legenda da imagem" value={block.caption ?? ""} placeholder="Adicionar legenda ou descrição da imagem..." onChange={(event) => onChange({ caption: event.target.value })} />
      <AddBelow onInsertAfter={onInsertAfter} />
    </div>
  );
}

function validatedBookmarkUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function BookmarkBlock({ block, onChange, onInsertAfter }: ExtensionBlockProps) {
  const [urlDraft, setUrlDraft] = useState({ source: block.url, value: block.url ?? "" });
  const draftUrl = urlDraft.source === block.url ? urlDraft.value : block.url ?? "";
  const setDraftUrl = (value: string) => setUrlDraft({ source: block.url, value });
  const [editing, setEditing] = useState(!validatedBookmarkUrl(block.url));
  const [error, setError] = useState("");
  const url = validatedBookmarkUrl(block.url);

  return (
    <div className="editor-extension-block editor-bookmark-block" onKeyDown={(event) => insertOnShortcut(event, onInsertAfter)}>
      <input className="editor-extension-title" data-block-id={block.id} aria-label="Título do favorito da web" value={block.text} placeholder="Título do favorito da web" onChange={(event) => onChange({ text: event.target.value })} />
      {url && <a className="editor-bookmark-card" href={url} target="_blank" rel="noopener noreferrer"><span className="editor-bookmark-icon"><Link size={20} /></span><span><strong>{block.text || new URL(url).hostname}</strong><small>{url}</small></span><ArrowUpRight size={16} /></a>}
      {(editing || !url) ? (
        <form className="editor-bookmark-form" onSubmit={(event) => { event.preventDefault(); const validUrl = validatedBookmarkUrl(draftUrl); if (!validUrl) { setError("Informe um endereço completo que comece com https:// ou http://."); return; } onChange({ url: validUrl }); setDraftUrl(validUrl); setError(""); setEditing(false); }} noValidate>
          <input type="url" aria-label="Endereço do favorito da web" placeholder="https://exemplo.com" value={draftUrl} onChange={(event) => { setDraftUrl(event.target.value); setError(""); }} />
          <button type="submit">Salvar link</button>
          {url && <button type="button" onClick={() => { setEditing(false); setDraftUrl(block.url ?? ""); setError(""); }}>Cancelar</button>}
        </form>
      ) : <button type="button" className="editor-extension-secondary" onClick={() => setEditing(true)}>Editar endereço</button>}
      {error && <p className="editor-extension-error" role="alert">{error}</p>}
      <AddBelow onInsertAfter={onInsertAfter} />
    </div>
  );
}

export function PageLinkBlock({ block, onChange, onInsertAfter, pages, onNavigate }: ExtensionBlockProps & { pages: Page[]; onNavigate?: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const targetPage = pages.find((page) => page.id === block.targetPageId);
  const availablePages = pages.filter((page) => !page.deletedAt && !page.archivedAt);
  const filteredPages = availablePages.filter((page) => page.id === block.targetPageId || page.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  return (
    <div className="editor-extension-block editor-page-link-block" onKeyDown={(event) => insertOnShortcut(event, onInsertAfter)}>
      <label className="editor-extension-label">Link para página
        <input className="editor-page-search" data-block-id={block.id} type="search" aria-label="Buscar página para vincular" placeholder="Buscar página..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <select aria-label="Selecionar página de destino" value={targetPage?.id ?? ""} onChange={(event) => { const page = availablePages.find((item) => item.id === event.target.value); onChange({ targetPageId: page?.id, text: page?.title ?? "" }); }}>
        <option value="">Selecione uma página</option>
        {filteredPages.map((page) => <option key={page.id} value={page.id}>{page.icon} {page.title || "Sem título"}</option>)}
      </select>
      {filteredPages.length === 0 && <p className="editor-extension-note">Nenhuma página encontrada neste workspace.</p>}
      {targetPage ? <button className="editor-page-link-card" type="button" onClick={() => onNavigate?.(targetPage.id)} disabled={!onNavigate}><span>{targetPage.icon || <FileText size={18} />}</span><strong>{targetPage.title || "Sem título"}</strong><ArrowUpRight size={16} /></button> : block.targetPageId && <p className="editor-extension-note">A página vinculada não está disponível neste workspace. Escolha outro destino.</p>}
      <AddBelow onInsertAfter={onInsertAfter} />
    </div>
  );
}
