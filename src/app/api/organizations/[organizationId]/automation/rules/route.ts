/**
 * What this file does:
 * Creates automation rules for a project after validating the event and action payload shape.
 * What calls it:
 * src/components/app/automation-rule-form.tsx.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/automationSchemas.ts, and src/services/automation/automationService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Accepting a rule for one project while authorizing against another project from the URL or client state.
 */
import { requireProjectAccess } from "@/lib/auth/request-context";
import { handleRouteError, ok } from "@/lib/http/responses";
import { createAutomationRuleSchema } from "@/lib/validation/automationSchemas";
import { automationService } from "@/services/automation/automationService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const payload = createAutomationRuleSchema.parse(await request.json());
    const { access } = await requireProjectAccess({
      organizationId,
      projectId: payload.projectId,
      permission: "automation:manage",
    });
    const rule = await automationService.createRule({
      access,
      payload,
    });

    return ok(rule, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
