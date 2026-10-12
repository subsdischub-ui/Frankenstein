import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const labAccounts = pgTable("lab_accounts", {
  owner: text("owner").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const labEvents = pgTable("lab_events", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  time: timestamp("time", { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb("payload").notNull(),
});
export const labExperiments = pgTable("lab_experiments", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  report: jsonb("report").notNull(),
});
export const labMarket = pgTable("lab_market", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").notNull(),
});
export const insertLabAccountSchema = createInsertSchema(labAccounts);
export type LabAccount = typeof labAccounts.$inferSelect;