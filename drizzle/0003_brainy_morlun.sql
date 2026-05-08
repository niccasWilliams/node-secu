CREATE TYPE "public"."secu_rule_action" AS ENUM('start_playbook', 'tag_entity', 'notify_boss', 'create_finding');--> statement-breakpoint
CREATE TYPE "public"."secu_rule_trigger" AS ENUM('entity.created', 'entity.updated', 'finding.created', 'playbook_run.completed', 'schedule');--> statement-breakpoint
CREATE TABLE "secu_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"scope" varchar(64) DEFAULT 'global' NOT NULL,
	"trigger" "secu_rule_trigger" NOT NULL,
	"action" "secu_rule_action" NOT NULL,
	"condition" jsonb,
	"action_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"fire_count" integer DEFAULT 0 NOT NULL,
	"last_fired_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "secu_rules" ADD CONSTRAINT "secu_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_rules_trigger_idx" ON "secu_rules" USING btree ("trigger");--> statement-breakpoint
CREATE INDEX "secu_rules_enabled_idx" ON "secu_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "secu_rules_scope_idx" ON "secu_rules" USING btree ("scope");