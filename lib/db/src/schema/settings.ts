import { pgTable, serial, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  minTemp: real("min_temp").notNull().default(16),
  maxTemp: real("max_temp").notNull().default(26),
  maxHumidity: real("max_humidity").notNull().default(70),
  maxWindSpeed: real("max_wind_speed").notNull().default(30),
  workDays: jsonb("work_days").notNull().$type<number[]>().default([1, 2, 3, 4, 5]),
  workStartHour: integer("work_start_hour").notNull().default(8),
  workEndHour: integer("work_end_hour").notNull().default(18),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  checkIntervalMinutes: integer("check_interval_minutes").notNull().default(30),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
