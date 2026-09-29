/**
 * What this file does:
 * Updates an existing issue, including workflow transitions and custom-field changes.
 * What calls it:
 * src/components/app/workspace-shell.tsx when the user saves issue edits.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/issueSchemas.ts, and src/services/issues/issueService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating status changes as just another field update even though they have stricter business rules.
 */
import { requireProjectAccess } from "@/lib/auth/request-context";
import { handleRouteError, ok } from "@/lib/http/responses";
import { updateIssueSchema } from "@/lib/validation/issueSchemas";
import { issueService } from "@/services/issues/issueService";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; projectId: string; issueId: string }> },
) {
  try {
    const { organizationId, projectId, issueId } = await params;
    const { session, access } = await requireProjectAccess({
      organizationId,
      projectId,
      permission: "issue:edit",
    });
    const payload = updateIssueSchema.parse(await request.json());
    const issue = await issueService.updateIssue({
      access,
      actorUserId: session.user.id,
      issueId,
      payload,
    });

    return ok(issue);
  } catch (error) {
    return handleRouteError(error);
  }
}
