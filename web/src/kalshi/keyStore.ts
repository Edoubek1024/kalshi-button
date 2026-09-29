import type { LoadedKey } from "./signing";

/**
 * Persists the loaded signing key in IndexedDB rather than localStorage.
 * IndexedDB's structured-clone algorithm can store a CryptoKey object
 * directly while preserving its non-extractability — so the raw key bytes
 * are never serialized to a string anywhere, before or after "locking".
 */

const DB_NAME = "kalshi-button";
const STORE_NAME = "signing-key";
const RECORD_ID = "current";

export interface StoredCredentials {
  keyId: string;
  algorithm: LoadedKey["algorithm"];
  cryptoKey: CryptoKey;
  kalshiEnv: "demo" | "prod";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveCredentials(entry: StoredCredentials): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry, RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save credentials"));
  });
  db.close();
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const db = await openDb();
  const result = await new Promise<StoredCredentials | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(RECORD_ID);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to load credentials"));
  });
  db.close();
  return result;
}

export async function clearCredentials(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear credentials"));
  });
  db.close();
}
