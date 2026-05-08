CREATE TYPE "public"."secu_infra_provider_category" AS ENUM('dns_provider', 'registrar', 'hosting', 'cdn', 'email_provider', 'analytics', 'social_platform');--> statement-breakpoint
ALTER TYPE "public"."secu_entity_kind" ADD VALUE 'infrastructure_provider';--> statement-breakpoint
CREATE TABLE "secu_infrastructure_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"category" "secu_infra_provider_category" NOT NULL,
	"match_patterns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "secu_infra_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "secu_infra_providers_category_idx" ON "secu_infrastructure_providers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "secu_infra_providers_active_idx" ON "secu_infrastructure_providers" USING btree ("is_active");