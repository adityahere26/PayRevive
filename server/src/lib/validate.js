// AJV-based request validation, per CLAUDE.md tech stack ("ajv for both API request
// validation and AI output contract validation"). No business routes take a request body
// yet in the Day 2 foundation, so this module isn't wired into any live route — it's tested
// directly (tests/validation.test.js) against a throwaway schema/route, exactly the way it
// will be reused starting Day 3 for real request bodies.

import Ajv from "ajv";
import { ValidationError } from "./errors.js";

const ajv = new Ajv({ allErrors: true, removeAdditional: false });

/**
 * Returns Express middleware that validates req.body against a JSON schema and rejects with
 * a structured 400 VALIDATION_ERROR on failure. Never trusts the client further than this —
 * business logic re-validates anything security-sensitive (amount, ids) against stored
 * records, per SECURITY.md § Input and AI output validation.
 */
export function validateBody(schema) {
  const validateFn = ajv.compile(schema);
  return (req, _res, next) => {
    const valid = validateFn(req.body);
    if (!valid) {
      next(
        new ValidationError(
          "Request body failed validation",
          validateFn.errors?.map((e) => ({ path: e.instancePath, message: e.message }))
        )
      );
      return;
    }
    next();
  };
}
