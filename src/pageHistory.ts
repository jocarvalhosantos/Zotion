import type { Page } from "./model";

export interface PageRevision {
  id: string;
  workspaceId: string;
  pageId: string;
  createdAt: string;
  reason: string;
  snapshot: Page;
}

export const MAX_PAGE_REVISIONS = 20;
const DATABASE_NAME = "workspace-lab-history-v1";
const STORE_NAME = "page-revisions";
const PAGE_INDEX = "workspace-page";

function openHistoryDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("O histórico local não está disponível neste navegador."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex(PAGE_INDEX, ["workspaceId", "pageId"], { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o histórico local."));
    request.onblocked = () => reject(new Error("Feche as outras abas deste espaço para abrir o histórico."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível salvar o histórico local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("A alteração do histórico foi cancelada."));
  });
}

function snapshotContent(page: Page): string {
  const content = { ...page } as Partial<Page>;
  delete content.updatedAt;
  return JSON.stringify(content);
}

function newestFirst(left: PageRevision, right: PageRevision): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

/** Saves one local snapshot, skips an identical latest snapshot, and caps each page at 20 versions. */
export async function savePageRevision(workspaceId: string, page: Page, reason = "Alteração da página"): Promise<void> {
  if (!workspaceId || !page.id) throw new Error("O espaço e a página são necessários para salvar uma versão.");
  // Clone before yielding: callers can keep editing while IndexedDB opens.
  const snapshot = structuredClone(page);
  const database = await openHistoryDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index(PAGE_INDEX).getAll(IDBKeyRange.only([workspaceId, snapshot.id])) as IDBRequest<PageRevision[]>;
    request.onsuccess = () => {
      const revisions = request.result.sort(newestFirst);
      const latest = revisions[0];
      if (latest && snapshotContent(latest.snapshot) === snapshotContent(snapshot)) return;
      const previousTime = latest ? Date.parse(latest.createdAt) : 0;
      const revision: PageRevision = {
        id: crypto.randomUUID(),
        workspaceId,
        pageId: snapshot.id,
        createdAt: new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString(),
        reason,
        snapshot,
      };
      store.put(revision);
      revisions.slice(MAX_PAGE_REVISIONS - 1).forEach((old) => store.delete(old.id));
    };
    request.onerror = () => transaction.abort();
    await completed;
  } finally {
    database.close();
  }
}

export async function listPageRevisions(workspaceId: string, pageId: string): Promise<PageRevision[]> {
  const database = await openHistoryDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionComplete(transaction);
    const request = transaction.objectStore(STORE_NAME).index(PAGE_INDEX)
      .getAll(IDBKeyRange.only([workspaceId, pageId])) as IDBRequest<PageRevision[]>;
    let revisions: PageRevision[] = [];
    request.onsuccess = () => { revisions = request.result; };
    request.onerror = () => transaction.abort();
    await completed;
    return revisions.sort(newestFirst);
  } finally {
    database.close();
  }
}

export async function deletePageRevisions(workspaceId: string, pageId: string): Promise<void> {
  const database = await openHistoryDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index(PAGE_INDEX).getAllKeys(IDBKeyRange.only([workspaceId, pageId]));
    request.onsuccess = () => request.result.forEach((id) => store.delete(id));
    request.onerror = () => transaction.abort();
    await completed;
  } finally {
    database.close();
  }
}

/** Moves the history with a page tree; one transaction preserves every revision if a move fails. */
export async function transferPageRevisions(sourceWorkspaceId: string, targetWorkspaceId: string, pageIds: string[]): Promise<void> {
  if (sourceWorkspaceId === targetWorkspaceId || !pageIds.length) return;
  const database = await openHistoryDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    for (const pageId of pageIds) {
      const request = store.index(PAGE_INDEX).getAll(IDBKeyRange.only([sourceWorkspaceId, pageId])) as IDBRequest<PageRevision[]>;
      request.onsuccess = () => request.result.forEach((revision) => store.put({ ...revision, workspaceId: targetWorkspaceId }));
      request.onerror = () => transaction.abort();
    }
    await completed;
  } finally { database.close(); }
}
