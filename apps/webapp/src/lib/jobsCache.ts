// User-keyed IDB cache for jobs lists (plan §4.3, C1).
// Stays out of the SW Cache Storage so user isolation is structural, not advisory.

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'f2a-pwa';
const DB_VERSION = 1;
const STORE = 'jobs';

interface Entry {
  key: string; // `${userId}:${queryKey}`
  userId: string;
  payload: unknown;
  syncedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('byUser', 'userId', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

export async function writeJobs(userId: string, queryKey: string, payload: unknown): Promise<void> {
  if (!userId) return;
  const db = await getDb();
  const entry: Entry = { key: `${userId}:${queryKey}`, userId, payload, syncedAt: Date.now() };
  await db.put(STORE, entry);
}

export async function readJobs<T = unknown>(userId: string, queryKey: string): Promise<{ payload: T; syncedAt: number } | null> {
  if (!userId) return null;
  const db = await getDb();
  const entry = (await db.get(STORE, `${userId}:${queryKey}`)) as Entry | undefined;
  if (!entry) return null;
  return { payload: entry.payload as T, syncedAt: entry.syncedAt };
}

export async function clearAllJobs(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}

export async function clearOtherUsers(currentUserId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  let cursor = await store.openCursor();
  while (cursor) {
    const entry = cursor.value as Entry;
    if (entry.userId !== currentUserId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
