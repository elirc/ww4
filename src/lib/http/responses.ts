/**
 * What this file does:
 * Translates thrown application errors into stable JSON API responses for Next.js route handlers.
 * What calls it:
 * Every route file under src/app/api uses handleRouteError in its catch block.
 * What it calls:
 * src/lib/http/errors.ts to recognize typed failures and NextResponse to serialize them.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning ad hoc response shapes per route, which makes frontend error handling and docs drift apart quickly.
 */
import { ZodError } from "zod";
import { NextResponse } from "next/server";

import { AppError, BadRequestError } from "@/lib/http/errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    const badRequest = new BadRequestError("Validation failed.", error.flatten());

    return NextResponse.json(
      {
        error: badRequest.message,
        details: badRequest.details,
      },
      { status: badRequest.statusCode },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        details: error.details ?? null,
      },
      { status: error.statusCode },
    );
  }

  // ⚠️ SENIOR NOTE: Never leak raw unknown errors to clients; stack traces often expose table names and internal assumptions.
  console.error(error);

  return NextResponse.json(
    {
      error: "An unexpected server error occurred.",
    },
    { status: 500 },
  );
}
