export interface MeetingAudioSegment {
  id: string;
  blockId: string;
  createdAt: string;
  durationMs: number;
  mimeType: string;
  blob: Blob;
}

const DATABASE_NAME = "workspace-lab-media-v1";
const STORE_NAME = "meeting-audio";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(new Error("O armazenamento local de áudio não está disponível neste navegador."));

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("blockId", "blockId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local de áudio."));
    request.onblocked = () => reject(new Error("Feche outras abas deste espaço e tente novamente."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar o áudio neste navegador."));
    transaction.onabort = () => reject(transaction.error ?? new Error("O salvamento do áudio foi cancelado."));
  });
}

export async function saveMeetingAudioSegment(segment: MeetingAudioSegment): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).put(segment);
    await completed;
  } finally {
    database.close();
  }
}

export async function listMeetingAudioSegments(blockId: string): Promise<MeetingAudioSegment[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionComplete(transaction);
    const request = transaction.objectStore(STORE_NAME).index("blockId").getAll(blockId) as IDBRequest<MeetingAudioSegment[]>;
    const segments = await new Promise<MeetingAudioSegment[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler os trechos de áudio."));
    });
    await completed;
    return segments.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } finally {
    database.close();
  }
}

export async function deleteMeetingAudioSegment(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await completed;
  } finally {
    database.close();
  }
}

export async function deleteMeetingAudioForBlock(blockId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index("blockId").getAllKeys(blockId);
    request.onsuccess = () => request.result.forEach((key) => store.delete(key));
    request.onerror = () => transaction.abort();
    await completed;
  } finally {
    database.close();
  }
}

export async function removeOrphanedMeetingAudio(validBlockIds: string[]): Promise<void> {
  const database = await openDatabase();
  const validIds = new Set(validBlockIds);
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll() as IDBRequest<MeetingAudioSegment[]>;
    request.onsuccess = () => request.result
      .filter((segment) => !validIds.has(segment.blockId))
      .forEach((segment) => store.delete(segment.id));
    request.onerror = () => transaction.abort();
    await completed;
  } finally {
    database.close();
  }
}
