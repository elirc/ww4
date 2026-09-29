/**
 * What this file does:
 * Saves tenant-scoped issue filters for a project, with explicit shared-filter permission checks.
 * What calls it:
 * src/components/app/save-filter-form.tsx.
 * What it calls:
 * src/lib/auth/request-context.ts, src/lib/validation/filterSchemas.ts, and src/services/filters/filterService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Validating only the filter name while allowing unsupported query operators to slip into saved JSON.
 */
import { handleRouteError, ok } from "@/lib/http/responses";
import { requireProjectAccess } from "@/lib/auth/request-context";
import { saveFilterSchema } from "@/lib/validation/filterSchemas";
import { filterService } from "@/services/filters/filterService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const payload = saveFilterSchema.parse(await request.json());
    const { session, access } = await requireProjectAccess({
      organizationId,
      projectId: payload.query.projectId,
      permission: "filter:create",
    });
    const filter = await filterService.createFilter({
      access,
      actorUserId: session.user.id,
      payload: {
        name: payload.name,
        isShared: payload.isShared,
        query: payload.query,
      },
    });

    return ok(filter, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
