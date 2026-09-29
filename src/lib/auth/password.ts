/**
 * What this file does:
 * Wraps password hashing and comparison so auth code never touches bcrypt details directly.
 * What calls it:
 * src/services/auth/authService.ts during login and prisma/seed.ts when creating demo users.
 * What it calls:
 * bcryptjs to hash and compare passwords.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Comparing plaintext passwords or using inconsistent hash settings between seed data and runtime login.
 */
import bcrypt from "bcryptjs";

const PASSWORD_ROUNDS = 10;

export function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
