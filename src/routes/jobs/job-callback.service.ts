import axios from "axios";
import crypto from "crypto";
import { logService } from "../log-service/log-service.service";

type CallbackInfo = {
    url: string;
    runId: string;
    expectedSignatureHeader?: string;
};

type CallbackResult = {
    success: boolean;
    jobId: string;
    durationMs: number;
    result?: unknown;
    error?: string;
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

class JobCallbackService {

    /**
     * Sendet das Job-Ergebnis als Webhook-Callback zurück an node-cron.
     * Berechnet HMAC-SHA256 Signatur und sendet sie im X-Webhook-Signature Header.
     * Bei Netzwerk-Fehlern werden bis zu 3 Retries mit Exponential Backoff durchgeführt.
     */
    async sendCallback(callbackInfo: CallbackInfo, result: CallbackResult): Promise<void> {
        const payload = {
            runId: callbackInfo.runId,
            success: result.success,
            jobId: result.jobId,
            durationMs: result.durationMs,
            executedAt: new Date().toISOString(),
            result: result.result,
            error: result.error,
        };

        const payloadJson = JSON.stringify(payload);

        // HMAC-SHA256 Signatur berechnen (selbes Secret wie für Job-Authentifizierung)
        const secret = process.env.CRON_JOB_SECRET;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (secret) {
            const hmac = crypto.createHmac("sha256", secret);
            hmac.update(payloadJson, "utf8");
            const signature = `sha256=${hmac.digest("hex")}`;
            headers["X-Webhook-Signature"] = signature;
        }

        // Senden mit Retry-Logik
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                await axios.post(callbackInfo.url, payload, {
                    headers,
                    timeout: 15000, // 15s Timeout
                });

                console.log(
                    `[JobCallback] Callback sent successfully for runId=${callbackInfo.runId} ` +
                    `(attempt ${attempt + 1}/${MAX_RETRIES + 1})`
                );
                return;

            } catch (error: any) {
                lastError = error;

                // Bei HTTP-Fehlern (4xx) nicht retrien - die sind definitiv
                if (error.response && error.response.status < 500) {
                    console.error(
                        `[JobCallback] Callback rejected (HTTP ${error.response.status}) for runId=${callbackInfo.runId}:`,
                        error.response.data
                    );
                    return; // Kein Retry bei Client-Fehlern
                }

                // Bei Netzwerk-/Server-Fehlern: Exponential Backoff
                if (attempt < MAX_RETRIES) {
                    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                    console.warn(
                        `[JobCallback] Attempt ${attempt + 1} failed for runId=${callbackInfo.runId}. ` +
                        `Retrying in ${backoff}ms...`
                    );
                    await this.sleep(backoff);
                }
            }
        }

        // Alle Retries fehlgeschlagen
        await logService.error("[JobCallback] All retry attempts failed", {
            runId: callbackInfo.runId,
            callbackUrl: callbackInfo.url,
            error: lastError?.message,
        });
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const jobCallbackService = new JobCallbackService();
