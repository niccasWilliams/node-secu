// Asset-Service — CRUD + ergeflexible Lookups.

import { database } from "@/db";
import { assets, type Asset, type NewAsset } from "@/db/individual/individual-schema";
import { and, desc, eq } from "drizzle-orm";

export const assetService = {
    async create(input: Omit<NewAsset, "id" | "createdAt" | "updatedAt">): Promise<Asset> {
        const rows = await database.insert(assets).values(input).returning();
        return rows[0]!;
    },

    async findOrCreate(input: {
        kind: NewAsset["kind"];
        value: string;
        ownerUserId?: number | null;
        label?: string;
        isOwnInfrastructure?: boolean;
    }): Promise<Asset> {
        const existing = await database.query.assets.findFirst({
            where: and(
                eq(assets.value, input.value),
                eq(assets.kind, input.kind),
                input.ownerUserId != null ? eq(assets.ownerUserId, input.ownerUserId) : undefined as any,
            ),
        });
        if (existing) return existing;
        return this.create({
            kind: input.kind,
            value: input.value,
            ownerUserId: input.ownerUserId ?? null,
            label: input.label ?? null,
            isOwnInfrastructure: input.isOwnInfrastructure ?? false,
        });
    },

    async getById(id: number): Promise<Asset | undefined> {
        return database.query.assets.findFirst({ where: eq(assets.id, id) });
    },

    async listForUser(userId: number, opts?: { activeOnly?: boolean }): Promise<Asset[]> {
        const where = opts?.activeOnly
            ? and(eq(assets.ownerUserId, userId), eq(assets.isActive, true))
            : eq(assets.ownerUserId, userId);
        return database.select().from(assets).where(where).orderBy(desc(assets.createdAt));
    },
};
