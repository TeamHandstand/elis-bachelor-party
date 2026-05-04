import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __toasty_pool: Pool | undefined;
}

function makePool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Railway Postgres requires SSL but accepts self-signed
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });
}

const pool = global.__toasty_pool ?? makePool();
if (process.env.NODE_ENV !== "production") global.__toasty_pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
