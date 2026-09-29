/**
 * What this file does:
 * Defines the public request shapes accepted by authentication endpoints.
 * What calls it:
 * src/app/api/auth/login/route.ts parses request JSON with these schemas.
 * What it calls:
 * Zod validators only.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting browser form validation alone and forgetting that API callers can send any payload they want.
 */
import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});
