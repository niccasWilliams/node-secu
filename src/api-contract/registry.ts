/**
 * Central API contract registry.
 *
 * This is the single source of truth for OpenAPI + generated frontend route typings.
 * Keep it stable and append new routes incrementally.
 */
import type { RouteSpec } from "./contract.types";

export const apiRegistry: RouteSpec[] = [];

export function registerApiRoutes(...routes: RouteSpec[]) {
  apiRegistry.push(...routes);
}


