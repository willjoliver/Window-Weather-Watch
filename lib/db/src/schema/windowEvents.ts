import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const windowEventsTable = pgTable("window_events", {
  id: serial("id").primaryKey(),
  action: text("action").notNull().$type<"opened" | "closed">(),
  triggeredBy: text("triggered_by").notNull().$type<"user" | "auto">(),
  temperature: real("temperature"),
  humidity: real("humidity"),
  windSpeed: real("wind_speed"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWindowEventSchema = createInsertSchema(windowEventsTable).omit({ id: true, createdAt: true });
export type InsertWindowEvent = z.infer<typeof insertWindowEventSchema>;
export type WindowEvent = typeof windowEventsTable.$inferSelect;
