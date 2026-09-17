import { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch rejected promises from async route handlers, so a
// query failure would otherwise hang the request instead of producing a
// response. Wrapping every async handler forwards the rejection to next(err)
// and on to the error-handling middleware in index.ts.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
