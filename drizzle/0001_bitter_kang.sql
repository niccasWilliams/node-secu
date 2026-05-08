CREATE TYPE "public"."secu_finding_triage_reason" AS ENUM('irrelevant_legacy', 'compensating_control', 'accepted_risk', 'duplicate', 'manual_review_pending', 'customer_approved', 'scoping_excluded', 'other');--> statement-breakpoint
ALTER TYPE "public"."secu_finding_status" ADD VALUE 'wont_fix' BEFORE 'fixed';--> statement-breakpoint
CREATE TABLE "secu_finding_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_id" integer NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "secu_findings" ADD COLUMN "triage_reason" "secu_finding_triage_reason";--> statement-breakpoint
ALTER TABLE "secu_findings" ADD COLUMN "triage_note" text;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
ALTER TABLE "secu_finding_comments" ADD CONSTRAINT "secu_finding_comments_finding_id_secu_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."secu_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_finding_comments" ADD CONSTRAINT "secu_finding_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_finding_comments_finding_idx" ON "secu_finding_comments" USING btree ("finding_id","created_at");--> statement-breakpoint
ALTER TABLE "secu_findings" ADD CONSTRAINT "secu_findings_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;