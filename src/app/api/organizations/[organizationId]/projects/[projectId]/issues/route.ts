/**
 * What this file does:
 * Creates new issues for a project after auth, permission, and payload validation succeed.
 * What calls it:
 * src/components/app/create-issue-form.tsx.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/issueSchemas.ts, and src/services/issues/issueService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Checking issue-create permission in the client only and assuming hidden buttons equal real security.
 */
import { requireProjectAccess } from "@/lib/auth/request-context";
import { handleRouteError, ok } from "@/lib/http/responses";
import { createIssueSchema } from "@/lib/validation/issueSchemas";
import { issueService } from "@/services/issues/issueService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; projectId: string }> },
) {
  try {
    const { organizationId, projectId } = await params;
    const { session, access } = await requireProjectAccess({
      organizationId,
      projectId,
      permission: "issue:create",
    });
    const payload = createIssueSchema.parse(await request.json());
    const issue = await issueService.createIssue({
      access,
      actorUserId: session.user.id,
      payload,
    });

    return ok(issue, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
