import { Router } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { db, settingsTable } from "@workspace/db";

const router = Router();

async function ensureSettings() {
  const rows = await db.query.settingsTable.findMany({ limit: 1 });
  if (rows.length === 0) {
    const inserted = await db.insert(settingsTable).values({}).returning();
    return inserted[0];
  }
  return rows[0];
}

router.get("/settings", async (req, res) => {
  const settings = await ensureSettings();
  return res.json(settings);
});

router.put("/settings", async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid settings", details: parsed.error.issues });
  }
  const settings = await ensureSettings();
  const updated = await db
    .update(settingsTable)
    .set(parsed.data)
    .where((await import("drizzle-orm")).eq(settingsTable.id, settings.id))
    .returning();
  return res.json(updated[0]);
});

export default router;
