import { z } from "zod";
import { validate, type ValidatedRequest } from "@/api-contract/contract.middleware";

describe("api-contract/validate middleware", () => {
  const createRes = () => {
    const res: any = {
      statusCode: 200,
      body: undefined,
      status: jest.fn(function status(this: any, code: number) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function json(this: any, payload: any) {
        this.body = payload;
        return this;
      }),
    };
    return res;
  };

  it("attaches parsed params/query/body to req.validated", () => {
    const mw = validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ page: z.coerce.number().int().min(1) }),
      body: z.object({ name: z.string().min(1) }),
    });

    const req = {
      params: { id: "42" },
      query: { page: "2" },
      body: { name: "Acme" },
    } as any as ValidatedRequest;
    const res = createRes();
    const next = jest.fn();

    mw(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validated).toEqual({
      params: { id: 42 },
      query: { page: 2 },
      body: { name: "Acme" },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 when query validation fails", () => {
    const mw = validate({
      query: z.object({ page: z.coerce.number().int().min(1) }),
    });

    const req = {
      params: {},
      query: { page: "0" },
      body: {},
    } as any as ValidatedRequest;
    const res = createRes();
    const next = jest.fn();

    mw(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toMatchObject({ success: false, data: null });
    expect(typeof res.body.message).toBe("string");
  });

  it("returns 400 when body is invalid and does not write req.validated.body", () => {
    const mw = validate({
      body: z.object({ enabled: z.boolean() }).strict(),
    });

    const req = {
      params: {},
      query: {},
      body: { enabled: "yes" },
    } as any as ValidatedRequest;
    const res = createRes();
    const next = jest.fn();

    mw(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(req.validated?.body).toBeUndefined();
  });
});
