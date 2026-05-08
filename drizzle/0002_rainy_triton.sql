CREATE TYPE "public"."secu_artifact_kind" AS ENUM('screenshot', 'file', 'command_output', 'pcap', 'credential_dump', 'note');--> statement-breakpoint
CREATE TYPE "public"."secu_authorization_kind" AS ENUM('own', 'verified_ownership', 'written_consent', 'internal_lab');--> statement-breakpoint
CREATE TYPE "public"."secu_authorization_proof_type" AS ENUM('dns_txt', 'http_file', 'written_contract', 'manual_owner_verification', 'none');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_entity_role" AS ENUM('primary_target', 'in_scope', 'out_of_scope', 'pivot', 'context');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_kind" AS ENUM('solo_lab', 'ctf', 'bug_bounty', 'customer_pentest', 'internal');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_status" AS ENUM('planning', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."secu_entity_kind" AS ENUM('asset_domain', 'asset_subdomain', 'asset_ip', 'asset_host', 'asset_url', 'person', 'organization', 'location', 'credential_ref', 'document');--> statement-breakpoint
CREATE TYPE "public"."secu_finding_category" AS ENUM('dns', 'email_security', 'tls', 'http_headers', 'exposure', 'cms', 'auth', 'injection', 'cve', 'config', 'deps', 'cert', 'phishing', 'leak');--> statement-breakpoint
CREATE TYPE "public"."secu_finding_status" AS ENUM('open', 'triaged', 'confirmed', 'false_positive', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."secu_playbook_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."secu_worker_provider" AS ENUM('local', 'hetzner', 'aws', 'digitalocean', 'docker_host', 'tor_proxy');--> statement-breakpoint
CREATE TYPE "public"."secu_worker_run_status" AS ENUM('pending', 'provisioning', 'running', 'completed', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TABLE "secu_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer,
	"kind" "secu_artifact_kind" NOT NULL,
	"title" varchar(256),
	"body" text,
	"storage_ref" text,
	"mime" varchar(128),
	"sha256" varchar(64),
	"size_bytes" integer,
	"redacted" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "secu_command_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer,
	"worker_run_id" integer,
	"raw_command" text NOT NULL,
	"exit_code" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "secu_engagement_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"role" "secu_engagement_entity_role" DEFAULT 'in_scope' NOT NULL,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"added_by" integer,
	CONSTRAINT "secu_eng_ent_pair_unique" UNIQUE("engagement_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "secu_engagements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"kind" "secu_engagement_kind" NOT NULL,
	"status" "secu_engagement_status" DEFAULT 'active' NOT NULL,
	"owner_user_id" integer,
	"scope_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"archived_at" timestamp,
	CONSTRAINT "secu_engagements_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "secu_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "secu_entity_kind" NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"canonical_key" varchar(512) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secu_entity_authorizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"kind" "secu_authorization_kind" NOT NULL,
	"scope" "secu_authorization_scope" NOT NULL,
	"proof_type" "secu_authorization_proof_type" DEFAULT 'none' NOT NULL,
	"proof_ref" text,
	"verification_token" varchar(128),
	"granted_by" integer,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secu_entity_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_entity_id" integer NOT NULL,
	"to_entity_id" integer NOT NULL,
	"kind" varchar(64) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"first_observed_at" timestamp DEFAULT now() NOT NULL,
	"last_observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secu_entity_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"tag" varchar(64) NOT NULL,
	"color" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "secu_entity_tags_entity_tag_unique" UNIQUE("entity_id","tag")
);
--> statement-breakpoint
CREATE TABLE "secu_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer,
	"worker_run_id" integer,
	"fingerprint" varchar(64) NOT NULL,
	"severity" "secu_severity" NOT NULL,
	"category" "secu_finding_category" NOT NULL,
	"status" "secu_finding_status" DEFAULT 'open' NOT NULL,
	"title" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendation" text,
	"cve_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cvss_score" varchar(16),
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "secu_findings_engagement_fingerprint_unique" UNIQUE("engagement_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "secu_playbook_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"playbook_key" varchar(64) NOT NULL,
	"status" "secu_playbook_run_status" DEFAULT 'pending' NOT NULL,
	"triggered_by" varchar(128) DEFAULT 'manual' NOT NULL,
	"triggered_by_user_id" integer,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secu_worker_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"playbook_run_id" integer,
	"engagement_id" integer NOT NULL,
	"entity_id" integer,
	"worker_key" varchar(64) NOT NULL,
	"status" "secu_worker_run_status" DEFAULT 'pending' NOT NULL,
	"provider" "secu_worker_provider" DEFAULT 'local' NOT NULL,
	"provider_instance_id" varchar(128),
	"provider_region" varchar(64),
	"logs_ref" text,
	"exit_code" integer,
	"error" text,
	"duration_ms" integer,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secu_audit_log" ADD COLUMN "engagement_id" integer;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_command_history" ADD CONSTRAINT "secu_command_history_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_command_history" ADD CONSTRAINT "secu_command_history_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagements" ADD CONSTRAINT "secu_engagements_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD CONSTRAINT "secu_entity_relationships_from_entity_id_secu_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD CONSTRAINT "secu_entity_relationships_to_entity_id_secu_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_tags" ADD CONSTRAINT "secu_entity_tags_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD CONSTRAINT "secu_findings_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD CONSTRAINT "secu_findings_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD CONSTRAINT "secu_playbook_runs_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD CONSTRAINT "secu_playbook_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_playbook_run_id_secu_playbook_runs_id_fk" FOREIGN KEY ("playbook_run_id") REFERENCES "public"."secu_playbook_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_artifacts_engagement_idx" ON "secu_artifacts" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_artifacts_entity_idx" ON "secu_artifacts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_artifacts_kind_idx" ON "secu_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "secu_cmd_engagement_idx" ON "secu_command_history" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_cmd_worker_run_idx" ON "secu_command_history" USING btree ("worker_run_id");--> statement-breakpoint
CREATE INDEX "secu_eng_ent_engagement_idx" ON "secu_engagement_entities" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_eng_ent_entity_idx" ON "secu_engagement_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_engagements_owner_idx" ON "secu_engagements" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "secu_engagements_status_idx" ON "secu_engagements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "secu_entities_kind_idx" ON "secu_entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "secu_entities_canonical_idx" ON "secu_entities" USING btree ("canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "secu_entities_kind_canonical_unique" ON "secu_entities" USING btree ("kind","canonical_key");--> statement-breakpoint
CREATE INDEX "secu_auth_entity_idx" ON "secu_entity_authorizations" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_auth_scope_idx" ON "secu_entity_authorizations" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "secu_auth_active_idx" ON "secu_entity_authorizations" USING btree ("entity_id","revoked_at");--> statement-breakpoint
CREATE INDEX "secu_rel_from_idx" ON "secu_entity_relationships" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "secu_rel_to_idx" ON "secu_entity_relationships" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "secu_rel_kind_idx" ON "secu_entity_relationships" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "secu_rel_triple_unique" ON "secu_entity_relationships" USING btree ("from_entity_id","to_entity_id","kind");--> statement-breakpoint
CREATE INDEX "secu_entity_tags_entity_idx" ON "secu_entity_tags" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_findings_engagement_idx" ON "secu_findings" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_findings_entity_idx" ON "secu_findings" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_findings_status_idx" ON "secu_findings" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "secu_findings_severity_idx" ON "secu_findings" USING btree ("engagement_id","severity");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_engagement_idx" ON "secu_playbook_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_status_idx" ON "secu_playbook_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_key_idx" ON "secu_playbook_runs" USING btree ("playbook_key");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_engagement_idx" ON "secu_worker_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_playbook_idx" ON "secu_worker_runs" USING btree ("playbook_run_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_entity_idx" ON "secu_worker_runs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_key_idx" ON "secu_worker_runs" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_status_idx" ON "secu_worker_runs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "secu_audit_log" ADD CONSTRAINT "secu_audit_log_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_audit_engagement_idx" ON "secu_audit_log" USING btree ("engagement_id");