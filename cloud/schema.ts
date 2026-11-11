import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const demos = sqliteTable("demos", {
  id: text("id").primaryKey(),
  salt: text("salt").notNull(),
  normal: text("normal").notNull(),
  duress: text("duress").notNull(),
  revision: integer("revision").notNull().default(0),
  ledger: text("ledger").notNull(),
});
