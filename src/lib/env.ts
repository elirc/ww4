import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("workgrid_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  INTERNAL_JOB_TOKEN: z.string().min(1).default("local-job-token"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/workgrid?schema=public",
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
  SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
  INTERNAL_JOB_TOKEN: process.env.INTERNAL_JOB_TOKEN,
});
