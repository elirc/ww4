/**
 * What this file does:
 * Returns the authenticated workspace payload used to render the main application shell.
 * What calls it:
 * src/hooks/use-workspace-bootstrap.ts from the authenticated dashboard.
 * What it calls:
 * src/services/bootstrap/bootstrapService.ts and src/lib/http/responses.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning too little context and then forcing the client to fan out into many separate requests just to render the first screen.
 */
import { handleRouteError, ok } from "@/lib/http/responses";
import { bootstrapService } from "@/services/bootstrap/bootstrapService";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const data = await bootstrapService.getWorkspaceBootstrap(projectId);

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
