CREATE TYPE "public"."secu_engagement_hint_status" AS ENUM('pending', 'converted', 'dismissed');--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD COLUMN "status" "secu_engagement_hint_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD COLUMN "converted_to_entity_id" integer;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD COLUMN "closed_by" integer;--> statement-breakpoint
ALTER TABLE "secu_engagements" ADD COLUMN "scope" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD COLUMN "discovered_by_worker_run_id" integer;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD COLUMN "discovered_by_playbook_run_id" integer;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_converted_to_entity_id_secu_entities_id_fk" FOREIGN KEY ("converted_to_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_artifacts_engagement_kind_entity_idx" ON "secu_artifacts" USING btree ("engagement_id","kind","entity_id","captured_at");--> statement-breakpoint
CREATE INDEX "secu_engagement_hints_status_idx" ON "secu_engagement_hints" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "secu_rel_discovered_by_worker_idx" ON "secu_entity_relationships" USING btree ("discovered_by_worker_run_id");