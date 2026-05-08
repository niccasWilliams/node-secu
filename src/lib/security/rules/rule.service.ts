// Rule-Service — CRUD + In-Memory-Cache der enabled rules.
//
// Der Evaluator (rule-evaluator.ts) ruft `getEnabledForTrigger()` synchron beim
// Event-Handling — daher halten wir eine Map im Speicher und invalidieren sie
// nur, wenn ein CRUD-Pfad eine Regel ändert. Bei jedem `enable`/`disable`/
// `update`/`create`/`delete` re-laden wir den Cache aus der DB.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    rules,
    type NewRule,
    type Rule,
    type RuleAction,
    type RuleTrigger,
} from "@/db/individual/individual-schema";

export type RuleListFilters = {
    trigger?: RuleTrigger;
    enabled?: boolean;
    scope?: string;
    limit?: number;
    offset?: number;
    sortBy?: "createdAt" | "updatedAt" | "name" | "fireCount" | "lastFiredAt";
    order?: "asc" | "desc";
    search?: string;
};

export type RuleCreateInput = {
    name: string;
    description?: string | null;
    scope?: string;
    trigger: RuleTrigger;
    action: RuleAction;
    condition?: Record<string, unknown> | null;
    actionParams?: Record<string, unknown>;
    enabled?: boolean;
    createdBy?: number | null;
};

export type RuleUpdateInput = Partial<Omit<RuleCreateInput, "createdBy">>;

let cache: Rule[] | null = null;

export const ruleService = {
    async list(filters: RuleListFilters = {}): Promise<Rule[]> {
        const conditions = [];
        if (filters.trigger) conditions.push(eq(rules.trigger, filters.trigger));
        if (filters.enabled !== undefined) conditions.push(eq(rules.enabled, filters.enabled));
        if (filters.scope) conditions.push(eq(rules.scope, filters.scope));
        if (filters.search && filters.search.trim()) {
            const term = `%${filters.search.trim()}%`;
            conditions.push(sql`(${rules.name} ILIKE ${term} OR ${rules.description} ILIKE ${term})`);
        }

        const sortColumn = (() => {
            switch (filters.sortBy) {
                case "updatedAt": return rules.updatedAt;
                case "name": return rules.name;
                case "fireCount": return rules.fireCount;
                case "lastFiredAt": return rules.lastFiredAt;
                case "createdAt": return rules.createdAt;
                default: return null;
            }
        })();
        const orderClause = sortColumn
            ? [filters.order === "asc" ? asc(sortColumn) : desc(sortColumn)]
            : [desc(rules.enabled), asc(rules.id)];

        let query = database
            .select()
            .from(rules)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(...orderClause)
            .$dynamic();
        if (filters.limit != null) query = query.limit(filters.limit);
        if (filters.offset != null) query = query.offset(filters.offset);
        return query;
    },

    async getById(id: number): Promise<Rule | null> {
        const [row] = await database.select().from(rules).where(eq(rules.id, id)).limit(1);
        return row ?? null;
    },

    async create(input: RuleCreateInput): Promise<Rule> {
        const row: NewRule = {
            name: input.name.trim(),
            description: input.description?.trim() ?? null,
            scope: input.scope?.trim() ?? "global",
            trigger: input.trigger,
            action: input.action,
            condition: input.condition ?? null,
            actionParams: input.actionParams ?? {},
            enabled: input.enabled ?? true,
            createdBy: input.createdBy ?? null,
        };
        const [created] = await database.insert(rules).values(row).returning();
        invalidateCache();
        return created;
    },

    async update(id: number, input: RuleUpdateInput): Promise<Rule | null> {
        const patch: Partial<Rule> = {};
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.description !== undefined) patch.description = input.description?.trim() ?? null;
        if (input.scope !== undefined) patch.scope = input.scope.trim();
        if (input.trigger !== undefined) patch.trigger = input.trigger;
        if (input.action !== undefined) patch.action = input.action;
        if (input.condition !== undefined) patch.condition = input.condition ?? null;
        if (input.actionParams !== undefined) patch.actionParams = input.actionParams;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        patch.updatedAt = new Date();

        const [updated] = await database.update(rules).set(patch).where(eq(rules.id, id)).returning();
        invalidateCache();
        return updated ?? null;
    },

    async delete(id: number): Promise<boolean> {
        const out = await database.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id });
        invalidateCache();
        return out.length > 0;
    },

    /** Wird vom Evaluator pro Event aufgerufen — Cache bleibt heiß. */
    async getEnabledForTrigger(trigger: RuleTrigger): Promise<Rule[]> {
        if (!cache) cache = await loadCache();
        return cache.filter((r) => r.enabled && r.trigger === trigger);
    },

    /** Vom Evaluator nach erfolgreicher Ausführung — Telemetrie. */
    async recordFire(ruleId: number): Promise<void> {
        await database
            .update(rules)
            .set({
                fireCount: sql`${rules.fireCount} + 1`,
                lastFiredAt: new Date(),
            })
            .where(eq(rules.id, ruleId));
        // Wir invalidieren den Cache hier *nicht* — fireCount/lastFiredAt
        // sind nur Telemetrie, und der Cache wird beim nächsten CRUD-Touch
        // sowieso erneuert.
    },

    /** Test-Helper / Bootstrap. */
    invalidateCache,
};

function invalidateCache(): void {
    cache = null;
}

async function loadCache(): Promise<Rule[]> {
    return database.select().from(rules).where(eq(rules.enabled, true));
}
