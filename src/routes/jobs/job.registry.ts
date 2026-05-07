
import { logService } from "../log-service/log-service.service";
import { handleExpiredJob } from "./jobs/handle-expired.job";
import { syncCreditConsumptionJob } from "@/lib/entitlements/sync-credit-consumption.job";


export type JobUrgency = "low" | "medium" | "high" | "critical";
export type JobDomain = "maintenance" | "compliance" | "reporting";
export type JobWorker = "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";

export type JobDefinition<TPayload = unknown, TResult = unknown> = {
    id: string;
    name: string;
    description: string;
    schedule: string;
    urgency: JobUrgency;
    domain: JobDomain;
    worker: JobWorker;
    runOrder: number;
    allowConcurrentRuns?: boolean;
    active: boolean;
    execute: (payload?: TPayload, meta?: Record<string, unknown>) => Promise<TResult>;
};

export type JobCatalogFilters = {
    worker?: JobWorker;
    domain?: JobDomain;
    activeOnly?: boolean;
};

export type JobWorkerCatalogEntry = {
    worker: JobWorker;
    domain: JobDomain;
    name: string;
    description: string;
    jobs: Array<Pick<JobDefinition, "id" | "name" | "schedule" | "urgency" | "runOrder" | "active">>;
};



export const jobRegistry: JobDefinition[] = [
    // Register your jobs here
    {
        id: "handle-expired",
        name: "Job verwaltet alle abgelaufenen dinge",
        description: "Dieser Job kümmert sich um alles was regelmäßig bereinigt werden muss",
        schedule: "0 * * * *", // Every 1 hour
        urgency: "low",
        domain: "maintenance",
        worker: "core-maintenance-worker",
        runOrder: 10,
        active: true,

        execute: async () => {
            //dieser job kümmert sich um alles was regelmäßig bereinigt werden muss
            try {
                await handleExpiredJob();
            } catch (error) {
                //error handled in job..
                throw error;
            }
        }
    },










  

];

const workerInfo: Record<JobWorker, { domain: JobDomain; name: string; description: string }> = {
    "core-maintenance-worker": {
        domain: "maintenance",
        name: "Core Maintenance Worker",
        description: "Runs recurring cleanup and maintenance tasks.",
    },
    "finance-compliance-worker": {
        domain: "compliance",
        name: "Finance Compliance Worker",
        description: "Runs tax/compliance checks and legal safeguard jobs.",
    },
    "admin-reporting-worker": {
        domain: "reporting",
        name: "Admin Reporting Worker",
        description: "Runs weekly/monthly management reporting jobs.",
    },
};

export function listJobCatalog(filters: JobCatalogFilters = {}): JobDefinition[] {
    const { worker, domain, activeOnly = true } = filters;

    return jobRegistry
        .filter((job) => {
            if (activeOnly && !job.active) return false;
            if (worker && job.worker !== worker) return false;
            if (domain && job.domain !== domain) return false;
            return true;
        })
        .sort((a, b) => {
            if (a.worker !== b.worker) return a.worker.localeCompare(b.worker);
            if (a.runOrder !== b.runOrder) return a.runOrder - b.runOrder;
            return a.id.localeCompare(b.id);
        });
}

export function listWorkerCatalog(
    filters: JobCatalogFilters = {},
    options: { includeEmptyWorkers?: boolean } = {}
): JobWorkerCatalogEntry[] {
    const { includeEmptyWorkers = false } = options;
    const entries: JobWorkerCatalogEntry[] = [];

    for (const [worker, info] of Object.entries(workerInfo)) {
        if (filters.worker && filters.worker !== worker) continue;
        if (filters.domain && filters.domain !== info.domain) continue;

        const jobs = listJobCatalog({ ...filters, worker: worker as JobWorker })
            .map((job) => ({
                id: job.id,
                name: job.name,
                schedule: job.schedule,
                urgency: job.urgency,
                runOrder: job.runOrder,
                active: job.active,
            }));

        if (!includeEmptyWorkers && jobs.length === 0) continue;

        entries.push({
            worker: worker as JobWorker,
            domain: info.domain,
            name: info.name,
            description: info.description,
            jobs,
        });
    }

    return entries;
}

export function getJobOverview(filters: JobCatalogFilters = {}) {
    const baseJobs = listJobCatalog({ ...filters, activeOnly: false });

    const workers = Object.keys(workerInfo).map((worker) => {
        const jobs = baseJobs.filter((job) => job.worker === worker);
        const active = jobs.filter((job) => job.active).length;
        return {
            worker: worker as JobWorker,
            total: jobs.length,
            active,
            inactive: jobs.length - active,
        };
    }).filter((entry) => entry.total > 0);

    const domains: Array<{ domain: JobDomain; total: number; active: number; inactive: number }> =
        (["maintenance", "compliance", "reporting"] as JobDomain[]).map((domain) => {
            const jobs = baseJobs.filter((job) => job.domain === domain);
            const active = jobs.filter((job) => job.active).length;
            return {
                domain,
                total: jobs.length,
                active,
                inactive: jobs.length - active,
            };
        }).filter((entry) => entry.total > 0);

    const urgencies: Array<{ urgency: JobUrgency; total: number }> = (["low", "medium", "high", "critical"] as JobUrgency[])
        .map((urgency) => ({
            urgency,
            total: baseJobs.filter((job) => job.urgency === urgency).length,
        }))
        .filter((entry) => entry.total > 0);

    const activeJobs = baseJobs.filter((job) => job.active).length;
    const totalJobs = baseJobs.length;

    return {
        totalJobs,
        activeJobs,
        inactiveJobs: totalJobs - activeJobs,
        workers,
        domains,
        urgencies,
    };
}

export const jobWorkerCatalog: JobWorkerCatalogEntry[] = listWorkerCatalog(
    { activeOnly: false },
    { includeEmptyWorkers: true }
);
