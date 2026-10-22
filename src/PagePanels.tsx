import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, ChevronLeft, Clock3, MessageSquare, Pencil, RefreshCw, Reply, RotateCcw, Save, Trash2, X } from "lucide-react";
import { makeId } from "./model";
import type { Page, PageComment } from "./model";
import { listPageRevisions, MAX_PAGE_REVISIONS, savePageRevision } from "./pageHistory";
import type { PageRevision } from "./pageHistory";
import { pageToMarkdown } from "./pageExport";
import "./PagePanels.css";

interface PageCommentsPanelProps {
  page: Page;
  author: string;
  onUpdate: (patch: Partial<Page>) => void;
  onClose: () => void;
}

interface PageHistoryPanelProps {
  workspaceId: string;
  page: Page;
  readOnly?: boolean;
  onRestore: (snapshot: Page) => void;
  onClose: () => void;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function PageCommentsPanel({ page, author, onUpdate, onClose }: PageCommentsPanelProps) {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const comments = page.comments ?? [];
  const roots = comments.filter((comment) => !comment.parentId || !comments.some((parent) => parent.id === comment.parentId));
  const visibleRoots = roots.filter((root) => filter === "all" || (filter === "resolved" ? root.resolved : !root.resolved));
  const openCount = roots.filter((root) => !root.resolved).length;
  const resolvedCount = roots.length - openCount;

  const updateComments = (next: PageComment[]) => onUpdate({ comments: next });
  const submitComment = (event: FormEvent, parentId?: string) => {
    event.preventDefault();
    const text = (parentId ? replyDraft : draft).trim();
    if (!text) return;
    updateComments([...comments, {
      id: makeId("comment"),
      text,
      author: author.trim() || "Meu perfil",
      createdAt: new Date().toISOString(),
      ...(parentId ? { parentId } : {}),
    }]);
    if (parentId) { setReplyDraft(""); setReplyTo(null); }
    else setDraft("");
  };
  const saveEdit = (event: FormEvent, id: string) => {
    event.preventDefault();
    if (!editDraft.trim()) return;
    updateComments(comments.map((comment) => comment.id === id
      ? { ...comment, text: editDraft.trim(), updatedAt: new Date().toISOString() }
      : comment));
    setEditingId(null);
  };
  const deleteComment = (id: string) => {
    const toDelete = new Set([id]);
    // Includes nested replies from imported data as well as normal one-level replies.
    let changed = true;
    while (changed) {
      changed = false;
      comments.forEach((comment) => {
        if (comment.parentId && toDelete.has(comment.parentId) && !toDelete.has(comment.id)) {
          toDelete.add(comment.id);
          changed = true;
        }
      });
    }
    updateComments(comments.filter((comment) => !toDelete.has(comment.id)));
    setDeleteId(null);
  };
  const renderComment = (comment: PageComment, isReply = false) => (
    <div className={`page-comment${isReply ? " is-reply" : ""}`} key={comment.id}>
      <div className="page-comment-author">
        <span className="page-comment-avatar" aria-hidden="true">{comment.author.trim().slice(0, 1).toLocaleUpperCase("pt-BR") || "?"}</span>
        <strong>{comment.author}</strong>
        <time dateTime={comment.createdAt} title={dateLabel(comment.createdAt)}>{dateLabel(comment.createdAt)}</time>
      </div>
      {editingId === comment.id ? (
        <form className="page-comment-edit" onSubmit={(event) => saveEdit(event, comment.id)}>
          <textarea aria-label="Editar comentário" value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={10000} rows={3} autoFocus />
          <div className="page-tools-actions"><button type="button" onClick={() => setEditingId(null)}>Cancelar</button><button type="submit" className="page-tools-primary" disabled={!editDraft.trim()}>Salvar</button></div>
        </form>
      ) : <p className="page-comment-text">{comment.text}</p>}
      {comment.updatedAt && <small className="page-comment-edited" title={dateLabel(comment.updatedAt)}>Editado</small>}
      <div className="page-comment-actions">
        <button type="button" onClick={() => { setEditingId(comment.id); setEditDraft(comment.text); setDeleteId(null); }}><Pencil size={13} />Editar</button>
        <button type="button" onClick={() => setDeleteId(deleteId === comment.id ? null : comment.id)}><Trash2 size={13} />Excluir</button>
      </div>
      {deleteId === comment.id && <div className="page-tools-confirm" role="alert"><span>Excluir este comentário{!isReply && comments.some((item) => item.parentId === comment.id) ? " e suas respostas" : ""}?</span><div className="page-tools-actions"><button type="button" onClick={() => setDeleteId(null)}>Cancelar</button><button className="page-tools-danger" type="button" onClick={() => deleteComment(comment.id)}>Excluir</button></div></div>}
    </div>
  );

  return (
    <aside className="page-tools-panel page-comments-panel" aria-label="Comentários da página">
      <header className="page-tools-header"><div><MessageSquare size={18} /><h2>Comentários</h2></div><button className="page-tools-icon" type="button" aria-label="Fechar comentários" onClick={onClose}><X size={19} /></button></header>
      <div className="page-tools-context"><strong>{page.title || "Sem título"}</strong><p>Comentários salvos neste navegador. Não há envio a outras pessoas nem notificações para a equipe.</p></div>
      <div className="page-tools-tabs" role="group" aria-label="Filtrar comentários">
        <button type="button" className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Abertos <span>{openCount}</span></button>
        <button type="button" className={filter === "resolved" ? "active" : ""} onClick={() => setFilter("resolved")}>Resolvidos <span>{resolvedCount}</span></button>
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
      </div>
      <div className="page-tools-scroll">
        {visibleRoots.length === 0 && <div className="page-tools-empty"><MessageSquare size={26} /><strong>{filter === "resolved" ? "Nenhuma conversa resolvida" : filter === "all" ? "Comece uma conversa local" : "Nenhuma conversa aberta"}</strong><p>Use os comentários para registrar observações e acompanhar decisões desta página.</p></div>}
        {visibleRoots.map((root) => {
          const replies = comments.filter((comment) => comment.parentId === root.id);
          return <section className={`page-comment-thread${root.resolved ? " is-resolved" : ""}`} key={root.id} aria-label={`Conversa de ${root.author}`}>
            <div className="page-comment-thread-status">{root.resolved ? <span><Check size={13} />Resolvido</span> : <span>Conversa aberta</span>}<button type="button" onClick={() => updateComments(comments.map((comment) => comment.id === root.id ? { ...comment, resolved: !comment.resolved } : comment))}>{root.resolved ? <><RotateCcw size={13} />Reabrir</> : <><Check size={13} />Resolver</>}</button></div>
            {renderComment(root)}
            {replies.map((reply) => renderComment(reply, true))}
            {!root.resolved && (replyTo === root.id ? <form className="page-comment-reply-form" onSubmit={(event) => submitComment(event, root.id)}><textarea aria-label={`Responder a ${root.author}`} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} maxLength={10000} placeholder="Escreva uma resposta…" rows={3} autoFocus /><div className="page-tools-actions"><button type="button" onClick={() => setReplyTo(null)}>Cancelar</button><button type="submit" className="page-tools-primary" disabled={!replyDraft.trim()}>Responder</button></div></form> : <button className="page-comment-reply" type="button" onClick={() => { setReplyTo(root.id); setReplyDraft(""); }}><Reply size={14} />Responder</button>)}
          </section>;
        })}
      </div>
      <form className="page-comment-compose" onSubmit={(event) => submitComment(event)}>
        <label htmlFor="page-new-comment">Comentar como {author.trim() || "Meu perfil"}</label>
        <textarea id="page-new-comment" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Adicionar comentário à página…" maxLength={10000} rows={3} />
        <div className="page-tools-actions"><button className="page-tools-primary" type="submit" disabled={!draft.trim()}>Adicionar comentário</button></div>
      </form>
    </aside>
  );
}

export function PageHistoryPanel({ workspaceId, page, readOnly = false, onRestore, onClose }: PageHistoryPanelProps) {
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listPageRevisions(workspaceId, page.id)
      .then((stored) => {
        if (cancelled) return;
        setRevisions(stored);
        setSelectedId((previous) => stored.some((item) => item.id === previous) ? previous : stored[0]?.id ?? null);
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível abrir as versões."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, page.id, refreshKey]);

  const selected = revisions.find((revision) => revision.id === selectedId);
  const preview = useMemo(() => selected ? pageToMarkdown(selected.snapshot) : "", [selected]);
  const refresh = () => { setLoading(true); setError(""); setConfirmRestore(false); setRefreshKey((value) => value + 1); };
  const saveCurrent = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await savePageRevision(workspaceId, page, "Versão salva manualmente");
      setNotice("Página atual salva no histórico. Conteúdo idêntico à última versão não cria duplicata.");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar esta versão.");
    } finally { setSaving(false); }
  };

  return (
    <aside className={`page-tools-panel page-history-panel${selected ? " has-selection" : ""}`} aria-label="Histórico da página">
      <header className="page-tools-header"><div><Clock3 size={18} /><h2>Histórico de versões</h2></div><button className="page-tools-icon" type="button" aria-label="Fechar histórico" onClick={onClose}><X size={19} /></button></header>
      <div className="page-tools-context"><strong>{page.title || "Sem título"}</strong><p>Até {MAX_PAGE_REVISIONS} versões por página, salvas neste navegador. Áudios são armazenados à parte e não são duplicados nas versões.</p></div>
      <div className="page-history-toolbar"><button type="button" onClick={refresh} disabled={loading || saving}><RefreshCw size={14} />Atualizar</button><button type="button" onClick={() => void saveCurrent()} disabled={loading || saving}><Save size={14} />{saving ? "Salvando…" : "Salvar versão atual"}</button></div>
      {error && <div className="page-tools-error" role="alert">{error}</div>}
      {notice && <div className="page-tools-notice" role="status">{notice}</div>}
      {loading ? <div className="page-tools-empty" role="status">Carregando versões…</div> : revisions.length === 0 ? <div className="page-tools-empty"><Clock3 size={28} /><strong>O histórico começa aqui</strong><p>As alterações guardam versões locais da página. Você também pode salvar a versão atual pelo botão acima.</p></div> : <div className="page-history-body">
        <div className="page-history-list" aria-label="Versões disponíveis">{revisions.map((revision) => <button key={revision.id} className={selectedId === revision.id ? "active" : ""} type="button" aria-pressed={selectedId === revision.id} onClick={() => { setSelectedId(revision.id); setConfirmRestore(false); }}><time dateTime={revision.createdAt}>{dateLabel(revision.createdAt)}</time><strong>{revision.snapshot.title || "Sem título"}</strong><span>{revision.reason}</span><small>{revision.snapshot.kind === "database" ? `${revision.snapshot.rows?.length ?? 0} linhas` : `${revision.snapshot.blocks.length} blocos`}</small></button>)}</div>
        {selected && <div className="page-history-preview">
          <button className="page-history-back" type="button" onClick={() => setSelectedId(null)}><ChevronLeft size={15} />Todas as versões</button>
          <div className="page-history-preview-heading"><strong>Prévia da versão</strong><time dateTime={selected.createdAt}>{dateLabel(selected.createdAt)}</time></div>
          <pre>{preview.slice(0, 12000)}</pre>
          {preview.length > 12000 && <small className="page-history-preview-limit">Prévia limitada a 12.000 caracteres. A restauração usa a página completa.</small>}
          {readOnly ? <p className="page-tools-context">Restaure ou desbloqueie a página antes de aplicar uma versão.</p> : confirmRestore ? <div className="page-tools-confirm" role="alert"><strong>Restaurar esta versão?</strong><p>O estado atual será salvo no histórico antes de restaurar o conteúdo e as configurações desta versão.</p><div className="page-tools-actions"><button type="button" onClick={() => setConfirmRestore(false)}>Cancelar</button><button className="page-tools-primary" type="button" onClick={() => { onRestore(structuredClone(selected.snapshot)); setConfirmRestore(false); }}>Confirmar restauração</button></div></div> : <button className="page-history-restore page-tools-primary" type="button" onClick={() => setConfirmRestore(true)}><RotateCcw size={14} />Restaurar esta versão</button>}
        </div>}
      </div>}
    </aside>
  );
}
