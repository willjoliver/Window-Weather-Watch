import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// VAPID keys must be set as environment variables.
// Generate once with: node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// GET /api/push/vapid-public-key — frontend needs this to subscribe
router.get("/push/vapid-public-key", (_req, res) => {
  if (!vapidPublicKey) {
    return res.status(503).json({ error: "Push notifications not configured on server" });
  }
  return res.json({ publicKey: vapidPublicKey });
});

// POST /api/push/subscribe — save a push subscription
router.post("/push/subscribe", async (req, res) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(503).json({ error: "Push notifications not configured on server" });
  }

  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription object" });
  }

  // Upsert — if endpoint already exists just update keys
  const existing = await db.query.pushSubscriptionsTable.findFirst({
    where: eq(pushSubscriptionsTable.endpoint, endpoint),
  });

  if (existing) {
    await db.update(pushSubscriptionsTable)
      .set({ p256dh: keys.p256dh, auth: keys.auth })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }

  return res.status(201).json({ ok: true });
});

// DELETE /api/push/subscribe — remove a subscription
router.delete("/push/subscribe", async (req, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  return res.json({ ok: true });
});

// POST /api/push/test — send a test notification to all subscriptions
router.post("/push/test", async (req, res) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(503).json({ error: "Push not configured" });
  }
  const subs = await db.query.pushSubscriptionsTable.findMany();
  const payload = JSON.stringify({
    title: "Window Weather Watch",
    body: "🔔 Test notification — push is working!",
    url: "/",
  });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 410) {
        // Subscription expired — clean up
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
      }
    }
  }
  return res.json({ sent });
});

export { webpush };
export default router;
