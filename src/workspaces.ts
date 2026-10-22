import { createDefaultDatabaseView, createEmptyMeetingData, createInitialWorkspace, makeId } from "./model";
import type { ContentBlock, Page, WorkspaceData } from "./model";

export interface Teamspace {
  id: string;
  name: string;
  icon: string;
  description: string;
  archivedAt?: string;
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  page: Page;
}

export interface StoredWorkspace extends WorkspaceData {
  id: string;
  icon: string;
  description: string;
  teamspaces: Teamspace[];
  templates: PageTemplate[];
  recentPageIds: string[];
  archivedAt?: string;
}

export interface WorkspaceLibrary {
  version: 2;
  activeWorkspaceId: string;
  profileName: string;
  workspaces: StoredWorkspace[];
}

export const LIBRARY_STORAGE_KEY = "workspace-lab-library-v2";
export const LEGACY_STORAGE_KEY = "workspace-lab-v1";
export const COVER_STYLES = [
  { id: "sand", name: "Areia", background: "linear-gradient(125deg,#e9cbaa,#f1dfb5 46%,#b3c8b5)" },
  { id: "ocean", name: "Oceano", background: "linear-gradient(125deg,#183c55,#4c93a4 48%,#bbd9cd)" },
  { id: "sunset", name: "Pôr do sol", background: "linear-gradient(125deg,#a85c67,#df9e83 48%,#f0cf91)" },
  { id: "forest", name: "Floresta", background: "linear-gradient(125deg,#254d40,#71967b 48%,#c8d2ae)" },
  { id: "lavender", name: "Lavanda", background: "linear-gradient(125deg,#655e8c,#aaa1cb 48%,#ded6e5)" },
  { id: "ink", name: "Tinta", background: "linear-gradient(125deg,#282d34,#555a62 48%,#a6a4a0)" },
];

const BLOCK_TYPES = new Set(["paragraph", "heading1", "heading2", "heading3", "bulleted", "numbered", "todo", "quote", "callout", "code", "divider", "meeting", "toggle", "image", "bookmark", "pageLink"]);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const now = () => new Date().toISOString();

export function normalizeWorkspace(value: unknown, fallbackId = "workspace-legacy"): StoredWorkspace {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.pages)) throw new Error("Formato de workspace incompatível.");
  const seenIds = new Set<string>();
  const pages = value.pages.map((item): Page => {
    if (!isObject(item) || !Array.isArray(item.blocks)) throw new Error("Uma página do backup está incompleta.");
    const id = asString(item.id) || makeId("page");
    if (seenIds.has(id)) throw new Error("O backup contém páginas com identificadores repetidos.");
    seenIds.add(id);
    const blocks: ContentBlock[] = item.blocks.map((raw) => {
      if (!isObject(raw) || !BLOCK_TYPES.has(asString(raw.type))) throw new Error("O backup contém um tipo de bloco desconhecido.");
      const block = { ...raw, id: asString(raw.id) || makeId("block"), text: asString(raw.text), type: raw.type } as ContentBlock;
      if (block.type === "meeting") {
        const meeting = isObject(raw.meeting) ? raw.meeting : {};
        block.meeting = {
          ...createEmptyMeetingData(),
          agenda: asString(meeting.agenda), participants: asString(meeting.participants),
          transcript: asString(meeting.transcript), summary: asString(meeting.summary),
          actionItems: (Array.isArray(meeting.actionItems) ? meeting.actionItems : []).map((action) => {
            if (!isObject(action)) throw new Error("Um item de ação da reunião está incompleto.");
            return { id: asString(action.id) || makeId("action"), text: asString(action.text), owner: asString(action.owner), done: Boolean(action.done) };
          }),
        };
      }
      return block;
    });
    return {
      ...item,
      id,
      title: asString(item.title, "Sem título"),
      icon: asString(item.icon, "📄"),
      kind: item.kind === "database" ? "database" : "document",
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      blocks,
      rows: item.kind === "database" ? (Array.isArray(item.rows) ? item.rows : []).map((row) => {
        if (!isObject(row) || typeof row.id !== "string") throw new Error("Uma linha da base de dados está incompleta.");
        if (row.properties !== undefined && !isObject(row.properties)) throw new Error("Uma linha contém propriedades inválidas.");
        return { ...row, title: asString(row.title), status: asString(row.status, "Not started"), priority: asString(row.priority, "Medium"), dueDate: asString(row.dueDate), assignee: asString(row.assignee), category: asString(row.category) };
      }) : undefined,
      comments: Array.isArray(item.comments) ? item.comments.filter((comment) => isObject(comment) && typeof comment.text === "string" && typeof comment.id === "string").map((comment) => ({ ...comment, author: asString(comment.author, "Você"), createdAt: asString(comment.createdAt, now()) })) : [],
      createdAt: asString(item.createdAt, now()),
      updatedAt: asString(item.updatedAt, now()),
    } as Page;
  });
  for (const page of pages) {
    const visited = new Set([page.id]);
    let parent = page.parentId;
    while (parent) {
      if (visited.has(parent) || !seenIds.has(parent)) { page.parentId = null; break; }
      visited.add(parent);
      parent = pages.find((candidate) => candidate.id === parent)?.parentId ?? null;
    }
  }
  const raw = value as unknown as Partial<StoredWorkspace>;
  const teamspaces = (Array.isArray(raw.teamspaces) ? raw.teamspaces : []).filter((space) => isObject(space) && typeof space.id === "string" && typeof space.name === "string");
  for (const page of pages) {
    if (page.teamspaceId && !teamspaces.some((space) => space.id === page.teamspaceId)) page.teamspaceId = null;
  }
  return {
    ...raw,
    version: 1,
    id: asString(raw.id, fallbackId),
    workspaceName: asString(raw.workspaceName, "Meu espaço de trabalho"),
    icon: asString(raw.icon, "W"),
    description: asString(raw.description),
    pages,
    activePageId: pages.some((page) => page.id === raw.activePageId) ? raw.activePageId! : pages[0]?.id ?? "",
    favorites: (Array.isArray(raw.favorites) ? raw.favorites : []).filter((id) => seenIds.has(id)),
    recentPageIds: (Array.isArray(raw.recentPageIds) ? raw.recentPageIds : []).filter((id) => seenIds.has(id)).slice(0, 20),
    theme: raw.theme === "dark" ? "dark" : "light",
    teamspaces,
    templates: (Array.isArray(raw.templates) ? raw.templates : []).filter((template) => template && typeof template.name === "string" && template.page && Array.isArray(template.page.blocks)),
  };
}

export function loadWorkspaceLibrary(storage: Pick<Storage, "getItem">): WorkspaceLibrary {
  const stored = storage.getItem(LIBRARY_STORAGE_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (!isObject(parsed) || parsed.version !== 2 || !Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) throw new Error("A biblioteca salva está incompleta. Importe um backup para recuperar seus dados.");
    const workspaces = parsed.workspaces.map((item) => normalizeWorkspace(item, makeId("workspace")));
    if (new Set(workspaces.map((workspace) => workspace.id)).size !== workspaces.length) throw new Error("A biblioteca contém workspaces repetidos.");
    return {
      version: 2,
      activeWorkspaceId: workspaces.some((workspace) => workspace.id === parsed.activeWorkspaceId && !workspace.archivedAt)
        ? asString(parsed.activeWorkspaceId)
        : (workspaces.find((workspace) => !workspace.archivedAt) ?? workspaces[0]).id,
      profileName: asString(parsed.profileName, "Você"),
      workspaces,
    };
  }
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  const first = normalizeWorkspace(legacy ? JSON.parse(legacy) : createInitialWorkspace());
  return { version: 2, activeWorkspaceId: first.id, profileName: "Você", workspaces: [first] };
}

export function visiblePages(workspace: StoredWorkspace): Page[] {
  const hiddenSpaces = new Set(workspace.teamspaces.filter((space) => space.archivedAt).map((space) => space.id));
  return workspace.pages.filter((page) => !page.deletedAt && !page.archivedAt && !hiddenSpaces.has(page.teamspaceId ?? ""));
}

export function pageTreeIds(pages: Page[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) { ids.add(page.id); changed = true; }
    }
  }
  return ids;
}

/** Copies content with fresh page/block/row/group IDs; audio blobs and comments are not copied. */
export function clonePages(pages: Page[]): Page[] {
  const pageIds = new Map(pages.map((page) => [page.id, makeId(page.kind === "database" ? "database" : "page")]));
  const rowIds = new Map(pages.flatMap((page) => (page.rows ?? []).map((row) => [row.id, makeId("row")] as const)));
  const groupIds = new Map<string, string>();
  return pages.map((source) => {
    const page = structuredClone(source);
    const databaseViews = page.databaseViews?.map((view) => ({ ...view, id: makeId("view") }));
    const viewIndex = page.databaseViews?.findIndex((view) => view.id === page.activeDatabaseViewId) ?? 0;
    return {
      ...page,
      id: pageIds.get(page.id)!,
      parentId: pageIds.get(page.parentId ?? "") ?? null,
      blocks: page.blocks.map((block) => {
        if (block.groupId && !groupIds.has(block.groupId)) groupIds.set(block.groupId, makeId("group"));
        return {
          ...block, id: makeId("block"),
          groupId: block.groupId ? groupIds.get(block.groupId) : undefined,
          targetPageId: pageIds.get(block.targetPageId ?? "") ?? block.targetPageId,
          meeting: block.meeting ? { ...block.meeting, actionItems: block.meeting.actionItems.map((item) => ({ ...item, id: makeId("action") })) } : undefined,
        };
      }),
      rows: page.rows?.map((row) => ({
        ...row, id: rowIds.get(row.id)!,
        properties: Object.fromEntries(Object.entries(row.properties ?? {}).map(([key, value]) => [
          key, Array.isArray(value)
            ? page.databaseProperties?.find((property) => property.id === key)?.type === "Relation"
              ? value.map((item) => rowIds.get(item) ?? item)
              : [...value]
            : value,
        ])),
      })),
      databaseProperties: page.databaseProperties?.map((property) => ({
        ...property, relationDatabaseId: pageIds.get(property.relationDatabaseId ?? "") ?? property.relationDatabaseId,
      })),
      databaseViews,
      activeDatabaseViewId: databaseViews?.[Math.max(0, viewIndex)]?.id,
      comments: [],
      locked: false,
      deletedAt: undefined, deletionGroupId: undefined, archivedAt: undefined, archiveGroupId: undefined,
      createdAt: now(), updatedAt: now(),
    };
  });
}

export function createWorkspace(name: string, withExamples = false): StoredWorkspace {
  const seed = createInitialWorkspace();
  const pages = withExamples ? clonePages(seed.pages) : [];
  return {
    ...seed, id: makeId("workspace"), workspaceName: name.trim() || "Novo workspace",
    icon: "🌿", description: "", pages, activePageId: pages[0]?.id ?? "", favorites: [],
    recentPageIds: [], teamspaces: [], templates: [],
  };
}

export function createBlankPage(kind: Page["kind"], parentId: string | null, teamspaceId: string | null = null): Page {
  return {
    id: makeId(kind === "database" ? "database" : "page"), title: "Sem título", icon: kind === "database" ? "📊" : "📄",
    parentId, teamspaceId, kind, blocks: kind === "document" ? [{ id: makeId("block"), type: "paragraph", text: "" }] : [],
    rows: kind === "database" ? [] : undefined,
    databaseProperties: kind === "database" ? [] : undefined,
    databaseViews: kind === "database" ? [createDefaultDatabaseView()] : undefined,
    createdAt: now(), updatedAt: now(),
  };
}

export function movePageWithinWorkspace(workspace: StoredWorkspace, pageId: string, parentId: string | null, teamspaceId: string | null): StoredWorkspace {
  const ids = pageTreeIds(workspace.pages, pageId);
  if (parentId && ids.has(parentId)) throw new Error("Uma página não pode ficar dentro dela mesma ou de uma de suas subpáginas.");
  const parent = parentId ? visiblePages(workspace).find((page) => page.id === parentId) : undefined;
  if (parentId && !parent) throw new Error("A página de destino não está disponível.");
  const destinationSpace = parent ? parent.teamspaceId ?? null : teamspaceId;
  return {
    ...workspace,
    pages: workspace.pages.map((page) => ids.has(page.id)
      ? { ...page, teamspaceId: destinationSpace, parentId: page.id === pageId ? parentId : page.parentId, updatedAt: now() }
      : page),
  };
}

export function trashPageTree(workspace: StoredWorkspace, pageId: string): StoredWorkspace {
  const ids = pageTreeIds(workspace.pages, pageId);
  const timestamp = now();
  const pages = workspace.pages.map((page) => ids.has(page.id) && !page.deletedAt
    ? { ...page, deletedAt: timestamp, deletionGroupId: pageId } : page);
  const activePageId = ids.has(workspace.activePageId) ? pages.find((page) => !page.deletedAt && !page.archivedAt)?.id ?? "" : workspace.activePageId;
  return { ...workspace, pages, activePageId };
}

export function restorePageTree(workspace: StoredWorkspace, pageId: string): StoredWorkspace {
  const source = workspace.pages.find((page) => page.id === pageId);
  if (!source?.deletedAt) return workspace;
  const ids = new Set(workspace.pages.filter((page) => page.id === pageId || page.deletionGroupId === pageId).map((page) => page.id));
  return {
    ...workspace, activePageId: pageId,
    pages: workspace.pages.map((page) => {
      if (!ids.has(page.id)) return page;
      const parent = workspace.pages.find((candidate) => candidate.id === page.parentId);
      return {
        ...page, deletedAt: undefined, deletionGroupId: undefined,
        parentId: page.parentId && (!parent || (parent.deletedAt && !ids.has(parent.id))) ? null : page.parentId,
      };
    }),
  };
}

export function archivePageTree(workspace: StoredWorkspace, pageId: string, archive: boolean): StoredWorkspace {
  const ids = archive ? pageTreeIds(workspace.pages, pageId) : new Set(workspace.pages.filter((page) => page.id === pageId || page.archiveGroupId === pageId).map((page) => page.id));
  return {
    ...workspace,
    pages: workspace.pages.map((page) => ids.has(page.id) && !page.deletedAt
      ? { ...page, archivedAt: archive ? page.archivedAt ?? now() : undefined, archiveGroupId: archive ? page.archiveGroupId ?? pageId : undefined }
      : page),
  };
}

export function purgePageTree(workspace: StoredWorkspace, pageId: string): { workspace: StoredWorkspace; removed: Page[] } {
  const source = workspace.pages.find((page) => page.id === pageId);
  if (!source?.deletedAt) throw new Error("Envie a página para a lixeira antes de excluí-la definitivamente.");
  const ids = pageTreeIds(workspace.pages, pageId);
  const removed = workspace.pages.filter((page) => ids.has(page.id));
  return {
    removed,
    workspace: {
      ...workspace, pages: workspace.pages.filter((page) => !ids.has(page.id)),
      favorites: workspace.favorites.filter((id) => !ids.has(id)),
      recentPageIds: workspace.recentPageIds.filter((id) => !ids.has(id)),
      activePageId: ids.has(workspace.activePageId) ? "" : workspace.activePageId,
    },
  };
}

export function movePageAcrossWorkspaces(library: WorkspaceLibrary, sourceId: string, targetId: string, pageId: string, parentId: string | null, teamspaceId: string | null): WorkspaceLibrary {
  const source = library.workspaces.find((workspace) => workspace.id === sourceId);
  const target = library.workspaces.find((workspace) => workspace.id === targetId && !workspace.archivedAt);
  if (!source || !target || sourceId === targetId) throw new Error("Escolha outro workspace de destino.");
  const ids = pageTreeIds(source.pages, pageId);
  const moving = source.pages.filter((page) => ids.has(page.id));
  const dependency = source.pages.some((page) =>
    (page.databaseProperties ?? []).some((property) => property.type === "Relation" && property.relationDatabaseId
      && ids.has(page.id) !== ids.has(property.relationDatabaseId))
    || page.blocks.some((block) => block.targetPageId && ids.has(page.id) !== ids.has(block.targetPageId)));
  if (dependency) throw new Error("Esta árvore tem relações ou links com outras páginas do workspace. Mova também as páginas relacionadas ou remova esses vínculos antes de transferir.");
  if (moving.some((page) => target.pages.some((candidate) => candidate.id === page.id))) throw new Error("O destino já contém uma página com o mesmo identificador.");
  const destinationParent = parentId ? visiblePages(target).find((page) => page.id === parentId) : undefined;
  if (parentId && !destinationParent) throw new Error("A página de destino não está disponível.");
  const destinationSpace = destinationParent?.teamspaceId ?? teamspaceId;
  const destination = moving.map((page) => ({
    ...page, parentId: page.id === pageId ? parentId : page.parentId, teamspaceId: destinationSpace, updatedAt: now(),
  }));
  return {
    ...library, activeWorkspaceId: targetId,
    workspaces: library.workspaces.map((workspace) => workspace.id === sourceId
      ? { ...workspace, pages: workspace.pages.filter((page) => !ids.has(page.id)), favorites: workspace.favorites.filter((id) => !ids.has(id)), recentPageIds: workspace.recentPageIds.filter((id) => !ids.has(id)), activePageId: "" }
      : workspace.id === targetId ? { ...workspace, pages: [...workspace.pages, ...destination], activePageId: pageId } : workspace),
  };
}

/** Import as a new workspace so existing work is never overwritten. */
export function importWorkspaceLibrary(library: WorkspaceLibrary, value: unknown): WorkspaceLibrary {
  const incoming = isObject(value) && value.version === 2 && Array.isArray(value.workspaces) ? value.workspaces : [value];
  if (!incoming.length) throw new Error("O backup não contém workspaces.");
  const imported = incoming.map((raw) => {
    const normalized = normalizeWorkspace(raw, makeId("workspace"));
    const cloned = clonePages(normalized.pages);
    const idMap = new Map(normalized.pages.map((page, index) => [page.id, cloned[index].id]));
    const rowIdMap = new Map(normalized.pages.flatMap((page, pageIndex) => (page.rows ?? []).map((row, rowIndex) => [row.id, cloned[pageIndex].rows![rowIndex].id] as const)));
    const teamspaceIds = new Map(normalized.teamspaces.map((space) => [space.id, makeId("teamspace")]));
    return {
      ...normalized, id: makeId("workspace"), workspaceName: normalized.workspaceName + " (importado)", archivedAt: undefined,
      pages: cloned.map((page, index) => ({
        ...page,
        teamspaceId: teamspaceIds.get(page.teamspaceId ?? "") ?? null,
        deletedAt: normalized.pages[index].deletedAt,
        deletionGroupId: idMap.get(normalized.pages[index].deletionGroupId ?? ""),
        archivedAt: normalized.pages[index].archivedAt,
        archiveGroupId: idMap.get(normalized.pages[index].archiveGroupId ?? ""),
        comments: structuredClone(normalized.pages[index].comments ?? []),
      })),
      activePageId: idMap.get(normalized.activePageId) ?? cloned[0]?.id ?? "",
      favorites: normalized.favorites.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
      recentPageIds: [],
      teamspaces: normalized.teamspaces.map((space) => ({ ...space, id: teamspaceIds.get(space.id)! })),
      templates: normalized.templates.map((template) => {
        const page = clonePages([template.page])[0];
        return {
          ...template, id: makeId("template"),
          page: {
            ...page,
            blocks: page.blocks.map((block) => ({ ...block, targetPageId: idMap.get(block.targetPageId ?? "") ?? block.targetPageId })),
            databaseProperties: page.databaseProperties?.map((property) => ({
              ...property, relationDatabaseId: idMap.get(property.relationDatabaseId ?? "") ?? property.relationDatabaseId,
            })),
            rows: page.rows?.map((row) => ({
              ...row, properties: Object.fromEntries(Object.entries(row.properties ?? {}).map(([key, value]) => [key,
                Array.isArray(value) && page.databaseProperties?.some((property) => property.id === key && property.type === "Relation")
                  ? value.map((id) => rowIdMap.get(id) ?? id) : value,
              ])),
            })),
          },
        };
      }),
    };
  });
  return { ...library, workspaces: [...library.workspaces, ...imported], activeWorkspaceId: imported[0].id };
}
