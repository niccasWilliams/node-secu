/**
 * Tenant Utilities (Individual)
 *
 * THIS FILE IS NOT SYNCED WITH THE TEMPLATE.
 *
 * Apps with tenant isolation (e.g. node-bill with Managing Companies)
 * override this file to resolve the tenant context from requests.
 *
 * Default: returns null (no tenant system).
 */

import { Request } from "express";

/**
 * Resolves the managing company (tenant) ID from the current request.
 *
 * Checks in order:
 * 1. API Key (Bearer nbill_live_... / nbill_test_...)
 * 2. User session (selected company)
 *
 * Override this in apps with tenant isolation.
 * Default (no tenant): always returns null.
 */
export async function getManagingCompanyIdFromRequest(_req: Request): Promise<number | null> {
    return null;
}
