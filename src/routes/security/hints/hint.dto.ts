import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";

export const hintSlot = z.enum([
    "owner_name",
    "owner_city",
    "owner_company",
    "owner_known_email",
    "owner_known_username",
    "owner_alt_domain",
    "industry",
    "free_text",
]);
ui(hintSlot, {
    label: "Slot",
    widget: "select",
    group: "Hint",
    options: [
        { value: "owner_name", label: "Inhaber-Name" },
        { value: "owner_city", label: "Stadt" },
        { value: "owner_company", label: "Firma" },
        { value: "owner_known_email", label: "Bekannte E-Mail" },
        { value: "owner_known_username", label: "Bekannter Username" },
        { value: "owner_alt_domain", label: "Alternative Domain" },
        { value: "industry", label: "Branche" },
        { value: "free_text", label: "Freitext" },
    ],
});

const hintItem = z
    .object({
        slot: hintSlot,
        value: ui(z.string().min(1).max(1024), { label: "Wert", widget: "text", group: "Hint" }),
        source: ui(z.string().max(64).nullable().optional(), {
            label: "Quelle",
            widget: "text",
            group: "Hint",
            placeholder: "z.B. impressum, linkedin, vermutung",
        }),
        notes: ui(z.string().max(2048).nullable().optional(), {
            label: "Notiz",
            widget: "textarea",
            group: "Hint",
        }),
    })
    .strict();

export const hintCreateBodySchema = z
    .object({
        items: z.array(hintItem).min(1).max(50),
    })
    .strict();

export const hintStatus = z.enum(["pending", "converted", "dismissed"]);
ui(hintStatus, {
    label: "Status",
    widget: "select",
    group: "Hint",
    options: [
        { value: "pending", label: "Offen", description: "Wird von Workern als Seed konsumiert", color: "info" },
        { value: "converted", label: "Übernommen", description: "Wurde in eine Entity überführt", color: "success" },
        { value: "dismissed", label: "Verworfen", description: "Vom Operator als irrelevant markiert", color: "neutral" },
    ],
});

export const hintPatchBodySchema = z
    .object({
        value: ui(z.string().min(1).max(1024).optional(), { label: "Wert", widget: "text", group: "Hint" }),
        source: ui(z.string().max(64).nullable().optional(), { label: "Quelle", widget: "text", group: "Hint" }),
        notes: ui(z.string().max(2048).nullable().optional(), { label: "Notiz", widget: "textarea", group: "Hint" }),
        status: hintStatus.optional(),
        convertedToEntityId: z.number().int().positive().nullable().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, {
        message: "At least one of value/source/notes/status/convertedToEntityId is required",
    });

export const hintListQuerySchema = z.object({
    status: hintStatus.optional(),
    slot: hintSlot.optional(),
}).strict();

export const engagementHintsParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const engagementHintByIdParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    hintId: z.coerce.number().int().positive(),
});

export type HintCreateBody = z.infer<typeof hintCreateBodySchema>;
export type HintPatchBody = z.infer<typeof hintPatchBodySchema>;
export type HintListQuery = z.infer<typeof hintListQuerySchema>;
