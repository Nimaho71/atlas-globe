// The studio's storage: IndexedDB in the visitor's own browser.
//
// Photos are never uploaded. They're downscaled here and kept locally, so a
// globe someone builds is still there when they come back — and still theirs.

const DB    = 'world-gallery-studio';
const STORE = 'photos';

let dbp = null;

function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
    return dbp;
}

async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r?.result);
        t.onerror    = () => reject(t.error);
    });
}

export const all    = ()      => tx('readonly',  s => s.getAll());
export const put    = record  => tx('readwrite', s => s.put(record));
export const remove = id      => tx('readwrite', s => s.delete(id));
export const clear  = ()      => tx('readwrite', s => s.clear());

/** Roughly how much room is left, so we can warn before the browser refuses. */
export async function quota() {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, pct: quota ? usage / quota : 0 };
}
