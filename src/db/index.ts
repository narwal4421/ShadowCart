import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { ShadowCartItem, ItemStatus, UserSettings } from '../types';

const DB_NAME = 'shadowcart-db';
const STORE_NAME = 'items';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

// Initialize DB — call this once at startup in background worker
export async function initDB(): Promise<void> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('status', 'status');
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE);
          }
        }
      },
    });
  }
  await dbPromise;
}

// Helper to ensure DB is initialized
async function getDB() {
  if (!dbPromise) {
    await initDB();
  }
  return dbPromise!;
}

// Save a new item
export async function saveItem(item: ShadowCartItem): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, item);
}

// Get all items
export async function getAllItems(): Promise<ShadowCartItem[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

// Get items by status
export async function getItemsByStatus(status: ItemStatus): Promise<ShadowCartItem[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'status', status);
}

// Update item status ("bought" or "dropped")
export async function updateItemStatus(id: string, status: ItemStatus, opts?: { resetReminder?: boolean }): Promise<void> {
  const db = await getDB();
  const item = await db.get(STORE_NAME, id);
  if (item) {
    item.status = status;
    if (opts?.resetReminder) {
      item.remindAt = Date.now() + 48 * 60 * 60 * 1000;
      item.notified = false;
    }
    await db.put(STORE_NAME, item);
  }
}

// Mark item as notified
export async function markAsNotified(id: string): Promise<void> {
  const db = await getDB();
  const item = await db.get(STORE_NAME, id);
  if (item) {
    item.notified = true;
    await db.put(STORE_NAME, item);
  }
}

// Delete item permanently
export async function deleteItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

// Get single item by id
export async function getItemById(id: string): Promise<ShadowCartItem | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

// Snooze item — set a specific remindAt timestamp and reset notified
export async function snoozeItem(id: string, remindAt: number, reminderEmail?: string): Promise<void> {
  const db = await getDB();
  const item = await db.get(STORE_NAME, id);
  if (item) {
    item.remindAt = remindAt;
    item.notified = false;
    if (reminderEmail) {
      item.reminderEmail = reminderEmail;
    } else {
      delete item.reminderEmail;
    }
    await db.put(STORE_NAME, item);
  }
}

// Get count of pending items (for badge)
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_NAME, 'status', 'pending');
  return items.length;
}

// Settings
const SETTINGS_KEY = 'user_settings';

export async function getSettings(): Promise<UserSettings> {
  const db = await getDB();
  const settings = await db.get(SETTINGS_STORE, SETTINGS_KEY);
  return settings || { email: '', emailEnabled: false };
}

export async function updateSettings(settings: UserSettings): Promise<void> {
  const db = await getDB();
  await db.put(SETTINGS_STORE, settings, SETTINGS_KEY);
}
