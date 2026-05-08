ALTER TABLE "secu_engagements" ADD COLUMN "osint_max_hops" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD COLUMN "hop_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD COLUMN "parent_run_id" integer;--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_parent_idx" ON "secu_playbook_runs" USING btree ("parent_run_id");