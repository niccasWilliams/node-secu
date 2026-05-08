// Playbook-Registry — kennt alle deklarierten Playbooks per `key`.
//
// Bootstrap (siehe ../bootstrap.ts) ruft `registerPlaybook()` einmalig pro
// Phase-2-Definition. API-Endpoints, Rule-Engine (Phase 2.5) und der Runner
// schlagen Playbooks ausschließlich über `getPlaybook(key)` nach.

import type { Playbook } from "./playbook.types";

const REGISTRY = new Map<string, Playbook>();

export function registerPlaybook(playbook: Playbook): void {
    if (REGISTRY.has(playbook.key)) {
        // Idempotent — bei Hot-Reload oder doppeltem Bootstrap kein Crash.
        REGISTRY.set(playbook.key, playbook);
        return;
    }
    REGISTRY.set(playbook.key, playbook);
}

export function getPlaybook(key: string): Playbook | undefined {
    return REGISTRY.get(key);
}

export function listPlaybooks(): Playbook[] {
    return [...REGISTRY.values()];
}
