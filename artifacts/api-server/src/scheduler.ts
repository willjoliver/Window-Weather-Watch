/**
 * Background scheduler — checks weather for the saved location on the
 * configured interval and sends push notifications to all subscribers
 * when the window-friendly state changes.
 */
import webpush from "web-push";
import { db, settingsTable, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const BASE_URL = `http://localhost:${process.env.PORT}`;

let lastState: boolean | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

async function checkAndNotify() {
  try {
    // Load settings
    const rows = await db.query.settingsTable.findMany({ limit: 1 });
    const settings = rows[0];
    if (!settings?.locationLat || !settings?.locationLon) return;

    // Check work hours — only notify during work hours on work days
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const workDays = (settings.workDays as number[]) ?? [1, 2, 3, 4, 5];
    if (!workDays.includes(dayOfWeek)) return;
    if (hour < settings.workStartHour || hour >= settings.workEndHour) return;

    // Fetch current weather from our own API
    const url = `${BASE_URL}/api/weather/current?lat=${settings.locationLat}&lon=${settings.locationLon}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return;
    const weather = await resp.json() as { isWindowFriendly: boolean; recommendation: string };

    const currentState = weather.isWindowFriendly;

    // Only notify on state change
    if (lastState === null) {
      lastState = currentState;
      return;
    }
    if (currentState === lastState) return;

    lastState = currentState;

    const payload = JSON.stringify({
      title: currentState ? "🪟 Open your window!" : "🪟 Close your window",
      body: weather.recommendation,
      url: "/",
    });

    // Send to all subscriptions
    const subs = await db.query.pushSubscriptionsTable.findMany();
    if (subs.length === 0) return;

    logger.info({ state: currentState, subscribers: subs.length }, "Sending push notifications");

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          // Subscription expired or gone — remove it
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
          logger.info({ endpoint: sub.endpoint }, "Removed expired push subscription");
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "Failed to send push notification");
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Scheduler check failed");
  }
}

export function startScheduler() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    logger.info("Push scheduler disabled — VAPID keys not configured");
    return;
  }

  logger.info("Push scheduler started");

  async function tick() {
    await checkAndNotify();

    // Re-read interval from DB each tick so it responds to settings changes
    try {
      const rows = await db.query.settingsTable.findMany({ limit: 1 });
      const intervalMinutes = rows[0]?.checkIntervalMinutes ?? 30;
      schedulerTimer = setTimeout(tick, intervalMinutes * 60 * 1000);
    } catch {
      schedulerTimer = setTimeout(tick, 30 * 60 * 1000);
    }
  }

  // First check after 1 minute (give server time to fully start)
  schedulerTimer = setTimeout(tick, 60_000);
}

export function stopScheduler() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
}
