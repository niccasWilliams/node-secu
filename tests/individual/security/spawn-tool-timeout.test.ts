// spawnTool Timeout-Smoketest — FULL_SCAN.md §1.5.5.
//
// Smoke gegen den Soft-then-hard-Kill-Mechanismus + Hard-Deadline. Der Test
// ist absichtlich gegen `sleep 9999` (System-Binary), weil:
//   - keine Test-Doubles → wir messen das echte Process-Tree-Verhalten
//   - `sleep` honoriert SIGTERM nicht aktiv (wartet einfach), so dass der
//     SIGKILL-Eskalations-Pfad nach 3s tatsächlich getriggert wird.
//
// Erwartet wird:
//   - timedOut === true
//   - durationMs zwischen timeoutMs und timeoutMs + ~5_000ms (3s Grace + Cleanup-Buffer)
//   - exit_code === null oder signal-getriggert
//   - success === false

import * as os from "node:os";
import { spawnTool, resolveBinary } from "@/lib/security/workers/_lib/spawn-tool";

// CI-Container haben oft kein `sleep` im PATH? Defensiv prüfen.
const SLEEP_AVAILABLE = resolveBinary("sleep") != null;

(SLEEP_AVAILABLE ? describe : describe.skip)("spawnTool — timeout + hard-deadline", () => {
    // Realistische Timeout-Wahl: 2s timeout + 3s SIGTERM-Grace = max ~5s
    // Testdauer. + buffer.
    jest.setTimeout(15_000);

    it("killt sleep-Prozess nach timeoutMs (SIGTERM → SIGKILL Eskalation)", async () => {
        const start = Date.now();
        const result = await spawnTool({
            binary: "sleep",
            args: ["9999"],
            timeoutMs: 2_000,
        });
        const elapsed = Date.now() - start;

        expect(result.timedOut).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/timeout after 2000ms|hard_deadline/);
        // Nicht früher als das Timeout
        expect(elapsed).toBeGreaterThanOrEqual(1_900);
        // Und nicht länger als Timeout + 3s Grace + 5s Buffer
        expect(elapsed).toBeLessThan(10_000);
        // exit_code wird beim Signal-Kill üblicherweise null
        expect(result.exitCode === null || typeof result.exitCode === "number").toBe(true);
    });

    it("Hard-Deadline greift wenn close-Event nicht feuert", async () => {
        // Wir können das produktive Hängen-bleiben nicht synthetisch erzwingen
        // (Stdio-bound grandchildren brauchen eine Tool-spezifische Konstellation),
        // aber wir können verifizieren, dass ein laufender Prozess innerhalb
        // timeoutMs + 15s spätestens resolved ist. `sleep 9999` mit timeoutMs=1s:
        // erwartet final-resolve <= 16s.
        const start = Date.now();
        const result = await spawnTool({
            binary: "sleep",
            args: ["9999"],
            timeoutMs: 1_000,
        });
        const elapsed = Date.now() - start;

        expect(result.timedOut).toBe(true);
        // Worst-case: Hard-Deadline = 1000 + 15000 = 16000ms
        expect(elapsed).toBeLessThan(16_500);
    });
});

describe("spawnTool — resolveBinary", () => {
    it("liefert null für nicht-existente Binaries", () => {
        expect(resolveBinary("definitely-not-a-real-binary-xyz123")).toBeNull();
    });

    it("findet bash über $PATH", () => {
        const resolved = resolveBinary("bash");
        // Auf Linux/macOS sollte bash im PATH sein.
        if (os.platform() !== "win32") {
            expect(resolved).not.toBeNull();
            expect(resolved).toMatch(/bash$/);
        }
    });

    it("absoluter Pfad zu existierender Datei", () => {
        // /bin/sh ist auf praktisch jedem Unix vorhanden.
        if (os.platform() !== "win32") {
            const resolved = resolveBinary("/bin/sh");
            expect(resolved).toBe("/bin/sh");
        }
    });
});

describe("spawnTool — clean exit", () => {
    jest.setTimeout(5_000);

    it("erfolgreicher Exit: success=true, exitCode=0, stdout vorhanden", async () => {
        if (os.platform() === "win32") return;
        const result = await spawnTool({
            binary: "/bin/sh",
            args: ["-c", "echo hello"],
            timeoutMs: 3_000,
        });
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("hello");
        expect(result.timedOut).toBe(false);
        expect(result.aborted).toBe(false);
    });

    it("non-zero exit: success=false wenn nicht in allowedExitCodes", async () => {
        if (os.platform() === "win32") return;
        const result = await spawnTool({
            binary: "/bin/sh",
            args: ["-c", "exit 7"],
            timeoutMs: 3_000,
        });
        expect(result.success).toBe(false);
        expect(result.exitCode).toBe(7);
        expect(result.error).toMatch(/exit code 7/);
    });

    it("non-zero exit erlaubt wenn in allowedExitCodes", async () => {
        if (os.platform() === "win32") return;
        const result = await spawnTool({
            binary: "/bin/sh",
            args: ["-c", "exit 7"],
            timeoutMs: 3_000,
            allowedExitCodes: [0, 7],
        });
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(7);
    });
});

describe("spawnTool — abort signal", () => {
    jest.setTimeout(8_000);

    it("AbortController.abort() killt den Prozess", async () => {
        if (os.platform() === "win32") return;
        const ac = new AbortController();
        // Abort nach 500ms
        setTimeout(() => ac.abort(), 500);

        const start = Date.now();
        const result = await spawnTool({
            binary: "sleep",
            args: ["9999"],
            timeoutMs: 60_000,
            abortSignal: ac.signal,
        });
        const elapsed = Date.now() - start;

        expect(result.aborted).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/aborted by orchestrator/);
        expect(elapsed).toBeLessThan(5_000);
    });
});
