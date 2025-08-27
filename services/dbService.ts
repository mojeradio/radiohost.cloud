import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'RadioHostDB';
const DB_VERSION = 2;
const TRACKS_STORE_NAME = 'tracks';
const CONFIG_STORE_NAME = 'config';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    if (!db.objectStoreNames.contains(TRACKS_STORE_NAME)) {
                        db.createObjectStore(TRACKS_STORE_NAME);
                    }
                }
                if (oldVersion < 2) {
                     if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
                        db.createObjectStore(CONFIG_STORE_NAME);
                    }
                }
            },
        });
    }
    return dbPromise;
};

export const addTrack = async (id: string, file: File): Promise<void> => {
    const db = await getDb();
    await db.put(TRACKS_STORE_NAME, file, id);
};

export const getTrack = async (id: string): Promise<File | null> => {
    const db = await getDb();
    const track = await db.get(TRACKS_STORE_NAME, id);
    return track || null;
};

export const deleteTrack = async (id: string): Promise<void> => {
    const db = await getDb();
    await db.delete(TRACKS_STORE_NAME, id);
};

export const setConfig = async (key: string, value: any): Promise<void> => {
    const db = await getDb();
    await db.put(CONFIG_STORE_NAME, value, key);
};

export const getConfig = async <T>(key: string): Promise<T | null> => {
    const db = await getDb();
    const value = await db.get(CONFIG_STORE_NAME, key);
    return value || null;
};
