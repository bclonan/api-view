// Large response payloads live once in IndexedDB. The existing small dashboard
// recipes stay in localStorage, preserving the current migration and exports.
const memory = new Map<string, unknown>();
let database: Promise<IDBDatabase | undefined> | undefined;
function open() {
  return (database ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(undefined);
    const request = indexedDB.open("api-canvas-data", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  }));
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    const req = db.transaction("entries").objectStore("entries").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
export async function readLocalEntries<T>(prefix: string): Promise<T[]> {
  const entries = new Map<string, T>();
  const db = await open();
  if (db)
    await new Promise<void>((resolve) => {
      const request = db
        .transaction("entries")
        .objectStore("entries")
        .openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (String(cursor.key).startsWith(prefix))
          entries.set(String(cursor.key), cursor.value);
        cursor.continue();
      };
      request.onerror = () => resolve();
    });
  for (const [key, value] of memory)
    if (key.startsWith(prefix)) entries.set(key, value as T);
  return [...entries.values()];
}
export async function writeLocal(
  key: string,
  value: unknown,
  options?: { structured?: boolean },
) {
  const copy = options?.structured ? value : JSON.parse(JSON.stringify(value));
  memory.set(key, copy);
  while (memory.size > 100) memory.delete(memory.keys().next().value!);
  const db = await open();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction("entries", "readwrite");
    try {
      tx.objectStore("entries").put(copy, key);
    } catch {
      resolve(false);
      return;
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}
export async function pruneLocal(prefix: string, max: number) {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction("entries", "readwrite"),
      store = tx.objectStore("entries"),
      req = store.openCursor();
    const keys: { key: IDBValidKey; time: number }[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix))
          keys.push({ key: cursor.key, time: cursor.value?.savedAt ?? 0 });
        cursor.continue();
      } else {
        keys
          .sort((a, b) => b.time - a.time)
          .slice(max)
          .forEach((v) => {
            store.delete(v.key);
            memory.delete(String(v.key));
          });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
