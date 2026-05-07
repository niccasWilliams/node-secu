import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { RouteSpec } from "./contract.types";
import type { ZodTypeAny, z } from "zod";

export type ContractMeta = Partial<
  Pick<RouteSpec, "operationId" | "tags" | "summary" | "description" | "auth" | "responses" | "request">
>;

const CONTRACT_META = Symbol.for("node-bill.contract.meta");

export type ContractTaggedHandler = RequestHandler & {
  [CONTRACT_META]?: ContractMeta;
};

export function contract(meta: ContractMeta): ContractTaggedHandler {
  const noop: any = (_req: Request, _res: Response, next: NextFunction) => next();
  noop[CONTRACT_META] = meta;
  return noop as ContractTaggedHandler;
}

const VALIDATION_META = Symbol.for("node-bill.contract.validation");

export type ValidationMeta = {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  bodyContentType?: "application/json" | "multipart/form-data" | "application/x-www-form-urlencoded";
};

export type ValidationTaggedHandler = RequestHandler & {
  [VALIDATION_META]?: ValidationMeta;
};

export interface ValidatedRequest extends Request {
  validated?: {
    params?: any;
    query?: any;
    body?: any;
  };
}

/**
 * Zod validation middleware for params/query/body.
 *
 * - Attaches parsed values to `req.validated`.
 * - Also tags the middleware so the contract router can auto-pick schemas.
 */
export function validate(spec: ValidationMeta): ValidationTaggedHandler {
  const mw: any = (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = req as ValidatedRequest;
      r.validated ??= {};

      if (spec.params) {
        const p = spec.params.safeParse(req.params);
        if (!p.success) return res.status(400).json({ success: false, message: p.error.message, data: null });
        r.validated.params = p.data;
      }

      if (spec.query) {
        const q = spec.query.safeParse(req.query);
        if (!q.success) return res.status(400).json({ success: false, message: q.error.message, data: null });
        r.validated.query = q.data;
      }

      if (spec.body) {
        const b = spec.body.safeParse((req as any).body);
        if (!b.success) return res.status(400).json({ success: false, message: b.error.message, data: null });
        r.validated.body = b.data;
      }

      return next();
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e?.message ?? "Internal Server Error", data: null });
    }
  };

  mw[VALIDATION_META] = spec;
  return mw as ValidationTaggedHandler;
}

export function getContractMeta(handler: any): ContractMeta | undefined {
  return handler?.[CONTRACT_META];
}

export function getValidationMeta(handler: any): ValidationMeta | undefined {
  return handler?.[VALIDATION_META];
}

