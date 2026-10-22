import { useState } from "react";
import type { ReactNode } from "react";
import { Archive, ArrowDownToLine, ArrowRight, Check, ChevronRight, Clock3, Copy, FilePlus2, FolderTree, Home, LayoutTemplate, Plus, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import type { Page } from "./model";
import { makeId } from "./model";
import type { PageTemplate, StoredWorkspace, WorkspaceLibrary } from "./workspaces";
import { pageTreeIds, visiblePages } from "./workspaces";
import { BUILTIN_TEMPLATES } from "./templates";
import type { BuiltinTemplate } from "./templates";
import "./WorkspacePanels.css";

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="workspace-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className={"workspace-dialog" + (wide ? " workspace-dialog-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
      <header className="workspace-dialog-header"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Fechar janela" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function NewWorkspaceDialog({ onCreate, onClose }: { onCreate: (name: string, examples: boolean) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [examples, setExamples] = useState(false);
  return <Modal title="Criar workspace" onClose={onClose}>
    <form className="workspace-dialog-body workspace-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name, examples); }}>
      <div className="workspace-welcome-icon">🌿</div><p>Cada workspace reúne suas próprias páginas, áreas, favoritos e modelos.</p>
      <label>Nome do workspace<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Trabalho, Pessoal ou Estudos" required /></label>
      <label className="workspace-checkbox"><input type="checkbox" checked={examples} onChange={(event) => setExamples(event.target.checked)} /> Incluir páginas de exemplo</label>
      <p className="workspace-helper">Os espaços ficam neste navegador. Criar um workspace aqui não cria uma conta no Notion.</p>
      <button className="workspace-primary-button" type="submit" disabled={!name.trim()}><Plus size={15} /> Criar workspace</button>
    </form>
  </Modal>;
}

interface SettingsProps {
  library: WorkspaceLibrary;
  workspace: StoredWorkspace;
  onUpdate: (patch: Partial<StoredWorkspace>) => void;
  onUpdateProfile: (name: string) => void;
  onSwitch: (id: string) => void;
  onArchiveWorkspace: (id: string, archived: boolean) => void;
  onNewWorkspace: () => void;
  onExport: (all: boolean) => void;
  onImport: () => void;
  onClose: () => void;
}

export function WorkspaceSettingsDialog({ library, workspace, onUpdate, onUpdateProfile, onSwitch, onArchiveWorkspace, onNewWorkspace, onExport, onImport, onClose }: SettingsProps) {
  const [tab, setTab] = useState("general");
  const [newArea, setNewArea] = useState("");
  const activeCount = library.workspaces.filter((item) => !item.archivedAt).length;
  const updateArea = (id: string, patch: Partial<StoredWorkspace["teamspaces"][number]>) => onUpdate({ teamspaces: workspace.teamspaces.map((area) => area.id === id ? { ...area, ...patch } : area) });
  return <Modal title="Configurações" onClose={onClose} wide>
    <div className="workspace-settings-layout">
      <nav className="workspace-settings-nav" aria-label="Categorias de configuração">
        {[["general", "Geral"], ["workspaces", "Workspaces"], ["areas", "Áreas"], ["templates", "Modelos"], ["data", "Dados e backup"]].map(([id, label]) => <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="workspace-settings-content workspace-form">
        {tab === "general" && <>
          <h3>Seu perfil local</h3><label>Nome de exibição<input value={library.profileName} onChange={(event) => onUpdateProfile(event.target.value)} maxLength={80} /></label>
          <h3>Workspace</h3><div className="workspace-icon-name"><label>Ícone<input value={workspace.icon} onChange={(event) => onUpdate({ icon: event.target.value })} maxLength={8} /></label><label>Nome<input value={workspace.workspaceName} onChange={(event) => onUpdate({ workspaceName: event.target.value })} maxLength={80} /></label></div>
          <label>Descrição<textarea rows={3} value={workspace.description} onChange={(event) => onUpdate({ description: event.target.value })} placeholder="Para que este espaço é usado?" /></label>
          <label>Aparência<select value={workspace.theme} onChange={(event) => onUpdate({ theme: event.target.value as "light" | "dark" })}><option value="light">Clara</option><option value="dark">Escura</option></select></label>
          <p className="workspace-helper">As alterações são salvas automaticamente. Perfil e comentários são locais, sem convites ou compartilhamento com outras pessoas.</p>
        </>}
        {tab === "workspaces" && <>
          <h3>Seus workspaces</h3><p className="workspace-helper">Cada espaço tem conteúdo separado. Arquivar um workspace preserva suas páginas e áudios.</p>
          <div className="workspace-settings-list">{library.workspaces.map((item) => <div key={item.id} className="workspace-settings-list-row">
            <span className="workspace-list-icon">{item.icon}</span><span className="workspace-list-copy"><strong>{item.workspaceName || "Sem nome"}</strong><small>{item.pages.filter((page) => !page.deletedAt).length} páginas {item.archivedAt ? "· Arquivado" : ""}</small></span>
            {item.id === workspace.id && <Check size={15} className="workspace-current-check" />}
            {!item.archivedAt && item.id !== workspace.id && <button type="button" onClick={() => { onSwitch(item.id); onClose(); }}>Abrir</button>}
            {item.archivedAt ? <button type="button" onClick={() => onArchiveWorkspace(item.id, false)}>Restaurar</button> : <button type="button" title={activeCount <= 1 ? "Mantenha ao menos um workspace ativo" : "Arquivar workspace"} disabled={activeCount <= 1} onClick={() => onArchiveWorkspace(item.id, true)}><Archive size={14} /></button>}
          </div>)}</div>
          <button className="workspace-secondary-button" type="button" onClick={onNewWorkspace}><Plus size={15} /> Criar workspace</button>
        </>}
        {tab === "areas" && <>
          <h3>Áreas do workspace</h3><p className="workspace-helper">Organize conteúdo por equipe, assunto ou projeto. Nesta versão, áreas agrupam páginas e não controlam permissões de acesso.</p>
          <div className="workspace-settings-list">{workspace.teamspaces.map((area) => <div className={"workspace-area-editor" + (area.archivedAt ? " is-archived" : "")} key={area.id}>
            <div className="workspace-icon-name"><label>Ícone<input aria-label="Ícone da área" value={area.icon} maxLength={8} onChange={(event) => updateArea(area.id, { icon: event.target.value })} /></label><label>Nome<input aria-label="Nome da área" value={area.name} onChange={(event) => updateArea(area.id, { name: event.target.value })} maxLength={80} /></label></div>
            <label>Descrição<input value={area.description} onChange={(event) => updateArea(area.id, { description: event.target.value })} /></label>
            <button className="workspace-text-button" type="button" onClick={() => updateArea(area.id, { archivedAt: area.archivedAt ? undefined : new Date().toISOString() })}>{area.archivedAt ? <><RotateCcw size={14} /> Restaurar área</> : <><Archive size={14} /> Arquivar área</>}</button>
          </div>)}</div>
          <form className="workspace-inline-form" onSubmit={(event) => { event.preventDefault(); if (!newArea.trim()) return; onUpdate({ teamspaces: [...workspace.teamspaces, { id: makeId("teamspace"), name: newArea.trim(), icon: "🗂️", description: "" }] }); setNewArea(""); }}>
            <input aria-label="Nome da nova área" value={newArea} onChange={(event) => setNewArea(event.target.value)} placeholder="Nome da nova área" maxLength={80} /><button className="workspace-secondary-button" type="submit" disabled={!newArea.trim()}><Plus size={14} /> Criar</button>
          </form>
        </>}
        {tab === "templates" && <>
          <h3>Modelos salvos</h3><p className="workspace-helper">Use “Salvar como modelo” no menu de uma página para reutilizar sua estrutura. As cópias ganham novos identificadores; áudios não são duplicados.</p>
          {workspace.templates.length === 0 && <div className="workspace-empty-panel"><LayoutTemplate size={25} /><span>Nenhum modelo próprio ainda.</span></div>}
          {workspace.templates.map((template) => <div className="workspace-template-editor" key={template.id}>
            <label>Nome<input value={template.name} onChange={(event) => onUpdate({ templates: workspace.templates.map((item) => item.id === template.id ? { ...item, name: event.target.value } : item) })} /></label>
            <label>Descrição<input value={template.description} onChange={(event) => onUpdate({ templates: workspace.templates.map((item) => item.id === template.id ? { ...item, description: event.target.value } : item) })} /></label>
            <button className="workspace-text-button danger-action" type="button" onClick={() => { if (window.confirm("Excluir este modelo? As páginas criadas a partir dele permanecerão.")) onUpdate({ templates: workspace.templates.filter((item) => item.id !== template.id) }); }}><Trash2 size={14} /> Excluir modelo</button>
          </div>)}
        </>}
        {tab === "data" && <>
          <h3>Dados neste navegador</h3><div className="workspace-data-stats"><span><strong>{workspace.pages.length}</strong> páginas</span><span><strong>{workspace.teamspaces.length}</strong> áreas</span><span><strong>{(new Blob([JSON.stringify(library)]).size / 1024).toFixed(0)} KB</strong> de notas</span></div>
          <button className="workspace-secondary-button" type="button" onClick={() => onExport(false)}><ArrowDownToLine size={15} /> Exportar este workspace</button>
          <button className="workspace-secondary-button" type="button" onClick={() => onExport(true)}><Copy size={15} /> Exportar todos os workspaces</button>
          <button className="workspace-secondary-button" type="button" onClick={onImport}><Upload size={15} /> Importar JSON, Markdown ou texto</button>
          <p className="workspace-helper">A importação de JSON adiciona novos workspaces e preserva os existentes. Markdown e texto criam uma página no espaço atual.</p>
          <p className="workspace-helper">O backup JSON inclui páginas, lixeira, áreas, modelos e comentários. Áudios e versões históricas ficam separados no navegador: baixe os áudios nos blocos de reunião. Os dados não são sincronizados entre dispositivos.</p>
        </>}
      </div>
    </div>
  </Modal>;
}

export function WorkspaceHome({ workspace, profileName, onSelect, onNewPage, onNewMeeting, onTemplates, onSettings, onUseTemplate }: {
  workspace: StoredWorkspace; profileName: string; onSelect: (id: string) => void; onNewPage: () => void; onNewMeeting: () => void; onTemplates: () => void; onSettings: () => void; onUseTemplate: (template: BuiltinTemplate) => void;
}) {
  const pages = visiblePages(workspace);
  const recent = workspace.recentPageIds.map((id) => pages.find((page) => page.id === id)).filter((page): page is Page => Boolean(page));
  const cards = recent.length ? recent.slice(0, 8) : [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  return <main className="workspace-home">
    <div className="workspace-home-eyebrow"><Home size={14} /> {workspace.workspaceName}</div>
    <h1>Olá, {profileName.trim() || "você"}.</h1><p className="workspace-home-description">{workspace.description || "Um espaço para organizar ideias e acompanhar o que importa."}</p>
    <div className="workspace-home-actions"><button type="button" onClick={onNewPage}><FilePlus2 size={17} /><span>Nova página</span><ArrowRight size={14} /></button><button type="button" onClick={onNewMeeting}><Clock3 size={17} /><span>Nova reunião</span><ArrowRight size={14} /></button><button type="button" onClick={onTemplates}><LayoutTemplate size={17} /><span>Usar um modelo</span><ArrowRight size={14} /></button></div>
    <div className="workspace-home-section-title"><h2><Clock3 size={15} /> {recent.length ? "Acessadas recentemente" : "Suas páginas"}</h2><span>{pages.length} páginas</span></div>
    {cards.length ? <div className="workspace-recent-grid">{cards.map((page) => <button key={page.id} className="workspace-recent-card" type="button" onClick={() => onSelect(page.id)}><span>{page.icon}</span><strong>{page.title || "Sem título"}</strong><small>{page.kind === "database" ? "Base de dados" : "Página"} · {new Date(page.updatedAt).toLocaleDateString("pt-BR")}</small></button>)}</div> : <div className="workspace-empty-panel"><FilePlus2 size={28} /><strong>Este espaço está pronto.</strong><span>Crie uma página ou comece com um modelo.</span></div>}
    <div className="workspace-home-section-title"><h2><FolderTree size={15} /> Áreas de trabalho</h2><button type="button" onClick={onSettings}>Gerenciar <ChevronRight size={12} /></button></div>
    <div className="workspace-area-grid">{workspace.teamspaces.filter((area) => !area.archivedAt).map((area) => {
      const roots = pages.filter((page) => page.teamspaceId === area.id && !page.parentId);
      return <article className="workspace-area-card" key={area.id}><span>{area.icon}</span><h3>{area.name}</h3><p>{area.description || "Páginas organizadas neste assunto."}</p>{roots.slice(0, 3).map((page) => <button type="button" key={page.id} onClick={() => onSelect(page.id)}>{page.icon} {page.title || "Sem título"}</button>)}<small>{pages.filter((page) => page.teamspaceId === area.id).length} páginas</small></article>;
    })}{workspace.teamspaces.filter((area) => !area.archivedAt).length === 0 && <button className="workspace-new-area-card" type="button" onClick={onSettings}><Plus size={18} /><span>Crie áreas para organizar seus projetos</span></button>}</div>
    <div className="workspace-home-section-title"><h2><LayoutTemplate size={15} /> Comece com uma estrutura</h2><button type="button" onClick={onTemplates}>Ver todos <ChevronRight size={12} /></button></div>
    <div className="workspace-template-grid">{BUILTIN_TEMPLATES.slice(0, 4).map((template) => <button type="button" className="workspace-template-card" key={template.id} onClick={() => onUseTemplate(template)}><span>{template.icon}</span><strong>{template.title}</strong><small>{template.description}</small></button>)}</div>
  </main>;
}

export function TemplateGallery({ workspace, onUseBuiltin, onUseCustom, onClose }: { workspace: StoredWorkspace; onUseBuiltin: (template: BuiltinTemplate) => void; onUseCustom: (template: PageTemplate) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const matches = (text: string) => text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  return <Modal title="Modelos para começar" onClose={onClose} wide>
    <div className="workspace-dialog-body"><label className="workspace-search-input"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar modelos…" /></label>
      {workspace.templates.length > 0 && <><h3 className="workspace-model-heading">Seus modelos</h3><div className="workspace-template-grid">{workspace.templates.filter((template) => matches(template.name + " " + template.description)).map((template) => <button className="workspace-template-card" type="button" key={template.id} onClick={() => onUseCustom(template)}><span>{template.page.icon}</span><strong>{template.name}</strong><small>{template.description || "Modelo salvo neste workspace"}</small></button>)}</div></>}
      <h3 className="workspace-model-heading">Modelos do Workspace Lab</h3><div className="workspace-template-grid">{BUILTIN_TEMPLATES.filter((template) => matches(template.title + " " + template.category + " " + template.description)).map((template) => <button className="workspace-template-card" type="button" key={template.id} onClick={() => onUseBuiltin(template)}><span>{template.icon}</span><strong>{template.title}</strong><small>{template.description}</small><em>{template.category}</em></button>)}</div>
    </div>
  </Modal>;
}

export function MovePageDialog({ library, workspace, page, onMove, onClose }: { library: WorkspaceLibrary; workspace: StoredWorkspace; page: Page; onMove: (workspaceId: string, parentId: string | null, teamspaceId: string | null) => Promise<string | null>; onClose: () => void }) {
  const [workspaceId, setWorkspaceId] = useState(workspace.id);
  const [parentId, setParentId] = useState(page.parentId ?? "");
  const [teamspaceId, setTeamspaceId] = useState(page.teamspaceId ?? "");
  const [error, setError] = useState("");
  const target = library.workspaces.find((item) => item.id === workspaceId)!;
  const excluded = workspace.id === workspaceId ? pageTreeIds(workspace.pages, page.id) : new Set<string>();
  const [moving, setMoving] = useState(false);
  return <Modal title="Mover página" onClose={() => { if (!moving) onClose(); }}><form className="workspace-dialog-body workspace-form" onSubmit={async (event) => { event.preventDefault(); if (moving) return; setMoving(true); const result = await onMove(workspaceId, parentId || null, teamspaceId || null); setMoving(false); if (result) setError(result); else onClose(); }}><fieldset className="content-editing-scope" disabled={moving}>
    <p><strong>{page.icon} {page.title || "Sem título"}</strong> e suas subpáginas serão movidas juntas.</p>
    <label>Workspace<select value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setParentId(""); setTeamspaceId(""); setError(""); }}>{library.workspaces.filter((item) => !item.archivedAt).map((item) => <option key={item.id} value={item.id}>{item.workspaceName}</option>)}</select></label>
    <label>Dentro de<select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Raiz do workspace</option>{visiblePages(target).filter((item) => !excluded.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.icon} {item.title || "Sem título"}</option>)}</select></label>
    {!parentId && <label>Área<select value={teamspaceId} onChange={(event) => setTeamspaceId(event.target.value)}><option value="">Páginas pessoais</option>{target.teamspaces.filter((area) => !area.archivedAt).map((area) => <option key={area.id} value={area.id}>{area.icon} {area.name}</option>)}</select></label>}
    {error && <p className="workspace-error" role="alert">{error}</p>}<button className="workspace-primary-button" type="submit"><FolderTree size={15} /> {moving ? "Movendo…" : "Mover página"}</button>
  </fieldset></form></Modal>;
}

export function PageCollectionDialog({ kind, workspace, onRestore, onPurge, onOpen, onClose }: { kind: "trash" | "archive"; workspace: StoredWorkspace; onRestore: (id: string) => void; onPurge: (id: string) => void; onOpen: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const entries = workspace.pages.filter((page) => kind === "trash" ? Boolean(page.deletedAt) : Boolean(page.archivedAt) && !page.deletedAt)
    .filter((page) => (page.title || "Sem título").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.deletedAt ?? b.archivedAt ?? "").localeCompare(a.deletedAt ?? a.archivedAt ?? ""));
  return <Modal title={kind === "trash" ? "Lixeira" : "Páginas arquivadas"} onClose={onClose} wide><div className="workspace-dialog-body">
    <label className="workspace-search-input"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar páginas…" /></label>
    <p className="workspace-helper">{kind === "trash" ? "As páginas ficam aqui até você restaurar ou excluir definitivamente. Subpáginas e gravações são preservadas na lixeira." : "Páginas arquivadas continuam disponíveis para consulta. Restaure-as para voltar a editar."}</p>
    {!entries.length && <div className="workspace-empty-panel">{kind === "trash" ? <Trash2 size={28} /> : <Archive size={28} />}<span>{query ? "Nenhuma página encontrada." : "Nenhuma página aqui."}</span></div>}
    <div className="workspace-collection-list">{entries.map((page) => <div className="workspace-collection-row" key={page.id}>
      <button type="button" className="workspace-collection-page" onClick={() => { onOpen(page.id); onClose(); }}><span>{page.icon}</span><span><strong>{page.title || "Sem título"}</strong><small>{workspace.pages.find((item) => item.id === page.parentId)?.title || "Raiz do workspace"}</small></span></button>
      <button className="workspace-secondary-button" type="button" onClick={() => onRestore(page.id)}><RotateCcw size={14} /> Restaurar</button>
      {kind === "trash" && <button className="icon-button danger-action" type="button" aria-label={"Excluir definitivamente " + (page.title || "Sem título")} onClick={() => onPurge(page.id)}><Trash2 size={15} /></button>}
    </div>)}</div>
  </div></Modal>;
}
