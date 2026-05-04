import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});
const db = drizzle(pool);

console.log("[migrate] applying migrations from ./drizzle …");
await migrate(db, { migrationsFolder: "drizzle" });
console.log("[migrate] done");
await pool.end();
