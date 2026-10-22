import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { Archive, ArrowDownToLine, Check, ChevronDown, ChevronRight, Command, Copy, Database, FilePlus2, FolderTree, History, Home, LayoutTemplate, Link2, LockKeyhole, Menu, MessageSquare, Mic, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Star, Trash2, UnlockKeyhole, Upload, X } from "lucide-react";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "./DatabaseView";
import { createEmptyMeetingData, createInitialWorkspace, formatUpdatedAt, makeId } from "./model";
import type { Page } from "./model";
import { deleteMeetingAudioForBlock } from "./meetingAudioStore";
import { PageCommentsPanel, PageHistoryPanel } from "./PagePanels";
import { deletePageRevisions, savePageRevision, transferPageRevisions } from "./pageHistory";
import { exportPageMarkdown } from "./pageExport";
import { markdownToPage } from "./templates";
import type { BuiltinTemplate } from "./templates";
import { COVER_STYLES, LEGACY_STORAGE_KEY, LIBRARY_STORAGE_KEY, archivePageTree, clonePages, createBlankPage, createWorkspace, importWorkspaceLibrary, loadWorkspaceLibrary, movePageAcrossWorkspaces, movePageWithinWorkspace, normalizeWorkspace, pageTreeIds, purgePageTree, restorePageTree, trashPageTree, visiblePages } from "./workspaces";
import type { PageTemplate, StoredWorkspace, WorkspaceLibrary } from "./workspaces";
import { MovePageDialog, NewWorkspaceDialog, PageCollectionDialog, TemplateGallery, WorkspaceHome, WorkspaceSettingsDialog } from "./WorkspacePanels";
import "./App.css";

const PAGE_ICONS = ["📄", "📝", "💡", "📊", "📚", "🎯", "🗂️", "🧭", "🚀", "🌱", "✨", "🧩", "📅", "🧠", "🔖", "🏠", "🎙️", "✅"];
type Dialog = "settings" | "newWorkspace" | "templates" | "move" | "trash" | "archive" | null;

function bootLibrary(): { library: WorkspaceLibrary; error: string } {
  try { return { library: loadWorkspaceLibrary(window.localStorage), error: "" }; }
  catch (error) {
    const fallback = normalizeWorkspace(createInitialWorkspace());
    return { library: { version: 2, activeWorkspaceId: fallback.id, profileName: "Você", workspaces: [fallback] }, error: error instanceof Error ? error.message : "Não foi possível abrir os dados locais." };
  }
}

function downloadData(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pageAncestors(page: Page, pages: Page[]): Page[] {
  const ancestors: Page[] = [];
  const visited = new Set([page.id]);
  let current = pages.find((item) => item.id === page.parentId);
  while (current && !visited.has(current.id)) {
    ancestors.unshift(current); visited.add(current.id);
    current = pages.find((item) => item.id === current?.parentId);
  }
  return ancestors;
}

function getPageContent(page: Page): string {
  return [
    ...page.blocks.flatMap((block) => [block.text, block.details ?? "", block.caption ?? "", block.url ?? "",
      block.meeting?.agenda ?? "", block.meeting?.participants ?? "", block.meeting?.transcript ?? "", block.meeting?.summary ?? "",
      ...(block.meeting?.actionItems ?? []).flatMap((item) => [item.text, item.owner])]),
    ...(page.rows ?? []).flatMap((row) => [row.title, row.status, row.priority, row.assignee, row.category,
      ...Object.values(row.properties ?? {}).flatMap((value) => Array.isArray(value) ? value : [value === null ? "" : String(value)])]),
  ].join(" ").toLowerCase();
}

function App() {
  const [boot] = useState(bootLibrary);
  const [library, setLibrary] = useState<WorkspaceLibrary>(boot.library);
  const [loadError, setLoadError] = useState(boot.error);
  const libraryRef = useRef(library);
  const workspace = library.workspaces.find((item) => item.id === library.activeWorkspaceId) ?? library.workspaces[0];
  const setWorkspace = useCallback((update: StoredWorkspace | ((current: StoredWorkspace) => StoredWorkspace)) => {
    setLibrary((current) => ({
      ...current,
      workspaces: current.workspaces.map((item) => item.id === current.activeWorkspaceId ? typeof update === "function" ? update(item) : update : item),
    }));
  }, []);
  const [view, setView] = useState<"home" | "page">("home");
  const [persistedLibrary, setPersistedLibrary] = useState(library);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveState = saveFailed ? "error" : persistedLibrary === library ? "saved" : "saving";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<string[]>(["welcome"]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [movingPage, setMovingPage] = useState(false);
  const [panel, setPanel] = useState<"comments" | "history" | null>(null);
  const [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const revisionTimes = useRef(new Map<string, number>());
  const activePages = useMemo(() => visiblePages(workspace), [workspace]);
  const currentPage = workspace.pages.find((page) => page.id === workspace.activePageId) ?? activePages[0];
  const rootPages = activePages.filter((page) => !page.parentId || !activePages.some((parent) => parent.id === page.parentId));
  const favorites = workspace.favorites.map((id) => activePages.find((page) => page.id === id)).filter((page): page is Page => Boolean(page));
  const areaArchived = Boolean(currentPage?.teamspaceId && workspace.teamspaces.find((area) => area.id === currentPage.teamspaceId)?.archivedAt);
  const contentUnavailable = Boolean(currentPage?.deletedAt || currentPage?.archivedAt || areaArchived);
  const readOnly = Boolean(currentPage?.locked || contentUnavailable);

  useEffect(() => {
    if (loadError) return;
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library)); setPersistedLibrary(library); setSaveFailed(false); }
      catch { setSaveFailed(true); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [library, loadError]);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    const flush = () => { if (!loadError) { try { window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryRef.current)); } catch { /* The visible save indicator reports quota errors. */ } } };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [loadError]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    const visitHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const workspaceId = params.get("workspace"), pageId = params.get("page");
      if (!workspaceId || !pageId) return;
      const target = libraryRef.current.workspaces.find((item) => item.id === workspaceId && !item.archivedAt);
      if (!target?.pages.some((page) => page.id === pageId)) { setToast("Este link aponta para uma página que não está disponível neste navegador."); return; }
      setLibrary((current) => ({ ...current, activeWorkspaceId: workspaceId, workspaces: current.workspaces.map((item) => item.id === workspaceId ? { ...item, activePageId: pageId } : item) }));
      setView("page"); setPanel(null);
    };
    visitHash();
    window.addEventListener("hashchange", visitHash); window.addEventListener("popstate", visitHash);
    return () => { window.removeEventListener("hashchange", visitHash); window.removeEventListener("popstate", visitHash); };
  }, []);

  const closeMenus = () => { setWorkspaceMenuOpen(false); setPageMenuOpen(false); setIconPickerOpen(false); };
  const openDialog = (next: Dialog) => { closeMenus(); setDialog(next); setPanel(null); };
  const navigateHash = (workspaceId: string, pageId?: string) => {
    const hash = pageId ? "#workspace=" + encodeURIComponent(workspaceId) + "&page=" + encodeURIComponent(pageId) : "";
    if (window.location.hash !== hash) window.history.pushState(null, "", window.location.pathname + window.location.search + hash);
  };
  const selectPage = (id: string) => {
    setWorkspace((current) => ({ ...current, activePageId: id, recentPageIds: [id, ...current.recentPageIds.filter((item) => item !== id)].slice(0, 20) }));
    setView("page"); setSearchOpen(false); setMobileMenuOpen(false); setPanel(null); closeMenus();
    navigateHash(workspace.id, id);
  };
  const switchWorkspace = (id: string) => {
    setLibrary((current) => ({ ...current, activeWorkspaceId: id }));
    setView("home"); setPanel(null); closeMenus(); setMobileMenuOpen(false); setExpandedPages([]);
    navigateHash(id);
  };
  const addPage = (page: Page) => {
    setWorkspace((current) => ({ ...current, pages: [...current.pages, page], activePageId: page.id, recentPageIds: [page.id, ...current.recentPageIds].slice(0, 20) }));
    if (page.parentId) setExpandedPages((current) => current.includes(page.parentId!) ? current : [...current, page.parentId!]);
    setView("page"); setDialog(null); setPanel(null); closeMenus(); setSidebarOpen(true); setMobileMenuOpen(false);
    navigateHash(workspace.id, page.id);
  };
  const createPage = (kind: Page["kind"], parentId: string | null, teamspaceId: string | null = null) => {
    const parent = workspace.pages.find((page) => page.id === parentId);
    addPage(createBlankPage(kind, parentId, parent?.teamspaceId ?? teamspaceId));
  };
  const createMeeting = () => addPage({
    ...createBlankPage("document", null), title: "Nova reunião", icon: "🎙️",
    blocks: [{ id: makeId("block"), type: "meeting", text: "Nova reunião", meeting: createEmptyMeetingData() }],
  });
  const updatePage = (id: string, patch: Partial<Page>) => {
    const previous = workspace.pages.find((page) => page.id === id);
    if (previous && (previous.deletedAt || previous.archivedAt || workspace.teamspaces.some((area) => area.id === previous.teamspaceId && area.archivedAt))) return;
    if (previous?.locked && ["title", "icon", "blocks", "rows", "databaseProperties", "databaseViews"].some((key) => key in patch)) return;
    const key = workspace.id + ":" + id;
    if (previous && Date.now() - (revisionTimes.current.get(key) ?? 0) >= 60000) {
      revisionTimes.current.set(key, Date.now());
      void savePageRevision(workspace.id, previous, "Antes de editar").catch(() => setToast("As notas continuam salvas, mas não foi possível registrar uma versão histórica neste navegador."));
    }
    setWorkspace((current) => ({ ...current, pages: current.pages.map((page) => page.id === id ? { ...page, ...patch, updatedAt: new Date().toISOString() } : page) }));
  };
  const duplicatePage = (page: Page) => {
    const ids = pageTreeIds(workspace.pages, page.id);
    const sources = workspace.pages.filter((item) => ids.has(item.id) && !item.deletedAt);
    const copies = clonePages(sources);
    const root = copies[sources.findIndex((item) => item.id === page.id)];
    root.title = page.title + " (cópia)"; root.parentId = page.parentId;
    setWorkspace((current) => ({ ...current, pages: [...current.pages, ...copies], activePageId: root.id }));
    setView("page"); setPageMenuOpen(false); setPanel(null); navigateHash(workspace.id, root.id);
    setToast("Página e subpáginas duplicadas. Gravações de áudio não são copiadas.");
  };
  const toggleFavorite = (id: string) => setWorkspace((current) => ({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter((item) => item !== id) : [...current.favorites, id] }));
  const exportWorkspace = (all = false) => {
    downloadData(all ? library : workspace, (all ? "workspaces" : "workspace") + "-backup-" + new Date().toISOString().slice(0, 10) + ".json");
    closeMenus();
  };
  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const text = await file.text();
      if (/\.(md|markdown|txt)$/i.test(file.name)) { addPage(markdownToPage(text, file.name)); setToast("Documento importado como uma nova página."); }
      else {
        const parsed: unknown = JSON.parse(text);
        const next = importWorkspaceLibrary(libraryRef.current, parsed);
        setLibrary(next); setLoadError(""); setView("home"); setDialog(null);
        setToast("Backup adicionado como novos workspaces. Os espaços anteriores foram preservados.");
      }
      closeMenus();
    } catch (error) { setToast(error instanceof Error ? error.message : "Não foi possível importar este arquivo."); }
  };
  const useBuiltin = (template: BuiltinTemplate) => addPage(template.build());
  const useCustom = (template: PageTemplate) => addPage({ ...clonePages([template.page])[0], title: template.name, parentId: null, teamspaceId: null });
  const saveTemplate = () => {
    if (!currentPage) return;
    const page = clonePages([currentPage])[0]; page.parentId = null; page.teamspaceId = null;
    setWorkspace((current) => ({ ...current, templates: [...current.templates, { id: makeId("template"), name: currentPage.title || "Meu modelo", description: "", page }] }));
    closeMenus(); setToast("Modelo salvo. Ele já está disponível na galeria de modelos.");
  };
  const moveCurrentPage = async (targetId: string, parentId: string | null, teamspaceId: string | null): Promise<string | null> => {
    if (!currentPage) return "Escolha uma página.";
    setMovingPage(true);
    try {
      if (targetId === workspace.id) setWorkspace(movePageWithinWorkspace(workspace, currentPage.id, parentId, teamspaceId));
      else {
        const next = movePageAcrossWorkspaces(libraryRef.current, workspace.id, targetId, currentPage.id, parentId, teamspaceId);
        const ids = [...pageTreeIds(workspace.pages, currentPage.id)];
        await transferPageRevisions(workspace.id, targetId, ids);
        try { window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next)); }
        catch (error) { await transferPageRevisions(targetId, workspace.id, ids); throw error; }
        setLibrary(next); setPersistedLibrary(next); setSaveFailed(false);
      }
      setView("page"); setPanel(null); navigateHash(targetId, currentPage.id); setToast("Página e subpáginas movidas.");
      return null;
    } catch (error) { return error instanceof Error ? error.message : "Não foi possível mover a página."; }
    finally { setMovingPage(false); }
  };
  const trashCurrentPage = () => {
    if (!currentPage) return;
    void savePageRevision(workspace.id, currentPage, "Antes de enviar para a lixeira").catch(() => {});
    setWorkspace((current) => trashPageTree(current, currentPage.id)); setView("home"); setPanel(null); closeMenus(); navigateHash(workspace.id);
    setToast("Página e subpáginas movidas para a lixeira. As gravações foram preservadas.");
  };
  const purgePage = async (id: string) => {
    try {
      const result = purgePageTree(workspace, id);
      if (!window.confirm("Excluir definitivamente " + result.removed.length + " página(s), incluindo subpáginas, versões e gravações associadas? Esta ação não pode ser desfeita.")) return;
      await Promise.all(result.removed.flatMap((page) => [
        deletePageRevisions(workspace.id, page.id),
        ...page.blocks.filter((block) => block.type === "meeting").map((block) => deleteMeetingAudioForBlock(block.id)),
      ]));
      setLibrary((current) => ({ ...current, workspaces: current.workspaces.map((item) => item.id === workspace.id ? purgePageTree(item, id).workspace : item) }));
      setToast("Páginas e dados associados excluídos definitivamente.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Não foi possível concluir a exclusão."); }
  };
  const restoreRevision = async (snapshot: Page) => {
    if (!currentPage || readOnly) return;
    try {
      await savePageRevision(workspace.id, currentPage, "Antes de restaurar uma versão");
      updatePage(currentPage.id, { ...snapshot, id: currentPage.id, parentId: currentPage.parentId, teamspaceId: currentPage.teamspaceId, comments: currentPage.comments, createdAt: currentPage.createdAt, deletedAt: currentPage.deletedAt, deletionGroupId: currentPage.deletionGroupId, archivedAt: currentPage.archivedAt, archiveGroupId: currentPage.archiveGroupId });
      setPanel(null); setToast("Versão restaurada. A versão anterior continua no histórico.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Não foi possível preservar a versão atual. A restauração foi cancelada."); }
  };
  const archiveWorkspace = (id: string, archived: boolean) => {
    if (archived && library.workspaces.filter((item) => !item.archivedAt).length <= 1) return;
    setLibrary((current) => ({ ...current, activeWorkspaceId: archived && current.activeWorkspaceId === id ? current.workspaces.find((item) => item.id !== id && !item.archivedAt)!.id : current.activeWorkspaceId, workspaces: current.workspaces.map((item) => item.id === id ? { ...item, archivedAt: archived ? new Date().toISOString() : undefined } : item) }));
    if (id === workspace.id) { setView("home"); setPanel(null); }
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); }
      else if (event.key === "Escape" && !movingPage) { setSearchOpen(false); setDialog(null); setPanel(null); closeMenus(); }
      else if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); createPage("document", null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const searchResults = useMemo(() => {
    const pages = includeArchived ? workspace.pages.filter((page) => !page.deletedAt) : activePages;
    const query = searchQuery.trim().toLowerCase();
    return (query ? pages.filter((page) => (page.title + " " + getPageContent(page)).toLowerCase().includes(query)) : [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))).slice(0, 30);
  }, [workspace.pages, activePages, searchQuery, includeArchived]);
  const breadcrumbs = currentPage ? pageAncestors(currentPage, workspace.pages) : [];
  const cover = COVER_STYLES.find((item) => item.id === currentPage?.cover);
  const backlinks = currentPage ? activePages.filter((page) => page.id !== currentPage.id && page.blocks.some((block) => block.targetPageId === currentPage.id)) : [];
  const saveLabel = saveState === "saved" ? "Salvo" : saveState === "saving" ? "Salvando" : "Falha ao salvar";
  const avatar = (library.profileName.trim() || "V").slice(0, 1).toUpperCase();
  const pageActiveId = view === "page" ? currentPage?.id : undefined;

  return <div className={"app-shell" + (workspace.theme === "dark" ? " theme-dark" : "")}>
    <input ref={importInputRef} className="sr-only" type="file" accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain" onChange={importWorkspace} />
    {loadError ? <main className="app-recovery"><FolderTree size={40} /><h1>Seus dados precisam de atenção</h1><p>{loadError} Os dados salvos foram mantidos sem alterações.</p><div className="app-recovery-actions"><button className="workspace-secondary-button" type="button" onClick={() => downloadData(window.localStorage.getItem(LIBRARY_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "", "dados-locais-para-recuperar.json")}>Baixar dados salvos</button><button className="workspace-primary-button" type="button" onClick={() => importInputRef.current?.click()}>Importar um backup</button></div></main> : <>
      {mobileMenuOpen && <button className="mobile-sidebar-scrim" aria-label="Fechar barra lateral" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "sidebar-closed") + (mobileMenuOpen ? " sidebar-mobile-open" : "")}>
        <div className="sidebar-workspace-wrap">
          <button className="workspace-switcher" type="button" aria-label="Alternar workspace" onClick={() => setWorkspaceMenuOpen((open) => !open)}><span className="workspace-mark">{workspace.icon || "W"}</span><span className="workspace-name">{workspace.workspaceName || "Sem nome"}</span><ChevronDown size={15} className="workspace-chevron" /><span className="user-avatar">{avatar}</span></button>
          {workspaceMenuOpen && <div className="workspace-menu popover-menu"><div className="popover-account"><span className="user-avatar large">{avatar}</span><span><strong>{library.profileName || "Você"}</strong><small>Workspaces neste navegador</small></span></div><div className="popover-divider" /><div className="workspace-switcher-list">{library.workspaces.filter((item) => !item.archivedAt).map((item) => <button type="button" key={item.id} onClick={() => switchWorkspace(item.id)}><span>{item.icon}</span><span>{item.workspaceName || "Sem nome"}</span>{item.id === workspace.id && <Check size={14} />}</button>)}</div><div className="popover-divider" /><button type="button" onClick={() => openDialog("newWorkspace")}><Plus size={15} /> Criar workspace</button><button type="button" onClick={() => openDialog("settings")}><Settings2 size={15} /> Configurações</button><button type="button" onClick={() => exportWorkspace()}><ArrowDownToLine size={15} /> Exportar este workspace</button><button type="button" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Importar</button></div>}
        </div>
        <div className="sidebar-quick-actions">
          <button type="button" className={"sidebar-action" + (view === "home" ? " active" : "")} onClick={() => { setView("home"); setPanel(null); navigateHash(workspace.id); setMobileMenuOpen(false); }}><Home size={16} /><span>Início</span></button>
          <button type="button" className="sidebar-action" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Buscar</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="sidebar-action" onClick={createMeeting}><Mic size={16} /><span>Nova reunião</span></button>
          <button type="button" className="sidebar-action" onClick={() => createPage("document", null)}><FilePlus2 size={16} /><span>Nova página</span><kbd>Ctrl N</kbd></button>
          <button type="button" className="sidebar-action" onClick={() => createPage("database", null)}><Database size={16} /><span>Nova base de dados</span></button>
        </div>
        <div className="sidebar-pages-scroll">
          {favorites.length > 0 && <section className="sidebar-section"><div className="sidebar-section-title"><span>Favoritos</span></div>{favorites.map((page) => <SidebarPageRow key={"favorite-" + page.id} page={page} active={page.id === pageActiveId} depth={0} hasChildren={false} expanded={false} onSelect={() => selectPage(page.id)} onToggle={() => {}} onAddChild={() => createPage("document", page.id)} />)}</section>}
          {workspace.teamspaces.filter((area) => !area.archivedAt).map((area) => <section className="sidebar-section pages-section" key={area.id}><div className="sidebar-section-title"><span className="sidebar-area-heading"><span>{area.icon} {area.name}</span></span><button type="button" title={"Nova página em " + area.name} onClick={() => createPage("document", null, area.id)}><Plus size={14} /></button></div>{rootPages.filter((page) => page.teamspaceId === area.id).map((page) => renderPageTree(page, 0, activePages, expandedPages, pageActiveId, selectPage, (id) => setExpandedPages((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]), createPage))}</section>)}
          <section className="sidebar-section pages-section"><div className="sidebar-section-title"><span>Páginas pessoais</span><button type="button" title="Criar página" onClick={() => createPage("document", null)}><Plus size={14} /></button></div>{rootPages.filter((page) => !page.teamspaceId).length === 0 && <p className="sidebar-empty">Adicione sua primeira página.</p>}{rootPages.filter((page) => !page.teamspaceId).map((page) => renderPageTree(page, 0, activePages, expandedPages, pageActiveId, selectPage, (id) => setExpandedPages((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]), createPage))}</section>
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-action" type="button" onClick={() => openDialog("templates")}><LayoutTemplate size={15} /><span>Modelos</span></button>
          <button className="sidebar-action" type="button" onClick={() => openDialog("archive")}><Archive size={15} /><span>Arquivadas</span></button>
          <button className="sidebar-action" type="button" onClick={() => openDialog("trash")}><Trash2 size={15} /><span>Lixeira</span>{workspace.pages.filter((page) => page.deletedAt).length > 0 && <kbd>{workspace.pages.filter((page) => page.deletedAt).length}</kbd>}</button>
          <button className="sidebar-action" type="button" onClick={() => openDialog("settings")}><Settings2 size={15} /><span>Configurações</span></button>
          <div className="storage-status"><span className={"save-dot " + saveState} />{saveState === "saved" ? "Salvo neste navegador" : saveState === "saving" ? "Salvando…" : "Armazenamento cheio ou indisponível"}</div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="topbar-left"><button className="icon-button sidebar-toggle" type="button" aria-label={sidebarOpen ? "Recolher barra lateral" : "Abrir barra lateral"} onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button><button className="mobile-menu-button icon-button" type="button" aria-label="Abrir barra lateral" onClick={() => setMobileMenuOpen(true)}><Menu size={18} /></button><nav className="breadcrumbs" aria-label="Navegação estrutural">{view === "home" ? <span className="breadcrumb-current">Início</span> : <>{breadcrumbs.map((parent) => <span key={parent.id} className="breadcrumb-segment"><button type="button" onClick={() => selectPage(parent.id)}>{parent.title || "Sem título"}</button><ChevronRight size={13} /></span>)}<span className="breadcrumb-current">{currentPage?.title || "Sem título"}</span>{currentPage?.locked && <LockKeyhole size={12} />}</>}</nav></div><div className="topbar-right"><span className="save-status-top"><span className={"save-dot " + saveState} />{saveLabel}</span>
          {view === "page" && currentPage && <><button className="icon-button" type="button" aria-label="Comentários da página" disabled={contentUnavailable} onClick={() => { setPanel(panel === "comments" ? null : "comments"); setPageMenuOpen(false); }}><MessageSquare size={16} />{(currentPage.comments ?? []).filter((comment) => !comment.parentId && !comment.resolved).length > 0 && <span className="topbar-comments-count">{(currentPage.comments ?? []).filter((comment) => !comment.parentId && !comment.resolved).length}</span>}</button><button type="button" className="icon-button" aria-label={workspace.favorites.includes(currentPage.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => toggleFavorite(currentPage.id)}><Star size={16} fill={workspace.favorites.includes(currentPage.id) ? "currentColor" : "none"} className={workspace.favorites.includes(currentPage.id) ? "favorite-active" : ""} /></button><div className="page-menu-wrap"><button className="icon-button" type="button" aria-label="Opções da página" onClick={() => setPageMenuOpen((open) => !open)}><MoreHorizontal size={19} /></button>{pageMenuOpen && <div className="page-options-menu popover-menu">
            <button type="button" onClick={() => openDialog("move")} disabled={contentUnavailable}><FolderTree size={15} /> Mover página</button><button type="button" onClick={() => duplicatePage(currentPage)}><Copy size={15} /> Duplicar com subpáginas</button><button type="button" onClick={saveTemplate}><LayoutTemplate size={15} /> Salvar como modelo</button><button type="button" onClick={() => { setPanel("history"); closeMenus(); }}><History size={15} /> Histórico de versões</button><button type="button" onClick={() => { exportPageMarkdown(currentPage); closeMenus(); }}><ArrowDownToLine size={15} /> Exportar página em Markdown</button><button type="button" onClick={() => { void navigator.clipboard.writeText(window.location.origin + window.location.pathname + "#workspace=" + workspace.id + "&page=" + currentPage.id).then(() => setToast("Link local copiado. Ele abre esta página neste mesmo navegador e perfil.")).catch(() => setToast("O navegador não permitiu copiar o link.")); closeMenus(); }}><Link2 size={15} /> Copiar link local</button>
            <div className="popover-divider" /><fieldset className="page-action-controls content-editing-scope" disabled={contentUnavailable}><label>Fonte<select aria-label="Fonte da página" value={currentPage.font ?? "default"} onChange={(event) => updatePage(currentPage.id, { font: event.target.value as Page["font"] })}><option value="default">Padrão</option><option value="serif">Serifada</option><option value="mono">Monoespaçada</option></select></label>{[["fullWidth", "Largura total"], ["smallText", "Texto pequeno"], ["showOutline", "Mostrar sumário"]].map(([key, label]) => <label key={key}>{label}<input type="checkbox" checked={Boolean(currentPage[key as "fullWidth" | "smallText" | "showOutline"])} onChange={(event) => updatePage(currentPage.id, { [key]: event.target.checked })} /></label>)}<span>Capa</span><div className="page-cover-options">{COVER_STYLES.map((style) => <button className={currentPage.cover === style.id ? "selected" : ""} key={style.id} title={style.name} aria-label={"Capa " + style.name} style={{ background: style.background }} type="button" onClick={() => updatePage(currentPage.id, { cover: style.id })} />)}</div>{currentPage.cover && <button className="workspace-text-button" type="button" onClick={() => updatePage(currentPage.id, { cover: undefined })}>Remover capa</button>}</fieldset>
            <div className="popover-divider" /><button type="button" disabled={contentUnavailable} onClick={() => { updatePage(currentPage.id, { locked: !currentPage.locked }); closeMenus(); }}>{currentPage.locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}{currentPage.locked ? "Desbloquear página" : "Bloquear edição"}</button><button type="button" disabled={Boolean(currentPage.deletedAt)} onClick={() => { setWorkspace((current) => archivePageTree(current, currentPage.id, !currentPage.archivedAt)); closeMenus(); }}><Archive size={15} />{currentPage.archivedAt ? "Desarquivar página" : "Arquivar página"}</button>{!currentPage.deletedAt && <button className="danger-action" type="button" onClick={trashCurrentPage}><Trash2 size={15} /> Mover para a lixeira</button>}<p className="popover-note">{formatUpdatedAt(currentPage.updatedAt)}</p>
          </div>}</div></>}
        </div></header>
        {view === "home" ? <WorkspaceHome workspace={workspace} profileName={library.profileName} onSelect={selectPage} onNewPage={() => createPage("document", null)} onNewMeeting={createMeeting} onTemplates={() => openDialog("templates")} onSettings={() => openDialog("settings")} onUseTemplate={useBuiltin} /> : currentPage ? <main className={"page-canvas" + (currentPage.kind === "database" ? " database-canvas" : "") + (currentPage.fullWidth ? " page-full-width" : "") + (currentPage.smallText ? " page-small-text" : "") + " page-font-" + (currentPage.font ?? "default")}><div className="page-content">
          {cover && <div className="page-cover" style={{ background: cover.background }} />}
          {currentPage.deletedAt ? <div className="page-state-banner"><span><Trash2 size={15} /> Esta página está na lixeira.</span><button type="button" onClick={() => setWorkspace((current) => restorePageTree(current, currentPage.id))}>Restaurar página</button></div> : currentPage.archivedAt || areaArchived ? <div className="page-state-banner"><span><Archive size={15} /> {areaArchived ? "A área desta página está arquivada." : "Esta página está arquivada."}</span><button type="button" onClick={() => areaArchived ? openDialog("settings") : setWorkspace((current) => archivePageTree(current, currentPage.id, false))}>{areaArchived ? "Configurações da área" : "Desarquivar"}</button></div> : currentPage.locked && <div className="page-state-banner"><span><LockKeyhole size={15} /> A edição desta página está bloqueada.</span><button type="button" onClick={() => updatePage(currentPage.id, { locked: false })}>Desbloquear</button></div>}
          <div className="page-heading"><div className="page-icon-wrap"><button className="page-icon-button" type="button" aria-label="Alterar ícone da página" disabled={readOnly} onClick={() => setIconPickerOpen((open) => !open)}>{currentPage.icon}</button>{iconPickerOpen && <div className="icon-picker popover-menu" aria-label="Escolher ícone">{PAGE_ICONS.map((icon) => <button type="button" key={icon} onClick={() => { updatePage(currentPage.id, { icon }); setIconPickerOpen(false); }}>{icon}</button>)}</div>}</div><input className="page-title-input" value={currentPage.title} disabled={readOnly} aria-label="Título da página" placeholder="Sem título" onChange={(event) => updatePage(currentPage.id, { title: event.target.value })} /></div>
          {currentPage.showOutline && currentPage.blocks.some((block) => block.type.startsWith("heading")) && <nav className="page-outline" aria-label="Sumário da página"><strong>NESTA PÁGINA</strong>{currentPage.blocks.filter((block) => block.type.startsWith("heading")).map((block) => <button type="button" key={block.id} style={{ paddingLeft: block.type === "heading3" ? 18 : block.type === "heading2" ? 9 : 0 }} onClick={() => document.querySelector('[data-block-id="' + block.id + '"]')?.scrollIntoView({ behavior: "smooth", block: "center" })}>{block.text || "Sem título"}</button>)}</nav>}
          <fieldset className="content-editing-scope" disabled={readOnly}>
            {currentPage.kind === "database" ? <><div className="database-subtitle">Uma base de dados flexível para tarefas, projetos e ideias.</div><DatabaseView page={currentPage} allPages={activePages} onUpdateRows={(rows) => updatePage(currentPage.id, { rows })} onUpdateProperties={(databaseProperties) => updatePage(currentPage.id, { databaseProperties })} onUpdateViews={(databaseViews) => updatePage(currentPage.id, { databaseViews })} onUpdateActiveViewId={(activeDatabaseViewId) => updatePage(currentPage.id, { activeDatabaseViewId })} /></> : <><div className="page-editor-meta"><span>{formatUpdatedAt(currentPage.updatedAt)}</span></div><BlockEditor key={workspace.id + ":" + currentPage.id} blocks={currentPage.blocks} onChange={(blocks) => updatePage(currentPage.id, { blocks })} pages={activePages} onNavigate={selectPage} /></>}
          </fieldset>
          {backlinks.length > 0 && <div className="page-backlinks"><Link2 size={13} /><span>Referenciada em</span>{backlinks.map((page) => <button key={page.id} type="button" onClick={() => selectPage(page.id)}>{page.icon} {page.title || "Sem título"}</button>)}</div>}
        </div></main> : <main className="empty-workspace"><h1>Crie sua primeira página</h1><button className="workspace-primary-button" type="button" onClick={() => createPage("document", null)}><Plus size={15} /> Nova página</button></main>}
      </div>
      {dialog === "settings" && <WorkspaceSettingsDialog library={library} workspace={workspace} onUpdate={(patch) => setWorkspace((current) => ({ ...current, ...patch }))} onUpdateProfile={(name) => setLibrary((current) => ({ ...current, profileName: name }))} onSwitch={switchWorkspace} onArchiveWorkspace={archiveWorkspace} onNewWorkspace={() => setDialog("newWorkspace")} onExport={exportWorkspace} onImport={() => importInputRef.current?.click()} onClose={() => setDialog(null)} />}
      {dialog === "newWorkspace" && <NewWorkspaceDialog onClose={() => setDialog(null)} onCreate={(name, examples) => { const added = createWorkspace(name, examples); setLibrary((current) => ({ ...current, activeWorkspaceId: added.id, workspaces: [...current.workspaces, added] })); setView("home"); setDialog(null); setPanel(null); navigateHash(added.id); }} />}
      {dialog === "templates" && <TemplateGallery workspace={workspace} onUseBuiltin={useBuiltin} onUseCustom={useCustom} onClose={() => setDialog(null)} />}
      {dialog === "move" && currentPage && <MovePageDialog library={library} workspace={workspace} page={currentPage} onMove={moveCurrentPage} onClose={() => setDialog(null)} />}
      {(dialog === "trash" || dialog === "archive") && <PageCollectionDialog kind={dialog} workspace={workspace} onClose={() => setDialog(null)} onOpen={selectPage} onRestore={(id) => setWorkspace((current) => dialog === "trash" ? restorePageTree(current, id) : archivePageTree(current, id, false))} onPurge={(id) => void purgePage(id)} />}
      {panel === "comments" && currentPage && <PageCommentsPanel key={workspace.id + currentPage.id} page={currentPage} author={library.profileName.trim() || "Você"} onUpdate={(patch) => updatePage(currentPage.id, patch)} onClose={() => setPanel(null)} />}
      {panel === "history" && currentPage && <PageHistoryPanel key={workspace.id + currentPage.id} workspaceId={workspace.id} page={currentPage} readOnly={readOnly} onRestore={(snapshot) => void restoreRevision(snapshot)} onClose={() => setPanel(null)} />}
      {searchOpen && <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar no workspace"><label className="search-dialog-input-wrap"><Search size={19} /><input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchIndex(0); }} placeholder="Buscar páginas, tarefas e conteúdo…" aria-label="Buscar páginas e conteúdo" onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setSearchIndex((index) => Math.max(0, Math.min(index + 1, searchResults.length - 1))); } else if (event.key === "ArrowUp") { event.preventDefault(); setSearchIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter" && searchResults[searchIndex]) selectPage(searchResults[searchIndex].id); }} /><kbd>ESC</kbd></label><div className="search-result-heading">{searchQuery ? searchResults.length + " resultados" : "Acesso rápido"}<label className="search-include-archived"><input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); setSearchIndex(0); }} /> Incluir arquivadas</label></div><div className="search-result-list">{searchResults.map((page, index) => <button type="button" className={"search-result" + (index === searchIndex ? " is-keyboard-selected" : "")} key={page.id} onClick={() => selectPage(page.id)}><span className="search-result-icon">{page.kind === "database" ? <Database size={17} /> : page.icon}</span><span className="search-result-copy"><strong>{page.title || "Sem título"}</strong><small>{pageAncestors(page, workspace.pages).map((parent) => parent.title).join(" / ") || workspace.workspaceName}</small></span><span className="search-result-type">{page.archivedAt ? "Arquivada" : page.kind === "database" ? "Base de dados" : "Página"}</span></button>)}{searchResults.length === 0 && <div className="search-no-results"><Search size={21} /><strong>Nenhum resultado</strong><span>Tente outro termo de busca.</span></div>}</div><footer className="search-dialog-footer"><span><Command size={13} /> Busca neste workspace</span><span><kbd>↑</kbd><kbd>↓</kbd> para navegar · <kbd>↵</kbd> para abrir</span></footer></section></div>}
    </>}
    {toast && <div className="app-toast" role="status">{toast}<button type="button" aria-label="Fechar aviso" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}

function SidebarPageRow({ page, active, depth, hasChildren, expanded, onSelect, onToggle, onAddChild }: { page: Page; active: boolean; depth: number; hasChildren: boolean; expanded: boolean; onSelect: () => void; onToggle: () => void; onAddChild: () => void }) {
  return <div className={"sidebar-page-row" + (active ? " active" : "")} style={{ paddingLeft: 8 + Math.min(depth, 12) * 15 }}>
    <button className="sidebar-disclosure" type="button" aria-label={expanded ? "Recolher página" : "Expandir página"} onClick={hasChildren ? onToggle : onAddChild}>{hasChildren ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <Plus size={13} className="disclosure-plus" />}</button>
    <button className="sidebar-page-select" type="button" onClick={onSelect} title={page.title}><span className="sidebar-page-icon">{page.kind === "database" ? <Database size={14} /> : page.icon}</span><span className="sidebar-page-title">{page.title || "Sem título"}</span></button>
    <button className="sidebar-page-add" type="button" aria-label={"Adicionar subpágina a " + page.title} onClick={onAddChild}><Plus size={14} /></button>
  </div>;
}

function renderPageTree(page: Page, depth: number, pages: Page[], expanded: string[], activeId: string | undefined, selectPage: (id: string) => void, toggleExpanded: (id: string) => void, createPage: (kind: Page["kind"], parentId: string | null) => void): ReactElement {
  const children = depth < 50 ? pages.filter((item) => item.parentId === page.id && item.id !== page.id) : [];
  const isExpanded = expanded.includes(page.id);
  return <div className="sidebar-page-tree" key={page.id}><SidebarPageRow page={page} active={activeId === page.id} depth={depth} hasChildren={children.length > 0} expanded={isExpanded} onSelect={() => selectPage(page.id)} onToggle={() => toggleExpanded(page.id)} onAddChild={() => createPage("document", page.id)} />{children.length > 0 && isExpanded && children.map((child) => renderPageTree(child, depth + 1, pages, expanded, activeId, selectPage, toggleExpanded, createPage))}</div>;
}

export default App;
