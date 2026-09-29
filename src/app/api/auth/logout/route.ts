/**
 * What this file does:
 * Clears the current session cookie and deletes the backing session record.
 * What calls it:
 * src/components/app/workspace-shell.tsx when the user logs out.
 * What it calls:
 * src/services/auth/authService.ts and src/lib/http/responses.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Deleting only the browser cookie and forgetting the server-side session record can still be replayed if stolen.
 */
import { handleRouteError, ok } from "@/lib/http/responses";
import { authService } from "@/services/auth/authService";

export async function POST() {
  try {
    await authService.logout();

    return ok({
      success: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
