import browser from 'webextension-polyfill';
import { initDB, saveItem, getItemsByStatus, updateItemStatus, markAsNotified, getItemById, getPendingCount, getSettings, snoozeItem } from '../db';
import { CONFIG } from '../config';
import type { ShadowCartItem } from '../types';

type SaveItemResponse = {
  saved: boolean;
  reason?: string;
};

function createId(): string {
  if (self.crypto?.randomUUID) {
    return self.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function updateBadge() {
  try {
    await initDB();
    const count = await getPendingCount();
    await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#6c63ff' });
  } catch { /* silently fail */ }
}

// On install
browser.runtime.onInstalled.addListener(async () => {
  await initDB();
  await updateBadge();
  browser.alarms.create("checkReminders", { periodInMinutes: 1 });
});

// In-flight saving set to prevent concurrent SAVE_ITEM race conditions
const inFlightSaves = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(message: any): Promise<SaveItemResponse | { refreshed: true } | undefined> {
  if (message.type === "SAVE_ITEM") {
    const productUrl = message.payload?.productUrl;
    if (productUrl && inFlightSaves.has(productUrl)) {
      return { saved: false, reason: 'duplicate' };
    }
    if (productUrl) inFlightSaves.add(productUrl);

    try {
      await initDB();
      const pendingItems = await getItemsByStatus("pending");
      const isDuplicate = pendingItems.some(i => i.productUrl === productUrl);
      if (isDuplicate) {
        return { saved: false, reason: 'duplicate' };
      }

      const settings = await getSettings();
      const item: ShadowCartItem = {
        id: createId(),
        ...message.payload,
        reminderEmail: settings.emailEnabled ? settings.email : undefined,
        addedAt: Date.now(),
        remindAt: Date.now() + 48 * 60 * 60 * 1000,
        status: "pending",
        notified: false,
      };
      await saveItem(item);
      await updateBadge();
      return { saved: true };
    } finally {
      if (productUrl) inFlightSaves.delete(productUrl);
    }
  }

  if (message.type === "REFRESH_BADGE") {
    await updateBadge();
    return { refreshed: true };
  }
}

// Listener for messages from content script and popup via webextension-polyfill
// eslint-disable-next-line @typescript-eslint/no-explicit-any
browser.runtime.onMessage.addListener((message: any) => handleMessage(message));

// Check reminders alarm
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "checkReminders") {
    await initDB();
    await checkAndNotify();
    await updateBadge();
  }
});

async function checkAndNotify() {
  const items = await getItemsByStatus("pending");
  const now = Date.now();
  const isFirefox = await isFirefoxBrowser();

  for (const item of items) {
    if (!item.notified && now >= item.remindAt) {
      try {
        const notificationOptions: browser.Notifications.CreateNotificationOptions = {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Do you still want this? \uD83D\uDC7B",
          message: isFirefox
            ? `Open ShadowCart to decide whether to buy or drop "${item.name}" from ${item.siteName}.`
            : `You added "${item.name}" from ${item.siteName} 48 hours ago.`,
        };

        if (!isFirefox) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (notificationOptions as any).buttons = [
            { title: "Remind me tomorrow" },
            { title: "No, drop it" }
          ];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (notificationOptions as any).requireInteraction = true;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (browser.notifications as any).create(item.id, notificationOptions);

        // If email enabled for this item, ping local/cloud backend
        if (item.reminderEmail) {
          if (!CONFIG.REMINDER_SECRET) {
            console.error("ShadowCart: VITE_REMINDER_SECRET is not set; skipping email send.");
          } else {
            fetch(CONFIG.API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-ShadowCart-Secret': CONFIG.REMINDER_SECRET,
              },
              body: JSON.stringify({
                email: item.reminderEmail,
                item: item
              })
            }).then(async (res) => {
              if (!res.ok) {
                console.error("ShadowCart: reminder email failed", res.status, await res.text());
                await browser.notifications.create(`email-fail-${item.id}`, {
                  type: "basic",
                  iconUrl: "icons/icon48.png",
                  title: "Couldn't send reminder email",
                  message: `We saved "${item.name}" but the email reminder didn't go out. Check your settings.`,
                });
              }
            }).catch(err => console.error("Failed to trigger email backend:", err));
          }
        }

        await markAsNotified(item.id);
      } catch (e) {
        console.error("Failed to create notification", e);
      }
    }
  }
}

async function isFirefoxBrowser(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getBrowserInfo = (browser.runtime as any).getBrowserInfo;
    if (getBrowserInfo) {
      const info = await getBrowserInfo();
      return String(info.name || '').toLowerCase().includes('firefox');
    }
  } catch { /* fall back to user agent */ }

  return navigator.userAgent.toLowerCase().includes('firefox');
}

function getItemIdFromNotification(notifId: string): string {
  return notifId.replace(/^email-fail-/, '');
}

browser.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  await initDB();
  const realId = getItemIdFromNotification(notifId);
  if (btnIdx === 0) {
    await snoozeItem(realId, Date.now() + 24 * 60 * 60 * 1000);
  } else {
    await updateItemStatus(realId, "dropped");
  }
  browser.notifications.clear(notifId);
  await updateBadge();
});

browser.notifications.onClicked.addListener(async (notifId) => {
  await initDB();
  const realId = getItemIdFromNotification(notifId);
  const item = await getItemById(realId);
  if (item) {
    await browser.tabs.create({ url: item.productUrl });
  }
  browser.notifications.clear(notifId);
});
