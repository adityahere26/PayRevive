// Uniform API error shape — see ARCHITECTURE.md § API contract:
//   { error: { code, message, requestId } }
// Route/middleware code throws ApiError (or a subclass); errorHandler.js is the only place
// that turns it into an HTTP response, so every error path looks the same to the client.

export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(code = "UNAUTHORIZED", message = "Authentication required") {
    super(401, code, message);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Request failed validation", details = undefined) {
    super(400, "VALIDATION_ERROR", message);
    this.details = details;
  }
}

export class RateLimitedError extends ApiError {
  constructor(message = "Too many requests") {
    super(429, "RATE_LIMITED", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Request conflicts with the resource's current state") {
    super(409, "CONFLICT", message);
  }
}
