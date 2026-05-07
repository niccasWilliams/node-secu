import { z } from "zod";

export const loginBodySchema = z
    .object({
        email: z.string().trim().toLowerCase().email().max(320),
        password: z.string().min(8).max(256),
    })
    .strict();

export const registerBodySchema = z
    .object({
        email: z.string().trim().toLowerCase().email().max(320),
        password: z.string().min(8).max(256),
        name: z.string().trim().min(1).max(200).optional(),
    })
    .strict();

export const refreshBodySchema = z
    .object({
        refreshToken: z.string().min(20),
    })
    .strict();

export const pushTokenBodySchema = z
    .object({
        token: z.string().min(1).max(500),
        platform: z.enum(["ios", "android", "web", "expo"]),
    })
    .strict();

export const verifyEmailConfirmBodySchema = z
    .object({
        token: z.string().min(20).max(500),
    })
    .strict();

export const logoutBodySchema = z
    .object({
        refreshToken: z.string().min(20).optional(),
    })
    .strict();

export const verifyEmailLandingQuerySchema = z
    .object({
        token: z.string().min(1).max(500).optional(),
    })
    .strict();

export const emptyQuerySchema = z.object({}).strict();
export const emptyBodySchema = z.object({}).strict();
