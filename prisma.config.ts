import { defineConfig, env } from "prisma/config";

// prisma doesn't read .env files, next does. on a server with real env vars there's no file
try {
    process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: env("DATABASE_URL") },
});
