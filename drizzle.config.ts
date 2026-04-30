import type { Config } from "drizzle-kit";

const isPostgres = !!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres");

export default {
  schema: "./src/repo/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? { url: process.env.DATABASE_URL! }
    : { url: process.env.DATABASE_URL ?? "./data/splitbot.db" },
} satisfies Config;
