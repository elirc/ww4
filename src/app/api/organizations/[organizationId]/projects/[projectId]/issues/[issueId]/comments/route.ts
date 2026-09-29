/**
 * What this file does:
 * Adds a comment to an issue after tenant, project, and permission checks succeed.
 * What calls it:
 * src/components/app/comment-form.tsx.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/issueSchemas.ts, and src/services/issues/issueService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Accepting a comment for any issue id without confirming the issue belongs to the current project and organization.
 */
import { requireProjectAccess } from "@/lib/auth/request-context";
import { handleRouteError, ok } from "@/lib/http/responses";
import { addCommentSchema } from "@/lib/validation/issueSchemas";
import { issueService } from "@/services/issues/issueService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; projectId: string; issueId: string }> },
) {
  try {
    const { organizationId, projectId, issueId } = await params;
    const { session, access } = await requireProjectAccess({
      organizationId,
      projectId,
      permission: "comment:create",
    });
    const payload = addCommentSchema.parse(await request.json());
    const comment = await issueService.addComment({
      access,
      actorUserId: session.user.id,
      issueId,
      body: payload.body,
    });

    return ok(comment, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
