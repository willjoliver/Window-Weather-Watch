import { Router } from "express";
import { CreateEventBody, GetEventsQueryParams } from "@workspace/api-zod";
import { db, windowEventsTable } from "@workspace/db";
import { desc, gte, and, eq } from "drizzle-orm";

const router = Router();

router.get("/events", async (req, res) => {
  const parsed = GetEventsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const events = await db.query.windowEventsTable.findMany({
    orderBy: [desc(windowEventsTable.createdAt)],
    limit,
  });
  return res.json(events);
});

router.post("/events", async (req, res) => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid event data", details: parsed.error.issues });
  }
  const inserted = await db.insert(windowEventsTable).values(parsed.data).returning();
  return res.status(201).json(inserted[0]);
});

router.get("/events/stats", async (req, res) => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const events = await db.query.windowEventsTable.findMany({
    where: gte(windowEventsTable.createdAt, weekAgo),
    orderBy: [desc(windowEventsTable.createdAt)],
  });

  const opens = events.filter((e) => e.action === "opened");
  const closes = events.filter((e) => e.action === "closed");

  let totalDuration = 0;
  let durationCount = 0;
  const daysSet = new Set<string>();

  for (const open of opens) {
    const nextClose = closes.find(
      (c) => c.createdAt > open.createdAt
    );
    if (nextClose) {
      const duration = (nextClose.createdAt.getTime() - open.createdAt.getTime()) / 60000;
      totalDuration += duration;
      durationCount++;
    }
    daysSet.add(open.createdAt.toISOString().split("T")[0]);
  }

  const hourCounts: Record<number, number> = {};
  for (const open of opens) {
    const h = open.createdAt.getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }

  let mostCommonOpenHour: number | null = null;
  let maxCount = 0;
  for (const [h, count] of Object.entries(hourCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonOpenHour = Number(h);
    }
  }

  return res.json({
    totalOpens: opens.length,
    totalCloses: closes.length,
    avgOpenDurationMinutes: durationCount > 0 ? totalDuration / durationCount : null,
    mostCommonOpenHour,
    daysWithWindowOpen: daysSet.size,
  });
});

export default router;
