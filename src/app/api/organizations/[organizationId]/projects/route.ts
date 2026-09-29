/**
 * What this file does:
 * Creates projects inside an organization after validating the workflow and custom-field template payload.
 * What calls it:
 * src/components/app/create-project-form.tsx through POST /api/organizations/[organizationId]/projects.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/projectSchemas.ts, and src/services/projects/projectService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting the organizationId route param without checking the current user actually belongs to that organization.
 */
import { handleRouteError, ok } from "@/lib/http/responses";
import { requireOrganizationContext } from "@/lib/auth/request-context";
import { createProjectSchema } from "@/lib/validation/projectSchemas";
import { projectService } from "@/services/projects/projectService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const { session, organization } = await requireOrganizationContext(organizationId);
    const payload = createProjectSchema.parse(await request.json());
    const project = await projectService.createProject({
      organizationId,
      actor: {
        userId: session.user.id,
        organizationRole: organization.role,
      },
      payload: {
        ...payload,
        customFields: payload.customFields.map((field) => ({
          ...field,
          config: field.config ?? null,
        })),
      },
    });

    return ok(
      {
        id: project.id,
        key: project.key,
        name: project.name,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
