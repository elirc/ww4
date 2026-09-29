/**
 * What this file does:
 * Processes a batch of pending automation jobs for a project using the current authenticated actor as the processor.
 * What calls it:
 * src/components/app/workspace-shell.tsx when an authorized user triggers automation processing.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/automationSchemas.ts, and src/services/automation/automationService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Running job processing without a permission check because it feels “internal,” even though this endpoint is exposed over HTTP.
 */
import { requireProjectAccess } from "@/lib/auth/request-context";
import { handleRouteError, ok } from "@/lib/http/responses";
import { processAutomationJobsSchema } from "@/lib/validation/automationSchemas";
import { automationService } from "@/services/automation/automationService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const payload = processAutomationJobsSchema.parse(await request.json());
    const { session, access } = await requireProjectAccess({
      organizationId,
      projectId: payload.projectId,
      permission: "job:process",
    });
    const result = await automationService.processPendingJobs({
      access,
      actorUserId: session.user.id,
      limit: payload.limit,
    });

    return ok({
      processed: result.length,
      jobs: result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
