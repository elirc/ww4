/**
 * What this file does:
 * Orchestrates login and logout by combining password verification with server-side session creation.
 * What calls it:
 * src/app/api/auth/login/route.ts and src/app/api/auth/logout/route.ts.
 * What it calls:
 * src/repositories/authRepository.ts, src/lib/auth/password.ts, and src/lib/auth/session.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Creating a session before verifying the user actually belongs to an organization, which produces valid cookies with no tenant context.
 */
import { UnauthorizedError } from "@/lib/http/errors";
import { authRepository } from "@/repositories/authRepository";

import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, createSessionCookie } from "@/lib/auth/session";

export const authService = {
  async login(input: { email: string; password: string }) {
    const user = await authRepository.findUserByEmail(input.email);

    if (!user) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    const firstMembership = user.memberships[0];

    if (!firstMembership) {
      throw new UnauthorizedError("This account is not assigned to an organization.");
    }

    await createSessionCookie({
      userId: user.id,
      activeOrganizationId: firstMembership.organizationId,
    });
  },

  async logout() {
    await clearSessionCookie();
  },
};
