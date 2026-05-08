// Tool-Spawn-Helper — wiederverwendbar für CLI-Worker (subfinder, testssl, nuclei, nmap, …).
//
// Verantwortet:
//   - Binary-Resolution mit Env-Var-Override und Default-Pfaden
//   - Spawn mit Timeout + AbortSignal
//   - stdout/stderr capture (bounded, gegen unbegrenzten Memory-Burn)
//   - JSON / JSONL Parsing
//   - Strukturiertes Result-Objekt für Worker

import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const HOME = os.homedir();

/** Maximale Bytes, die wir aus stdout/stderr im Speicher halten (1 MB pro Stream). */
const MAX_BUFFER_BYTES = 1024 * 1024;

export interface SpawnToolOptions {
    /** Pflicht: Absoluter Pfad ODER Binary-Name in $PATH. Wir versuchen Resolution. */
    binary: string;
    /** Argumente. Werden NICHT durch eine Shell geparst → kein Injection-Risiko. */
    args: string[];
    /** Timeout in ms — 0 = no limit (nicht empfohlen). */
    timeoutMs: number;
    /** AbortSignal vom Worker-Context. */
    abortSignal?: AbortSignal;
    /** Optional: Working directory. */
    cwd?: string;
    /** Optional: Env-Override (default = process.env). */
    env?: NodeJS.ProcessEnv;
    /** Optional: Erlaubte Exit-Codes (default: [0]). Nuclei z.B. exit 0 auch ohne Funde. */
    allowedExitCodes?: number[];
    /** Optional: Fallback-Pfade falls binary in $PATH nicht gefunden. */
    fallbackPaths?: string[];
}

export interface SpawnToolResult {
    success: boolean;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    /** Wenn true: Tool wurde wegen Timeout/Abort abgebrochen, kein normaler Exit. */
    timedOut: boolean;
    aborted: boolean;
    /** Resolvierter absoluter Pfad zum Binary. */
    resolvedBinary: string | null;
    error?: string;
}

/**
 * Sucht ein Binary:
 *   1) Wenn `nameOrPath` absolut ist UND existiert → return it
 *   2) `which`-style Lookup über `$PATH`
 *   3) Fallback-Pfade durchprobieren (z.B. ~/go/bin, /usr/bin)
 */
export function resolveBinary(nameOrPath: string, fallbackPaths: string[] = []): string | null {
    // 1) absolute path
    if (path.isAbsolute(nameOrPath)) {
        return safeStat(nameOrPath) ? nameOrPath : null;
    }

    // 2) $PATH lookup
    const PATH = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const dir of PATH) {
        const candidate = path.join(dir, nameOrPath);
        if (safeStat(candidate)) return candidate;
    }

    // 3) Fallback paths (resolve ~)
    for (const fp of fallbackPaths) {
        const expanded = fp.startsWith("~") ? path.join(HOME, fp.slice(1)) : fp;
        if (safeStat(expanded)) return expanded;
    }

    return null;
}

function safeStat(p: string): boolean {
    try {
        const st = fs.statSync(p);
        return st.isFile();
    } catch {
        return false;
    }
}

/**
 * Spawnt ein Tool mit hartem Timeout, AbortSignal und gebufferten stdout/stderr.
 * Wirft NICHT — gibt strukturiertes Result zurück (Worker entscheidet, was Fehler bedeutet).
 */
export async function spawnTool(opts: SpawnToolOptions): Promise<SpawnToolResult> {
    const start = Date.now();
    const allowed = opts.allowedExitCodes ?? [0];

    const resolved = resolveBinary(opts.binary, opts.fallbackPaths ?? []);
    if (!resolved) {
        return {
            success: false,
            exitCode: null,
            signal: null,
            stdout: "",
            stderr: "",
            durationMs: 0,
            timedOut: false,
            aborted: false,
            resolvedBinary: null,
            error: `binary not found: ${opts.binary} (PATH + ${opts.fallbackPaths?.join(", ") || "no fallbacks"})`,
        };
    }

    return await new Promise<SpawnToolResult>((resolve) => {
        let resolved2 = false;

        // detached:true legt das Child in eine eigene Process-Group, sodass wir
        // beim Kill -pid das ganze Subtree treffen (nmap/testssl forken Helper,
        // die SIGKILL auf den Master sonst überleben). Der Parent muss nicht
        // unrefen — wir warten ja explizit aufs Ende, kein Detach im Lifecycle.
        const child = spawn(resolved, opts.args, {
            cwd: opts.cwd,
            env: opts.env ?? process.env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
        });

        let stdout = "";
        let stderr = "";
        let stdoutTrunc = false;
        let stderrTrunc = false;

        child.stdout?.on("data", (chunk: Buffer) => {
            if (stdout.length < MAX_BUFFER_BYTES) {
                const remaining = MAX_BUFFER_BYTES - stdout.length;
                stdout += chunk.toString("utf8", 0, Math.min(chunk.length, remaining));
                if (chunk.length > remaining) stdoutTrunc = true;
            } else {
                stdoutTrunc = true;
            }
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            if (stderr.length < MAX_BUFFER_BYTES) {
                const remaining = MAX_BUFFER_BYTES - stderr.length;
                stderr += chunk.toString("utf8", 0, Math.min(chunk.length, remaining));
                if (chunk.length > remaining) stderrTrunc = true;
            } else {
                stderrTrunc = true;
            }
        });

        let timedOut = false;
        let aborted = false;

        // Process-Group-Kill: kill(-pid) statt kill(pid). Funktioniert nur, wenn
        // detached:true den setpgid()-Call gemacht hat (siehe oben).
        const killGroup = (sig: NodeJS.Signals) => {
            if (child.pid == null) return;
            try {
                process.kill(-child.pid, sig);
            } catch {
                // Fallback: nur Master killen (falls Process-Group inzwischen weg)
                try { child.kill(sig); } catch { /* ignore */ }
            }
        };

        // Soft-then-hard-Kill: zuerst SIGTERM (cleanup-fähige Tools wie testssl
        // räumen ihre tmp-Files), dann nach 3s SIGKILL.
        const escalateKill = () => {
            killGroup("SIGTERM");
            setTimeout(() => {
                if (!resolved2) killGroup("SIGKILL");
            }, 3_000).unref();
        };

        const timer =
            opts.timeoutMs > 0
                ? setTimeout(() => {
                      timedOut = true;
                      escalateKill();
                  }, opts.timeoutMs)
                : null;

        // Hard-Deadline: spätestens timeoutMs + 15s Grace muss die Promise
        // resolved sein. Schützt gegen Edge-Cases wo `close` nie feuert
        // (Stdio-Streams werden von Grandchild-Prozessen offen gehalten,
        // libuv-Race-Conditions, …). Der Hard-Deadline-Timer ist die letzte
        // Linie — er resolved auch wenn alles andere hängt.
        const hardDeadline =
            opts.timeoutMs > 0
                ? setTimeout(() => {
                      if (resolved2) return;
                      timedOut = true;
                      killGroup("SIGKILL");
                      finish(null, null, `hard_deadline_after_${opts.timeoutMs + 15_000}ms`);
                  }, opts.timeoutMs + 15_000)
                : null;

        const onAbort = () => {
            aborted = true;
            escalateKill();
        };
        opts.abortSignal?.addEventListener("abort", onAbort, { once: true });

        const finish = (exitCode: number | null, signal: NodeJS.Signals | null, errMsg?: string) => {
            if (resolved2) return;
            resolved2 = true;
            if (timer) clearTimeout(timer);
            if (hardDeadline) clearTimeout(hardDeadline);
            opts.abortSignal?.removeEventListener("abort", onAbort);

            const isAllowedExit = exitCode != null && allowed.includes(exitCode);
            const success = !errMsg && !timedOut && !aborted && isAllowedExit;

            let error: string | undefined;
            if (errMsg) error = errMsg;
            else if (timedOut) error = `timeout after ${opts.timeoutMs}ms`;
            else if (aborted) error = "aborted by orchestrator";
            else if (!isAllowedExit) error = `exit code ${exitCode}${signal ? ` (signal=${signal})` : ""}`;

            resolve({
                success,
                exitCode,
                signal,
                stdout: stdoutTrunc ? stdout + "\n[…truncated]" : stdout,
                stderr: stderrTrunc ? stderr + "\n[…truncated]" : stderr,
                durationMs: Date.now() - start,
                timedOut,
                aborted,
                resolvedBinary: resolved,
                error,
            });
        };

        child.on("error", (err) => finish(null, null, err.message));
        // Wir hören auf BEIDE — "exit" feuert sobald der Prozess endet (auch
        // wenn Grandchildren noch stdio offen halten); "close" wenn alle stdio
        // geschlossen sind. Whichever first gewinnt, der hardDeadline ist die
        // letzte Sicherung dahinter.
        child.on("exit", (code, signal) => finish(code, signal));
        child.on("close", (code, signal) => finish(code, signal));
    });
}

/** Parst stdout-Inhalt als JSON. Bei Fehler: null. */
export function parseJson<T = unknown>(s: string): T | null {
    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

/** Parst stdout als JSONL (eine JSON-Zeile pro Item). Skipt invalide Zeilen. */
export function parseJsonl<T = unknown>(s: string): T[] {
    const out: T[] = [];
    for (const line of s.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            out.push(JSON.parse(trimmed) as T);
        } catch {
            // skip
        }
    }
    return out;
}
