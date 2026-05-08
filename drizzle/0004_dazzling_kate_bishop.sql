ALTER TYPE "public"."secu_entity_kind" ADD VALUE 'email_address';--> statement-breakpoint
ALTER TYPE "public"."secu_entity_kind" ADD VALUE 'username';--> statement-breakpoint
ALTER TYPE "public"."secu_entity_kind" ADD VALUE 'phone_number';--> statement-breakpoint
ALTER TYPE "public"."secu_entity_kind" ADD VALUE 'social_account';--> statement-breakpoint
CREATE TABLE "secu_osint_provider_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_key" varchar(64) NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"last_request_at" timestamp,
	"last_429_at" timestamp,
	"paused_until" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "secu_osint_provider_state_key_unique" UNIQUE("provider_key")
);
--> statement-breakpoint
CREATE TABLE "secu_signal_chain_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"root_entity_id" integer,
	"triggered_by" varchar(64) DEFAULT 'manual' NOT NULL,
	"signal_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "secu_engagements" ADD COLUMN "osint_budget_per_hour" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "secu_signal_chain_log" ADD CONSTRAINT "secu_signal_chain_log_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_signal_chain_log" ADD CONSTRAINT "secu_signal_chain_log_root_entity_id_secu_entities_id_fk" FOREIGN KEY ("root_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_signal_chain_engagement_idx" ON "secu_signal_chain_log" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_signal_chain_root_idx" ON "secu_signal_chain_log" USING btree ("root_entity_id");