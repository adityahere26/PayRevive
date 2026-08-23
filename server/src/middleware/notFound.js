import { NotFoundError } from "../lib/errors.js";

export function notFound(req, _res, next) {
  next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
}
