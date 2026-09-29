/**
 * What this file does:
 * Owns all database queries for users and sessions so authentication stays separate from HTTP and business logic.
 * What calls it:
 * src/lib/auth/session.ts and src/services/auth/authService.ts.
 * What it calls:
 * src/lib/db.ts for Prisma access.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Querying a session token without also loading the user's memberships, which makes later permission checks perform extra lookups or silently skip tenant context.
 */
import { db } from "@/lib/db";

export const authRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });
  },

  createSession(input: {
    tokenHash: string;
    userId: string;
    activeOrganizationId: string;
    expiresAt: Date;
  }) {
    return db.session.create({
      data: input,
      include: {
        user: true,
        activeOrganization: true,
      },
    });
  },

  findSessionByTokenHash(tokenHash: string) {
    return db.session.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        activeOrganization: true,
      },
    });
  },

  listMembershipsForUser(userId: string) {
    return db.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  updateSessionHeartbeat(sessionId: string, activeOrganizationId: string) {
    return db.session.update({
      where: { id: sessionId },
      data: {
        activeOrganizationId,
        lastSeenAt: new Date(),
      },
    });
  },

  deleteSessionByTokenHash(tokenHash: string) {
    return db.session.deleteMany({
      where: { tokenHash },
    });
  },
};
