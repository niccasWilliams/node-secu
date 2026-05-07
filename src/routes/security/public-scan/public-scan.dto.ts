import { z } from "zod";

const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export const publicScanInputSchema = z.object({
    domain: z.string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(253)
        .refine((v) => domainRegex.test(v), { message: "must_be_valid_domain" }),
    email: z.string().email().max(320).optional(),
    name: z.string().trim().max(255).optional(),
    company: z.string().trim().max(255).optional(),
    agreedToFollowup: z.boolean().optional(),
    consent: z.literal(true).describe("user explicitly authorizes the passive scan of this domain"),
    referrer: z.string().max(512).optional(),
    utmSource: z.string().max(128).optional(),
    utmCampaign: z.string().max(128).optional(),
}).strict();

export type PublicScanInput = z.infer<typeof publicScanInputSchema>;
