CREATE TYPE "public"."secu_authorization_scope" AS ENUM('passive_only', 'active_safe', 'active_intrusive');--> statement-breakpoint
CREATE TYPE "public"."secu_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TABLE "secu_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"actor_ip_hash" varchar(64),
	"action" varchar(64) NOT NULL,
	"target_type" varchar(64),
	"target_id" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secu_audit_log" ADD CONSTRAINT "secu_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_audit_actor_idx" ON "secu_audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "secu_audit_action_idx" ON "secu_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "secu_audit_target_idx" ON "secu_audit_log" USING btree ("target_type","target_id");