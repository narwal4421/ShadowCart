import browser from 'webextension-polyfill';
import { initDB, saveItem, getItemsByStatus, updateItemStatus, markAsNotified, getItemById, getPendingCount } from '../db';
import type { ShadowCartItem } from '../types';

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
  browser.alarms.create("checkReminders", { periodInMinutes: 30 });
});

// Listener for messages from content script and popup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
browser.runtime.onMessage.addListener(async (message: any) => {
  if (message.type === "SAVE_ITEM") {
    await initDB();
    const pendingItems = await getItemsByStatus("pending");
    const isDuplicate = pendingItems.some(i => i.productUrl === message.payload.productUrl);
    if (!isDuplicate) {
      const item: ShadowCartItem = {
        id: crypto.randomUUID(),
        ...message.payload,
        addedAt: Date.now(),
        remindAt: Date.now() + 48 * 60 * 60 * 1000,
        status: "pending",
        notified: false,
      };
      await saveItem(item);
      await updateBadge();
    }
  }

  if (message.type === "REFRESH_BADGE") {
    await updateBadge();
  }
});

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

  for (const item of items) {
    if (!item.notified && now >= item.remindAt) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (browser.notifications as any).create(item.id, {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Do you still want this? \uD83D\uDC7B",
          message: `You added "${item.name}" from ${item.siteName} 48 hours ago.`,
          buttons: [
            { title: "Yes, buy it" },
            { title: "No, drop it" }
          ],
          requireInteraction: true,
        });

        // If email enabled for this item, ping local backend
        if (item.reminderEmail) {
          fetch('http://localhost:3000/api/send-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: item.reminderEmail,
              item: item
            })
          }).catch(err => console.error("Failed to trigger email backend:", err));
        }

        await markAsNotified(item.id);
      } catch (e) {
        console.error("Failed to create notification", e);
      }
    }
  }
}

browser.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  await initDB();
  if (btnIdx === 0) {
    await updateItemStatus(notifId, "bought");
    const item = await getItemById(notifId);
    if (item) browser.tabs.create({ url: item.productUrl });
  } else {
    await updateItemStatus(notifId, "dropped");
  }
  browser.notifications.clear(notifId);
  await updateBadge();
});
