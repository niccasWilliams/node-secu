import { Request, Response } from "express";

import { responseHandler } from "@/lib/communication";
import { nowInBerlin } from "@/util/utils";
import {
    JobCatalogFilters,
    JobDefinition,
    getJobOverview,
    listJobCatalog,
    listWorkerCatalog,
    jobRegistry,
} from "./job.registry";
import { z } from "zod";
import { logService } from "../log-service/log-service.service";
import { validatedQuery } from "@/api-contract/validated";
import { jobsListQuerySchema } from "./job.dto";
import { jobCallbackService } from "./job-callback.service";

/* Automatically job management via external system.. 
    - GET /jobs : List all available jobs
    - POST /jobs : Execute a job immediately

    -> My own cron job app calls my server every minute to check for scheduled jobs.
    - If any job is due, it calls POST /jobs with the jobId to execute it.
    
    => so in this system, we only have to define the jobs an their schedule automatically in prod,
*/


type SerializedJob = Pick<JobDefinition, "id" | "name" | "description" | "schedule" | "urgency" | "domain" | "worker" | "runOrder" | "allowConcurrentRuns">;
type RunningJobEntry = {
    executionKey: string;
    jobId: string;
    runId: string | null;
    triggeredBy: string | null;
    requestedAt: string | null;
    startedAt: string;
    worker: JobDefinition["worker"];
    domain: JobDefinition["domain"];
};

const sanitizeJob = (job: JobDefinition): SerializedJob => ({
    id: job.id,
    name: job.name,
    description: job.description,
    schedule: job.schedule,
    urgency: job.urgency,
    domain: job.domain,
    worker: job.worker,
    runOrder: job.runOrder,
    allowConcurrentRuns: job.allowConcurrentRuns ?? false,
});



const jobMetaSchema = z.object({
    runId: z.string().min(1).max(128).optional(),
    triggeredBy: z.string().min(1).max(128).optional(),
    requestedAt: z.string().datetime().optional()
}).catchall(z.unknown());

const callbackInfoSchema = z.object({
    url: z.string().url(),
    runId: z.string().min(1),
    expectedSignatureHeader: z.string().optional(),
});

const jobExecutionSchema = z.object({
    jobId: z.string().min(1, "jobId is required"),
    payload: z.unknown().optional(),
    meta: jobMetaSchema.optional(),
    _callback: callbackInfoSchema.optional(),
});




class JobContoroller {
    private runningExecutions = new Map<string, RunningJobEntry>();

    constructor() {
        this.getJobs = this.getJobs.bind(this);
        this.getWorkers = this.getWorkers.bind(this);
        this.getRunning = this.getRunning.bind(this);
        this.getOverview = this.getOverview.bind(this);
        this.executeJob = this.executeJob.bind(this);
    }

    private readFilters(req: Request, defaults: { activeOnly: boolean }): JobCatalogFilters {
        const query = validatedQuery(req, jobsListQuerySchema) ?? {};
        return {
            worker: query.worker,
            domain: query.domain,
            activeOnly: query.activeOnly ?? defaults.activeOnly,
        };
    }

    private isJobRunning(jobId: string): boolean {
        for (const entry of this.runningExecutions.values()) {
            if (entry.jobId === jobId) return true;
        }
        return false;
    }

    private buildExecutionKey(jobId: string, runId?: string): string {
        const suffix = runId?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        return `${jobId}:${suffix}`;
    }

    private registerRunningExecution(input: {
        executionKey: string;
        job: JobDefinition;
        runId?: string;
        triggeredBy?: string;
        requestedAt?: string;
    }) {
        this.runningExecutions.set(input.executionKey, {
            executionKey: input.executionKey,
            jobId: input.job.id,
            runId: input.runId?.trim() || null,
            triggeredBy: input.triggeredBy?.trim() || null,
            requestedAt: input.requestedAt?.trim() || null,
            startedAt: nowInBerlin().toISOString(),
            worker: input.job.worker,
            domain: input.job.domain,
        });
    }

    private getRunningExecutionList(filters: JobCatalogFilters): RunningJobEntry[] {
        const rows = Array.from(this.runningExecutions.values());
        return rows
            .filter((row) => {
                if (filters.worker && row.worker !== filters.worker) return false;
                if (filters.domain && row.domain !== filters.domain) return false;
                return true;
            })
            .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    }




    async getJobs(req: Request, res: Response) {
        try {
            const filters = this.readFilters(req, { activeOnly: true });
            const jobs = listJobCatalog(filters);
            const allJobs = jobs.map(sanitizeJob)

            return res.status(200).json({
                success: true,
                data: allJobs,
                count: allJobs.length,
                generatedAt: nowInBerlin().toISOString(),
                capabilities: {
                    webhookCallback: !!process.env.CRON_JOB_SECRET,
                },
            });
        } catch (error) {
            const err = error as Error;
            await logService.error("[jobs] Failed to build job catalog", { error: err });
            return res.status(500).json({
                error: err.message || "Internal Server Error"
            });
        }
    }

    async getWorkers(req: Request, res: Response) {
        try {
            const filters = this.readFilters(req, { activeOnly: true });
            const workers = listWorkerCatalog(filters, { includeEmptyWorkers: false });

            return res.status(200).json({
                success: true,
                data: workers,
                count: workers.length,
                generatedAt: nowInBerlin().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            await logService.error("[jobs] Failed to build worker catalog", { error: err });
            return res.status(500).json({
                error: err.message || "Internal Server Error",
            });
        }
    }

    async getRunning(req: Request, res: Response) {
        try {
            const filters = this.readFilters(req, { activeOnly: true });
            const running = this.getRunningExecutionList(filters);

            return res.status(200).json({
                success: true,
                data: running,
                count: running.length,
                generatedAt: nowInBerlin().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            await logService.error("[jobs] Failed to build running jobs view", { error: err });
            return res.status(500).json({
                error: err.message || "Internal Server Error",
            });
        }
    }

    async getOverview(req: Request, res: Response) {
        try {
            const filters = this.readFilters(req, { activeOnly: false });
            const overview = getJobOverview(filters);

            return res.status(200).json({
                success: true,
                data: overview,
                generatedAt: nowInBerlin().toISOString(),
            });
        } catch (error) {
            const err = error as Error;
            await logService.error("[jobs] Failed to build job overview", { error: err });
            return res.status(500).json({
                error: err.message || "Internal Server Error",
            });
        }
    }


    async executeJob(req: Request, res: Response) {
        let parsedBody: z.infer<typeof jobExecutionSchema>;

        try {
            const body = await req.body;
            const validation = jobExecutionSchema.safeParse(body);

            if (!validation.success) {
                return res.status(400).json({
                    error: "Invalid request body",
                    details: validation.error.errors
                });
            }

            parsedBody = validation.data;
        } catch {
            return res.status(400).json({
                error: "Invalid JSON body"
            });
        }

        const { jobId, payload, meta, _callback } = parsedBody;
        const job = jobRegistry.find(entry => entry.id === jobId);

        if (!job) {
            return res.status(404).json({
                error: "Job not found",
                jobId
            });
        }

        if (!job.active) {
            return res.status(409).json({
                error: "Job is not active",
                jobId,
            })
        }

        const allowConcurrentRuns = job.allowConcurrentRuns ?? false;
        if (!allowConcurrentRuns && this.isJobRunning(job.id)) {
            return res.status(409).json({
                error: "Job is already running",
                jobId,
            });
        }

        const executionKey = this.buildExecutionKey(job.id, meta?.runId);
        this.registerRunningExecution({
            executionKey,
            job,
            runId: meta?.runId,
            triggeredBy: meta?.triggeredBy,
            requestedAt: meta?.requestedAt,
        });

        // ====== ASYNC CALLBACK MODUS ======
        if (_callback) {
            // Sofort 202 Accepted antworten
            res.status(202).json({
                acknowledged: true,
                jobId: job.id,
                callbackUrl: _callback.url,
                runId: _callback.runId,
            });

            // Job asynchron ausführen (nach Response)
            const startedAt = nowInBerlin().getTime();
            job.execute(payload, meta)
                .then(async (result) => {
                    const finishedAt = nowInBerlin().getTime();
                    await jobCallbackService.sendCallback(_callback, {
                        success: true,
                        jobId: job.id,
                        durationMs: finishedAt - startedAt,
                        result: result ?? null,
                    });
                })
                .catch(async (error) => {
                    const err = error as Error;
                    const finishedAt = nowInBerlin().getTime();
                    await logService.error(`[jobs] Async execution failed for ${jobId}`, {
                        jobId,
                        error: err,
                    });
                    await jobCallbackService.sendCallback(_callback, {
                        success: false,
                        jobId: job.id,
                        durationMs: finishedAt - startedAt,
                        error: err.message || "Unknown error",
                    });
                })
                .finally(() => {
                    this.runningExecutions.delete(executionKey);
                });

            return; // Response bereits gesendet
        }

        // ====== SYNC MODUS (bestehende Logik) ======
        const startedAt = nowInBerlin().getTime();

        try {
            const result = await job.execute(payload, meta);
            const finishedAt = nowInBerlin().getTime();

            return res.status(200).json({
                success: true,
                jobId: job.id,
                durationMs: finishedAt - startedAt,
                executedAt: nowInBerlin().toISOString(),
                result: result ?? null
            });
        } catch (error) {
            const err = error as Error;
            await logService.error(`[jobs] Execution failed for ${jobId}`, {
                jobId,
                error: err,
            });
            return res.status(500).json({
                error: "Job execution failed",
                jobId,
                details: err.message || "Unknown error"
            });
        } finally {
            this.runningExecutions.delete(executionKey);
        }

    }



}


export const jobController = new JobContoroller();
