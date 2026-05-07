/**
 * OAuth2 Tenant Configuration (Individual)
 *
 * THIS FILE IS NOT SYNCED WITH THE TEMPLATE.
 * Configure tenant isolation for OAuth2 clients.
 *
 * When enabled: false (default), OAuth2 clients are global (no tenant isolation).
 * When enabled: true, each OAuth2 client is bound to a tenant entity.
 *
 * Example for node-bill (tenant = Managing Company):
 * ```typescript
 * export const OAUTH2_TENANT_CONFIG: OAuth2TenantConfig = {
 *     enabled: true,
 *     tenantField: "managingCompanyId",
 *     resourceFields: [
 *         { field: "defaultCostCenter", type: "number" },
 *         { field: "availableCostCenters", type: "number[]" },
 *     ],
 * };
 * ```
 *
 * NOTE: When enabling tenants, you must also:
 * 1. Add the tenant column + resource columns to oauth2_clients via DB migration
 * 2. Ensure getManagingCompanyIdFromRequest() works in your app's utils.ts
 * 3. If using API Key auth: ensure companyApiKeyUseCase exists at
 *    @/routes/managing-companies/company-api-keys/company-api-key.useCase
 */

export type OAuth2TenantResourceField = {
    field: string;
    type: "number" | "number[]" | "string" | "string[]";
};

export type OAuth2TenantConfig =
    | { enabled: false }
    | {
          enabled: true;
          /** Column name in oauth2_clients table (e.g. "managingCompanyId") */
          tenantField: string;
          /** Sub-resource fields embedded in JWT (e.g. costCenters, defaultCostCenter) */
          resourceFields?: OAuth2TenantResourceField[];
      };

export const OAUTH2_TENANT_CONFIG: OAuth2TenantConfig = {
    enabled: false,
};
