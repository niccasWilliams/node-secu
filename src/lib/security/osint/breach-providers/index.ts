// Phase 2.7 — Breach-Provider-Registry.
//
// Aktuell nur HIBP — Phase 2.8 stöpselt DeHashed/LeakCheck/IPQS dazu.
// Jeder Provider implementiert `BreachProvider`. Der Worker iteriert über alle
// configured-Provider und merged die Hits.

import type { BreachProvider } from "../breach-provider.types";
import { hibpBreachProvider } from "./hibp.provider";

const REGISTRY: BreachProvider[] = [hibpBreachProvider];

export function listConfiguredBreachProviders(): BreachProvider[] {
    return REGISTRY.filter((p) => p.isConfigured());
}

export function listAllBreachProviders(): BreachProvider[] {
    return [...REGISTRY];
}

export function registerBreachProvider(p: BreachProvider): void {
    if (!REGISTRY.some((x) => x.key === p.key)) REGISTRY.push(p);
}
