import {
  pgTable,
  serial,
  text,
  timestamp,
  date,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const licenses = pgTable("licenses", {
  id: serial().primaryKey(),
  key: text().notNull().unique(),
  email: text().notNull(),
  stripeCustomerId: text(),
  stripeSessionId: text().unique(),
  issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updateWindowExpiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
});

export const activations = pgTable(
  "activations",
  {
    id: serial().primaryKey(),
    licenseId: integer()
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    machineId: text().notNull(),
    machineName: text(),
    appBuildDate: date().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("activations_license_machine_uq").on(t.licenseId, t.machineId)],
);

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Activation = typeof activations.$inferSelect;
export type NewActivation = typeof activations.$inferInsert;
