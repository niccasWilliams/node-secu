CREATE TYPE "public"."secu_engagement_hint_slot" AS ENUM('owner_name', 'owner_city', 'owner_company', 'owner_known_email', 'owner_known_username', 'owner_alt_domain', 'industry', 'free_text');--> statement-breakpoint
CREATE TABLE "secu_engagement_hints" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"slot" "secu_engagement_hint_slot" NOT NULL,
	"value" text NOT NULL,
	"source" varchar(64),
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_engagement_hints_engagement_idx" ON "secu_engagement_hints" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_engagement_hints_engagement_slot_idx" ON "secu_engagement_hints" USING btree ("engagement_id","slot");