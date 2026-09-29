/**
 * What this file does:
 * Creates, reads, refreshes, and clears the signed session cookie backed by database session records.
 * What calls it:
 * src/services/auth/authService.ts, src/lib/auth/request-context.ts, and auth route handlers.
 * What it calls:
 * src/repositories/authRepository.ts, next/headers cookies(), and Node crypto utilities.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting cookie contents directly instead of resolving them back to a server-side session record that can expire or be revoked.
 */
import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { UnauthorizedError } from "@/lib/http/errors";
import { authRepository } from "@/repositories/authRepository";
import type { SessionContext, SessionOrganization } from "@/types/domain";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRawSessionToken() {
  return randomBytes(32).toString("hex");
}

function toSessionOrganizations(
  memberships: Array<{
    role: SessionOrganization["role"];
    organization: {
      id: string;
      name: string;
      slug: string;
    };
  }>,
) {
  return memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  }));
}

export async function createSessionCookie(input: {
  userId: string;
  activeOrganizationId: string;
}) {
  const token = createRawSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  const session = await authRepository.createSession({
    tokenHash: hashToken(token),
    userId: input.userId,
    activeOrganizationId: input.activeOrganizationId,
    expiresAt,
  });

  const cookieStore = await cookies();

  cookieStore.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;

  if (token) {
    await authRepository.deleteSessionByTokenHash(hashToken(token));
  }

  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await authRepository.findSessionByTokenHash(hashToken(token));

  if (!session || session.expiresAt < new Date()) {
    cookieStore.delete(env.SESSION_COOKIE_NAME);
    return null;
  }

  const memberships = await authRepository.listMembershipsForUser(session.userId);
  const organizations = toSessionOrganizations(memberships);

  const activeOrganization =
    organizations.find((organization) => organization.id === session.activeOrganizationId) ?? organizations[0];

  if (!activeOrganization) {
    // ⚠️ SENIOR NOTE: A session with no surviving membership is effectively orphaned and must not keep working.
    await authRepository.deleteSessionByTokenHash(hashToken(token));
    cookieStore.delete(env.SESSION_COOKIE_NAME);
    return null;
  }

  await authRepository.updateSessionHeartbeat(session.id, activeOrganization.id);

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    activeOrganization,
    organizations,
  };
}

export async function requireSessionContext() {
  const session = await getSessionContext();

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}
