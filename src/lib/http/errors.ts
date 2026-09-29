/**
 * What this file does:
 * Defines the explicit application error types that route handlers convert into HTTP responses.
 * What calls it:
 * Service files such as issue and project services throw these errors when business rules fail.
 * What it calls:
 * Nothing; this is the shared error vocabulary for the app.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Throwing generic Error everywhere, which makes permission failures, validation failures, and missing records impossible to review consistently.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state.") {
    super(message, 409);
    this.name = "ConflictError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "The request payload is invalid.", details?: unknown) {
    super(message, 400, details);
    this.name = "BadRequestError";
  }
}
