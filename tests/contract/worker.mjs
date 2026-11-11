// Execute the published branch's handler and SQL migrations in an isolated database.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function workerFixture(root) {
  const { default: handler } = await import(
    pathToFileURL(resolve(root, "cloud/worker.ts"))
  );
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(resolve(root, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  }
  // Only the D1 transport is adapted. Parameter binding, writes and revision checks execute in SQLite.
  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...args) {
          return {
            first: async () => statement.get(...args) ?? null,
            run: async () => ({
              meta: { changes: statement.run(...args).changes },
            }),
          };
        },
      };
    },
  };
  return {
    request: (req) => handler.fetch(req, { DB }),
    close: () => db.close(),
  };
}
