import "dotenv/config";
import type { Config } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL?.trim();
const databaseUrl = rawUrl && rawUrl.length > 0 ? rawUrl : undefined;
const isPostgres = !!databaseUrl && databaseUrl.startsWith("postgres");

export default {
  schema: "./src/repo/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? { url: databaseUrl! }
    : { url: databaseUrl ?? "./data/splitbot.db" },
} satisfies Config;
