/**
 * What this file does:
 * Handles login requests by validating credentials and delegating session creation to the auth service.
 * What calls it:
 * src/components/auth/login-form.tsx via a POST to /api/auth/login.
 * What it calls:
 * src/lib/validation/authSchemas.ts, src/services/auth/authService.ts, and src/lib/http/responses.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Putting password verification directly in the route, which duplicates auth logic and makes it harder to test outside HTTP.
 */
import { handleRouteError, ok } from "@/lib/http/responses";
import { loginSchema } from "@/lib/validation/authSchemas";
import { authService } from "@/services/auth/authService";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    await authService.login(payload);

    return ok({
      success: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
