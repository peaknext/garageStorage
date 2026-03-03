try { require('dotenv/config'); } catch {}
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    path: './migrations',
    seed: 'ts-node --transpile-only ../prisma/seed.ts',
  },
});
