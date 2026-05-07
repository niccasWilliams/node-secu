import { z } from "zod";
import { AppSettingsKey } from "../../db/individual/individual-settings";

export const settingsListQuerySchema = z.object({}).strict();

export const settingUpdateParamsSchema = z.object({
  settingId: z.coerce.number().int().positive(),
  key: z.nativeEnum(AppSettingsKey),
});

export const settingUpdateBodySchema = z
  .object({
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.unknown()),
      z.record(z.string(), z.unknown()),
      z.null(),
    ]),
  })
  .strict();
