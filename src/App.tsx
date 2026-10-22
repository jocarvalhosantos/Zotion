import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  FilePlus2,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Star,
  Sun,
  Upload,
} from "lucide-react";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "./DatabaseView";
import { createInitialWorkspace, formatUpdatedAt, makeId } from "./model";
import type { ContentBlock, Page, WorkspaceData } from "./model";
import "./App.css";

const STORAGE_KEY = "workspace-lab-v1";
const PAGE_ICONS = ["📄", "📝", "💡", "📊", "📚", "🎯", "🗂️", "🧭", "🚀", "🌱", "✨", "🧩", "📅", "🧠", "🔖", "🏠"];

function loadWorkspace(): WorkspaceData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialWorkspace();
    const parsed = JSON.parse(raw) as WorkspaceData;
    if (parsed.version === 1 && Array.isArray(parsed.pages) && parsed.pages.length > 0) return parsed;
  } catch {
    // Fall back to a clean starter workspace if this browser has invalid local data.
  }
  return createInitialWorkspace();
}

function getPageContent(page: Page): string {
  return [
    ...page.blocks.map((block) => block.text),
    ...(page.rows ?? []).flatMap((row) => [row.title, row.status, row.priority, row.assignee, row.category]),
  ].join(" ").toLowerCase();
}

function pageAncestors(page: Page, pages: Page[]): Page[] {
  const ancestors: Page[] = [];
  let current = page.parentId ? pages.find((item) => item.id === page.parentId) : undefined;
  while (current) {
    ancestors.unshift(current);
    current = current.parentId ? pages.find((item) => item.id === current?.parentId) : undefined;
  }
  return ancestors;
}

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(loadWorkspace);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPages, setExpandedPages] = useState<string[]>(["welcome"]);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const currentPage = workspace.pages.find((page) => page.id === workspace.activePageId) ?? workspace.pages[0];
  const rootPages = workspace.pages.filter((page) => page.parentId === null);
  const favorites = workspace.favorites.map((id) => workspace.pages.find((page) => page.id === id)).filter((page): page is Page => Boolean(page));

  useEffect(() => {
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
        setSaveState("saved");
      } catch {
        setSaveState("saved");
      }
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [workspace]);

  useEffect(() => {
    if (searchOpen) {
      setSearchQuery("");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
        setWorkspaceMenuOpen(false);
        setPageMenuOpen(false);
        setIconPickerOpen(false);
      } else if (!typing && event.key.toLowerCase() === "n" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        createPage("document", null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspace.pages.length]);

  const updatePage = (id: string, update: Partial<Page>) => {
    setWorkspace((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === id ? { ...page, ...update, updatedAt: new Date().toISOString() } : page),
    }));
  };

  const createPage = (kind: "document" | "database", parentId: string | null) => {
    const id = makeId(kind === "database" ? "database" : "page");
    const page: Page = {
      id,
      title: "Sem título",
      icon: kind === "database" ? "📊" : "📄",
      parentId,
      kind,
      blocks: kind === "document" ? [{ id: makeId("block"), type: "paragraph", text: "" }] : [],
      rows: kind === "database" ? [] : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setWorkspace((current) => ({ ...current, pages: [...current.pages, page], activePageId: id }));
    if (parentId) setExpandedPages((current) => current.includes(parentId) ? current : [...current, parentId]);
    setSidebarOpen(true);
    setMobileMenuOpen(false);
  };

  const duplicatePage = (page: Page) => {
    const id = makeId(page.kind === "database" ? "database" : "page");
    const duplicate: Page = {
      ...page,
      id,
      title: `${page.title} (cópia)`,
      blocks: page.blocks.map((block) => ({ ...block, id: makeId("block") })),
      rows: page.rows?.map((row) => ({ ...row, id: makeId("row") })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setWorkspace((current) => ({ ...current, pages: [...current.pages, duplicate], activePageId: id }));
    setPageMenuOpen(false);
  };

  const toggleFavorite = (id: string) => setWorkspace((current) => ({
    ...current,
    favorites: current.favorites.includes(id) ? current.favorites.filter((favorite) => favorite !== id) : [...current.favorites, id],
  }));

  const exportWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setWorkspaceMenuOpen(false);
  };

  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as WorkspaceData;
      if (parsed.version !== 1 || !Array.isArray(parsed.pages) || parsed.pages.length === 0) throw new Error("Backup incompatível");
      const activePageId = parsed.pages.some((page) => page.id === parsed.activePageId) ? parsed.activePageId : parsed.pages[0].id;
      setWorkspace({ ...parsed, activePageId });
      setWorkspaceMenuOpen(false);
    } catch {
      window.alert("Este arquivo não é um backup válido do espaço de trabalho.");
    }
  };

  const selectPage = (id: string) => {
    setWorkspace((current) => ({ ...current, activePageId: id }));
    setMobileMenuOpen(false);
    setSearchOpen(false);
    setPageMenuOpen(false);
  };

  const toggleExpanded = (id: string) => setExpandedPages((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return workspace.pages.slice(0, 6);
    return workspace.pages.filter((page) => `${page.title} ${getPageContent(page)}`.toLowerCase().includes(query)).slice(0, 12);
  }, [searchQuery, workspace.pages]);

  const breadcrumbs = currentPage ? pageAncestors(currentPage, workspace.pages) : [];
  const currentIsFavorite = currentPage ? workspace.favorites.includes(currentPage.id) : false;

  return (
    <div className={`app-shell ${workspace.theme === "dark" ? "theme-dark" : ""}`}>
      {mobileMenuOpen && <button className="mobile-sidebar-scrim" aria-label="Fechar barra lateral" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${mobileMenuOpen ? "sidebar-mobile-open" : ""}`}>
        <div className="sidebar-workspace-wrap">
          <button className="workspace-switcher" type="button" onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <span className="workspace-mark">W</span>
            <span className="workspace-name">{workspace.workspaceName}</span>
            <ChevronDown size={15} className="workspace-chevron" />
            <span className="user-avatar" title="Seu espaço de trabalho">W</span>
          </button>
          {workspaceMenuOpen && <div className="workspace-menu popover-menu">
            <div className="popover-account"><span className="user-avatar large">W</span><span><strong>Espaço local</strong><small>Somente neste navegador</small></span></div>
            <div className="popover-divider" />
            <button type="button" onClick={exportWorkspace}><ArrowDownToLine size={15} /> Exportar espaço de trabalho</button>
            <button type="button" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Importar backup</button>
            <button type="button" onClick={() => { setWorkspace((current) => ({ ...current, theme: current.theme === "light" ? "dark" : "light" })); setWorkspaceMenuOpen(false); }}>{workspace.theme === "light" ? <Moon size={15} /> : <Sun size={15} />} Aparência: {workspace.theme === "light" ? "clara" : "escura"}</button>
            <div className="popover-divider" />
            <p className="popover-note">As páginas ficam salvas neste navegador. Exporte um backup antes de apagar os dados do navegador.</p>
          </div>}
        </div>

        <div className="sidebar-quick-actions">
          <button type="button" className="sidebar-action" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Buscar</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="sidebar-action" onClick={() => createPage("document", null)}><FilePlus2 size={16} /><span>Nova página</span><kbd>Ctrl N</kbd></button>
          <button type="button" className="sidebar-action" onClick={() => createPage("database", null)}><Database size={16} /><span>Nova base de dados</span></button>
        </div>

        {favorites.length > 0 && <section className="sidebar-section">
          <div className="sidebar-section-title"><span>Favoritos</span><button type="button" title="Adicionar página aos favoritos" onClick={() => currentPage && toggleFavorite(currentPage.id)}><Plus size={14} /></button></div>
          {favorites.map((page) => <SidebarPageRow key={`favorite-${page.id}`} page={page} active={page.id === currentPage?.id} depth={0} hasChildren={false} expanded={false} onSelect={() => selectPage(page.id)} onToggle={() => {}} onAddChild={() => createPage("document", page.id)} />)}
        </section>}

        <section className="sidebar-section pages-section">
          <div className="sidebar-section-title"><span>Privado</span><button type="button" title="Criar página" onClick={() => createPage("document", null)}><Plus size={14} /></button></div>
          {rootPages.length === 0 && <p className="sidebar-empty">Suas páginas aparecerão aqui.</p>}
          {rootPages.map((page) => renderPageTree(page, 0, workspace.pages, expandedPages, currentPage?.id, selectPage, toggleExpanded, createPage))}
        </section>

        <div className="sidebar-bottom">
          <div className="storage-status"><span className={`save-dot ${saveState}`} />{saveState === "saved" ? "Salvo neste navegador" : "Salvando…"}</div>
          <button className="sidebar-action settings-shortcut" type="button" onClick={() => setWorkspaceMenuOpen((open) => !open)}><Settings2 size={15} /><span>Configurações do espaço</span></button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button sidebar-toggle" type="button" aria-label={sidebarOpen ? "Recolher barra lateral" : "Abrir barra lateral"} onClick={() => setSidebarOpen((open) => !open)}>
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
            <button className="mobile-menu-button icon-button" type="button" aria-label="Abrir barra lateral" onClick={() => setMobileMenuOpen(true)}><Menu size={18} /></button>
            <nav className="breadcrumbs" aria-label="Navegação estrutural">
              {breadcrumbs.map((parent) => <span key={parent.id} className="breadcrumb-segment"><button type="button" onClick={() => selectPage(parent.id)}>{parent.title}</button><ChevronRight size={13} /></span>)}
              <span className="breadcrumb-current">{currentPage?.title ?? "Espaço de trabalho"}</span>
              <ChevronDown size={13} className="breadcrumb-chevron" />
            </nav>
          </div>
          <div className="topbar-right">
            <span className="save-status-top"><span className={`save-dot ${saveState}`} />{saveState === "saved" ? "Salvo" : "Salvando"}</span>
            <button type="button" className="icon-button" title={currentIsFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-label={currentIsFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => currentPage && toggleFavorite(currentPage.id)}><Star size={16} fill={currentIsFavorite ? "currentColor" : "none"} className={currentIsFavorite ? "favorite-active" : ""} /></button>
            <div className="page-menu-wrap">
              <button type="button" className="icon-button" title="Opções da página" aria-label="Opções da página" onClick={() => setPageMenuOpen((open) => !open)}><MoreHorizontal size={19} /></button>
              {pageMenuOpen && currentPage && <div className="page-options-menu popover-menu">
                <button type="button" onClick={() => duplicatePage(currentPage)}><FilePlus2 size={15} /> Duplicar página</button>
                <button type="button" onClick={exportWorkspace}><ArrowDownToLine size={15} /> Exportar espaço de trabalho</button>
                <div className="popover-divider" /><p className="popover-note">{formatUpdatedAt(currentPage.updatedAt)}</p>
              </div>}
            </div>
          </div>
        </header>

        {currentPage ? <main className={`page-canvas ${currentPage.kind === "database" ? "database-canvas" : ""}`}>
          <div className="page-content">
            <div className="page-heading">
              <div className="page-icon-wrap">
                <button type="button" className="page-icon-button" aria-label="Alterar ícone da página" onClick={() => setIconPickerOpen((open) => !open)}>{currentPage.icon}</button>
                {iconPickerOpen && <div className="icon-picker popover-menu" aria-label="Escolher ícone da página">{PAGE_ICONS.map((icon) => <button type="button" key={icon} onClick={() => { updatePage(currentPage.id, { icon }); setIconPickerOpen(false); }}>{icon}</button>)}</div>}
              </div>
              <input className="page-title-input" value={currentPage.title} onChange={(event) => updatePage(currentPage.id, { title: event.target.value })} aria-label="Título da página" placeholder="Sem título" />
            </div>
            {currentPage.kind === "database" ? <>
              <div className="database-subtitle">Uma base de dados flexível para tarefas, projetos e ideias.</div>
              <DatabaseView page={currentPage} onUpdateRows={(rows) => updatePage(currentPage.id, { rows })} />
            </> : <>
              <div className="page-editor-meta"><span>{formatUpdatedAt(currentPage.updatedAt)}</span></div>
              <BlockEditor blocks={currentPage.blocks} onChange={(blocks: ContentBlock[]) => updatePage(currentPage.id, { blocks })} />
            </>}
          </div>
        </main> : <main className="empty-workspace"><div className="empty-workspace-icon">✦</div><h1>Seu espaço está pronto</h1><p>Crie uma página ou base de dados para começar.</p><button className="database-new-button" type="button" onClick={() => createPage("document", null)}><Plus size={15} /> Nova página</button></main>}
      </div>

      <input ref={importInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={importWorkspace} />

      {searchOpen && <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar no espaço de trabalho">
          <label className="search-dialog-input-wrap"><Search size={19} /><input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar páginas, tarefas e conteúdo…" aria-label="Buscar páginas e conteúdo" onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter" && searchResults[0]) selectPage(searchResults[0].id); }} /><kbd>ESC</kbd></label>
          <div className="search-result-heading">{searchQuery ? `${searchResults.length} resultados` : "Acesso rápido"}</div>
          <div className="search-result-list">
            {searchResults.map((page) => <button type="button" className="search-result" key={page.id} onClick={() => selectPage(page.id)}>
              <span className="search-result-icon">{page.kind === "database" ? <Database size={17} /> : <span>{page.icon}</span>}</span>
              <span className="search-result-copy"><strong>{page.title || "Sem título"}</strong><small>{pageAncestors(page, workspace.pages).map((item) => item.title).join(" / ") || workspace.workspaceName}</small></span>
              <span className="search-result-type">{page.kind === "database" ? "Base de dados" : "Página"}</span>
            </button>)}
            {searchResults.length === 0 && <div className="search-no-results"><Search size={21} /><strong>Nenhum resultado</strong><span>Tente outro termo de busca.</span></div>}
          </div>
          <footer className="search-dialog-footer"><span><Command size={13} /> Buscar no espaço de trabalho</span><span><kbd>↑</kbd><kbd>↓</kbd> para navegar <span>·</span> <kbd>↵</kbd> para abrir</span></footer>
        </section>
      </div>}
    </div>
  );
}

function SidebarPageRow({ page, active, depth, hasChildren, expanded, onSelect, onToggle, onAddChild }: {
  page: Page;
  active: boolean;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onAddChild: () => void;
}) {
  return <div className={`sidebar-page-row ${active ? "active" : ""}`} style={{ paddingLeft: `${8 + depth * 15}px` }}>
    <button className="sidebar-disclosure" type="button" aria-label={expanded ? "Recolher página" : "Expandir página"} onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(); else onAddChild(); }}>
      {hasChildren ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <Plus size={13} className="disclosure-plus" />}
    </button>
    <button className="sidebar-page-select" type="button" onClick={onSelect} title={page.title}>
      <span className="sidebar-page-icon">{page.kind === "database" ? <Database size={14} /> : page.icon}</span>
      <span className="sidebar-page-title">{page.title || "Sem título"}</span>
    </button>
    <button className="sidebar-page-add" type="button" aria-label={`Adicionar subpágina a ${page.title}`} title="Adicionar subpágina" onClick={onAddChild}><Plus size={14} /></button>
  </div>;
}

function renderPageTree(
  page: Page,
  depth: number,
  pages: Page[],
  expanded: string[],
  activeId: string | undefined,
  selectPage: (id: string) => void,
  toggleExpanded: (id: string) => void,
  createPage: (kind: "document" | "database", parentId: string | null) => void,
): ReactElement {
  const children = pages.filter((item) => item.parentId === page.id);
  const isExpanded = expanded.includes(page.id);
  return <div className="sidebar-page-tree" key={page.id}>
    <SidebarPageRow page={page} active={activeId === page.id} depth={depth} hasChildren={children.length > 0} expanded={isExpanded} onSelect={() => selectPage(page.id)} onToggle={() => toggleExpanded(page.id)} onAddChild={() => createPage("document", page.id)} />
    {children.length > 0 && isExpanded && children.map((child) => renderPageTree(child, depth + 1, pages, expanded, activeId, selectPage, toggleExpanded, createPage))}
  </div>;
}

export default App;
