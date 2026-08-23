/**
 * Minimal .env loader for the DayOS scripts.
 *
 * Next.js loads .env for you; `tsx` does not, and a script that fails with
 * "connection string required" when the file is sitting right there is a bad
 * first five minutes. Node 22's --env-file would also work; this keeps the
 * command line short.
 *
 * Deliberately not a dotenv dependency: it reads KEY=value, honours quotes and
 * `export `, skips comments, and never overwrites a variable that is already
 * set — so a real environment always wins over the file.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(files = [".env.local", ".env"]): string[] {
  const loaded: string[] = [];

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim().replace(/^export\s+/, "");
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    loaded.push(file);
  }

  return loaded;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set and no .env / .env.local defines it. " +
        "Start Postgres with `docker compose up -d` and check your .env."
    );
  }
  return url;
}
