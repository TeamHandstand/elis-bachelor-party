import type { Config } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Load .env.local first (local dev), then .env (Railway / CI override).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
