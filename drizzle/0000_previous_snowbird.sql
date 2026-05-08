CREATE TYPE "public"."app_log_level" AS ENUM('info', 'warn', 'error', 'debug', 'fatal', 'critical');--> statement-breakpoint
CREATE TYPE "public"."app_settings_type" AS ENUM('string', 'number', 'boolean', 'json', 'select');--> statement-breakpoint
CREATE TYPE "public"."credit_consumption_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."entitlement_sync_operation" AS ENUM('assign', 'update', 'revoke', 'state_check');--> statement-breakpoint
CREATE TYPE "public"."entitlement_sync_type" AS ENUM('role', 'area');--> statement-breakpoint
CREATE TYPE "public"."role_assignment_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'processed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workflow_created_by" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."workflow_queue_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."secu_artifact_kind" AS ENUM('screenshot', 'file', 'command_output', 'pcap', 'credential_dump', 'note');--> statement-breakpoint
CREATE TYPE "public"."secu_authorization_kind" AS ENUM('own', 'verified_ownership', 'written_consent', 'internal_lab');--> statement-breakpoint
CREATE TYPE "public"."secu_authorization_proof_type" AS ENUM('dns_txt', 'http_file', 'written_contract', 'manual_owner_verification', 'none');--> statement-breakpoint
CREATE TYPE "public"."secu_authorization_scope" AS ENUM('passive_only', 'active_safe', 'active_intrusive');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_entity_role" AS ENUM('primary_target', 'in_scope', 'out_of_scope', 'pivot', 'context');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_hint_slot" AS ENUM('owner_name', 'owner_city', 'owner_company', 'owner_known_email', 'owner_known_username', 'owner_alt_domain', 'industry', 'free_text');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_kind" AS ENUM('solo_lab', 'ctf', 'bug_bounty', 'customer_pentest', 'internal');--> statement-breakpoint
CREATE TYPE "public"."secu_engagement_status" AS ENUM('planning', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."secu_entity_kind" AS ENUM('asset_domain', 'asset_subdomain', 'asset_ip', 'asset_host', 'asset_url', 'person', 'organization', 'location', 'credential_ref', 'document', 'email_address', 'username', 'phone_number', 'social_account', 'infrastructure_provider');--> statement-breakpoint
CREATE TYPE "public"."secu_finding_category" AS ENUM('dns', 'email_security', 'tls', 'http_headers', 'exposure', 'cms', 'auth', 'injection', 'cve', 'config', 'deps', 'cert', 'phishing', 'leak', 'compliance_imprint');--> statement-breakpoint
CREATE TYPE "public"."secu_finding_status" AS ENUM('open', 'triaged', 'confirmed', 'false_positive', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."secu_infra_provider_category" AS ENUM('dns_provider', 'registrar', 'hosting', 'cdn', 'email_provider', 'analytics', 'social_platform');--> statement-breakpoint
CREATE TYPE "public"."secu_playbook_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."secu_rule_action" AS ENUM('start_playbook', 'tag_entity', 'notify_boss', 'create_finding');--> statement-breakpoint
CREATE TYPE "public"."secu_rule_trigger" AS ENUM('entity.created', 'entity.updated', 'finding.created', 'playbook_run.completed', 'schedule');--> statement-breakpoint
CREATE TYPE "public"."secu_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."secu_worker_provider" AS ENUM('local', 'hetzner', 'aws', 'digitalocean', 'docker_host', 'tor_proxy');--> statement-breakpoint
CREATE TYPE "public"."secu_worker_run_status" AS ENUM('pending', 'provisioning', 'running', 'completed', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TABLE "app_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" "app_log_level" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" varchar NOT NULL,
	"allowed_values" text,
	"type" "app_settings_type" NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "auth_email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "auth_push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"replaced_by_token_hash" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "auth_refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "credit_consumption_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_user_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"amount" numeric NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "credit_consumption_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"shop_response" jsonb,
	"last_attempt_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "credit_consumption_queue_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "entitlement_sync_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_key" text NOT NULL,
	"external_user_id" text NOT NULL,
	"external_identifier" text NOT NULL,
	"entitlement_type" "entitlement_sync_type" NOT NULL,
	"user_id" integer,
	"role_id" integer,
	"role_assignment_id" integer,
	"shop_sync_version" text,
	"shop_assignment_id" text,
	"shop_entitlement_id" text,
	"shop_customer_id" text,
	"shop_order_id" text,
	"shop_order_item_id" text,
	"source_app_id" text,
	"source_target_app_id" text,
	"source_client_id" text,
	"last_operation" "entitlement_sync_operation",
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_sync_links_link_key_unique" UNIQUE("link_key"),
	CONSTRAINT "entitlement_sync_shop_assignment_unique" UNIQUE("shop_assignment_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "unique_permission_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" "role_assignment_status" NOT NULL,
	"role_id" integer NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp,
	"assigned_by" integer NOT NULL,
	"revoked_by" integer,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	"assigned_by" integer NOT NULL,
	"revoked_by" integer,
	"created_at" timestamp NOT NULL,
	"valid_to" timestamp
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"is_sellable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shop_credit_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_user_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"total_remaining" numeric DEFAULT '0' NOT NULL,
	"local_used" numeric DEFAULT '0' NOT NULL,
	"last_shop_sync" timestamp,
	"pools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "shop_credit_balances_user_metric_unique" UNIQUE("external_user_id","metric_key")
);
--> statement-breakpoint
CREATE TABLE "shop_limit_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_user_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"included_quantity" numeric DEFAULT '0' NOT NULL,
	"limit_behavior" text DEFAULT 'soft_warn' NOT NULL,
	"pay_as_you_go_active" boolean DEFAULT false NOT NULL,
	"max_overage_quantity" numeric,
	"overage_price_per_unit" numeric,
	"last_synced_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "shop_limit_configs_user_metric_unique" UNIQUE("external_user_id","metric_key")
);
--> statement-breakpoint
CREATE TABLE "usage_overage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_event_id" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"external_user_id" text NOT NULL,
	"shop_assignment_id" text,
	"external_identifier" text NOT NULL,
	"entitlement_type" "entitlement_sync_type" NOT NULL,
	"metric_key" text NOT NULL,
	"unit" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"included_quantity" numeric NOT NULL,
	"used_quantity" numeric NOT NULL,
	"overage_quantity" numeric NOT NULL,
	"overage_amount" numeric NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"note" text,
	"pricing_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "usage_overage_events_external_event_id_unique" UNIQUE("external_event_id"),
	CONSTRAINT "usage_overage_events_source_fingerprint_unique" UNIQUE("source_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "user_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"activity_date" date NOT NULL,
	"first_activity_at" timestamp NOT NULL,
	"last_activity_at" timestamp NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_activity_unique_user_date" UNIQUE("user_id","activity_date")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_user_id" text,
	"email" text,
	"first_name" text,
	"last_name" text,
	"password_hash" text,
	"name" text,
	"email_verified_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"process_message" text,
	"origin_url" text,
	"created_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"user_agent" text,
	"signature" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_retry_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "workflow_queue_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_task" integer DEFAULT 0 NOT NULL,
	"task_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"scheduled_at" timestamp,
	"updated_at" timestamp,
	"priority" integer DEFAULT 0 NOT NULL,
	"user_id" integer,
	"created_by" "workflow_created_by" DEFAULT 'system' NOT NULL,
	"abort_requested" boolean DEFAULT false,
	"cleanup_handler" varchar(255),
	"timeout_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth2_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"grant_type" varchar(50) NOT NULL,
	"scope" text,
	"success" boolean NOT NULL,
	"error_code" varchar(50),
	"error_description" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"request_count" integer,
	"rate_limit_exceeded" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "oauth2_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" varchar(100) NOT NULL,
	"client_secret_hash" text NOT NULL,
	"client_secret_fingerprint" varchar(64) NOT NULL,
	"pepper_version" integer DEFAULT 1 NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"managing_company_id" integer DEFAULT 0 NOT NULL,
	"default_cost_center" integer,
	"available_cost_centers" text,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"scopes" text,
	"access_token_ttl" integer DEFAULT 3600 NOT NULL,
	"refresh_token_ttl" integer DEFAULT 2592000 NOT NULL,
	"max_tokens_per_client" integer DEFAULT 10 NOT NULL,
	"allowed_ips" text,
	"allowed_origins" text,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"rate_limit_per_hour" integer DEFAULT 1000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_to" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"last_used_at" timestamp,
	CONSTRAINT "oauth2_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth2_refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"token_fingerprint" varchar(64) NOT NULL,
	"jti" varchar(64) NOT NULL,
	"scope" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	CONSTRAINT "oauth2_refresh_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "oauth2_refresh_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
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
CREATE TABLE "secu_dns_ns_pivots" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"id_type" varchar(64) NOT NULL,
	"id_value" varchar(512) NOT NULL,
	"source" varchar(128) NOT NULL,
	"found_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "secu_dns_ns_pivots_entity_type_value_unique" UNIQUE("entity_id","id_type","id_value")
);
--> statement-breakpoint
CREATE TABLE "secu_dns_verification_pivots" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"id_type" varchar(64) NOT NULL,
	"id_value" varchar(256) NOT NULL,
	"source" varchar(128) NOT NULL,
	"found_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "secu_dns_verification_pivots_entity_type_value_unique" UNIQUE("entity_id","id_type","id_value")
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
CREATE TABLE "secu_engagements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"kind" "secu_engagement_kind" NOT NULL,
	"status" "secu_engagement_status" DEFAULT 'active' NOT NULL,
	"owner_user_id" integer,
	"scope_summary" text,
	"osint_budget_per_hour" integer DEFAULT 1000 NOT NULL,
	"osint_max_hops" integer DEFAULT 2 NOT NULL,
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
CREATE TABLE "secu_html_pivots" (
	"id" serial PRIMARY KEY NOT NULL,
	"engagement_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"id_type" varchar(64) NOT NULL,
	"id_value" varchar(256) NOT NULL,
	"source_url" varchar(512) NOT NULL,
	"found_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "secu_html_pivots_entity_type_value_unique" UNIQUE("entity_id","id_type","id_value")
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"hop_depth" integer DEFAULT 0 NOT NULL,
	"parent_run_id" integer
);
--> statement-breakpoint
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
CREATE TABLE "secu_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"actor_ip_hash" varchar(64),
	"engagement_id" integer,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(64),
	"target_id" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
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
ALTER TABLE "auth_email_verification_tokens" ADD CONSTRAINT "auth_email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_push_tokens" ADD CONSTRAINT "auth_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_sync_links" ADD CONSTRAINT "entitlement_sync_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_sync_links" ADD CONSTRAINT "entitlement_sync_links_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_sync_links" ADD CONSTRAINT "entitlement_sync_links_role_assignment_id_role_assignments_id_fk" FOREIGN KEY ("role_assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_queue" ADD CONSTRAINT "workflow_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth2_audit_log" ADD CONSTRAINT "oauth2_audit_log_client_id_oauth2_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth2_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth2_refresh_tokens" ADD CONSTRAINT "oauth2_refresh_tokens_client_id_oauth2_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth2_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_artifacts" ADD CONSTRAINT "secu_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_command_history" ADD CONSTRAINT "secu_command_history_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_command_history" ADD CONSTRAINT "secu_command_history_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_dns_ns_pivots" ADD CONSTRAINT "secu_dns_ns_pivots_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_dns_ns_pivots" ADD CONSTRAINT "secu_dns_ns_pivots_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_dns_verification_pivots" ADD CONSTRAINT "secu_dns_verification_pivots_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_dns_verification_pivots" ADD CONSTRAINT "secu_dns_verification_pivots_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_entities" ADD CONSTRAINT "secu_engagement_entities_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagement_hints" ADD CONSTRAINT "secu_engagement_hints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_engagements" ADD CONSTRAINT "secu_engagements_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_authorizations" ADD CONSTRAINT "secu_entity_authorizations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD CONSTRAINT "secu_entity_relationships_from_entity_id_secu_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_relationships" ADD CONSTRAINT "secu_entity_relationships_to_entity_id_secu_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_entity_tags" ADD CONSTRAINT "secu_entity_tags_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD CONSTRAINT "secu_findings_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_findings" ADD CONSTRAINT "secu_findings_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_html_pivots" ADD CONSTRAINT "secu_html_pivots_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_html_pivots" ADD CONSTRAINT "secu_html_pivots_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD CONSTRAINT "secu_playbook_runs_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_playbook_runs" ADD CONSTRAINT "secu_playbook_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_rules" ADD CONSTRAINT "secu_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_signal_chain_log" ADD CONSTRAINT "secu_signal_chain_log_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_signal_chain_log" ADD CONSTRAINT "secu_signal_chain_log_root_entity_id_secu_entities_id_fk" FOREIGN KEY ("root_entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_audit_log" ADD CONSTRAINT "secu_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_audit_log" ADD CONSTRAINT "secu_audit_log_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_playbook_run_id_secu_playbook_runs_id_fk" FOREIGN KEY ("playbook_run_id") REFERENCES "public"."secu_playbook_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_worker_runs" ADD CONSTRAINT "secu_worker_runs_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_log_level_idx" ON "app_logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX "app_log_created_at_idx" ON "app_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_settings_key_idx" ON "app_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "auth_email_verification_tokens_user_idx" ON "auth_email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_push_tokens_user_idx" ON "auth_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_user_idx" ON "auth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_consumption_queue_status_idx" ON "credit_consumption_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entitlement_sync_link_key_idx" ON "entitlement_sync_links" USING btree ("link_key");--> statement-breakpoint
CREATE INDEX "entitlement_sync_shop_assignment_id_idx" ON "entitlement_sync_links" USING btree ("shop_assignment_id");--> statement-breakpoint
CREATE INDEX "entitlement_sync_external_tuple_idx" ON "entitlement_sync_links" USING btree ("external_user_id","external_identifier","entitlement_type");--> statement-breakpoint
CREATE INDEX "entitlement_sync_user_role_idx" ON "entitlement_sync_links" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "role_assignment_user_idx" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_assignment_role_idx" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permission_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permission_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "usage_overage_external_event_id_idx" ON "usage_overage_events" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "usage_overage_shop_assignment_id_idx" ON "usage_overage_events" USING btree ("shop_assignment_id");--> statement-breakpoint
CREATE INDEX "usage_overage_tuple_metric_period_idx" ON "usage_overage_events" USING btree ("external_user_id","external_identifier","entitlement_type","metric_key","period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_overage_occurred_at_idx" ON "usage_overage_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "user_activity_user_idx" ON "user_activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_activity_date_idx" ON "user_activities" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "user_activity_user_date_idx" ON "user_activities" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "webhook_external_id_idx" ON "webhooks" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "webhook_provider_event_idx" ON "webhooks" USING btree ("provider","event_type");--> statement-breakpoint
CREATE INDEX "workflow_queue_status_idx" ON "workflow_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_queue_workflow_type_idx" ON "workflow_queue" USING btree ("workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_queue_created_at_idx" ON "workflow_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_queue_user_id_idx" ON "workflow_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_queue_status_type_idx" ON "workflow_queue" USING btree ("status","workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_queue_abort_idx" ON "workflow_queue" USING btree ("id","abort_requested");--> statement-breakpoint
CREATE INDEX "workflow_queue_timeout_idx" ON "workflow_queue" USING btree ("timeout_at","status");--> statement-breakpoint
CREATE INDEX "oauth2_audit_log_client_id_idx" ON "oauth2_audit_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth2_audit_log_timestamp_idx" ON "oauth2_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "oauth2_clients_client_id_idx" ON "oauth2_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth2_clients_fingerprint_idx" ON "oauth2_clients" USING btree ("client_secret_fingerprint");--> statement-breakpoint
CREATE INDEX "oauth2_clients_company_id_idx" ON "oauth2_clients" USING btree ("managing_company_id");--> statement-breakpoint
CREATE INDEX "oauth2_refresh_tokens_fingerprint_idx" ON "oauth2_refresh_tokens" USING btree ("token_fingerprint");--> statement-breakpoint
CREATE INDEX "oauth2_refresh_tokens_client_id_idx" ON "oauth2_refresh_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth2_refresh_tokens_expires_at_idx" ON "oauth2_refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "secu_artifacts_engagement_idx" ON "secu_artifacts" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_artifacts_entity_idx" ON "secu_artifacts" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_artifacts_kind_idx" ON "secu_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "secu_cmd_engagement_idx" ON "secu_command_history" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_cmd_worker_run_idx" ON "secu_command_history" USING btree ("worker_run_id");--> statement-breakpoint
CREATE INDEX "secu_dns_ns_pivots_engagement_idx" ON "secu_dns_ns_pivots" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_dns_ns_pivots_entity_idx" ON "secu_dns_ns_pivots" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_dns_ns_pivots_type_value_idx" ON "secu_dns_ns_pivots" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "secu_dns_verification_pivots_engagement_idx" ON "secu_dns_verification_pivots" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_dns_verification_pivots_entity_idx" ON "secu_dns_verification_pivots" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_dns_verification_pivots_type_value_idx" ON "secu_dns_verification_pivots" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "secu_eng_ent_engagement_idx" ON "secu_engagement_entities" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_eng_ent_entity_idx" ON "secu_engagement_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_engagement_hints_engagement_idx" ON "secu_engagement_hints" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_engagement_hints_engagement_slot_idx" ON "secu_engagement_hints" USING btree ("engagement_id","slot");--> statement-breakpoint
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
CREATE INDEX "secu_html_pivots_engagement_idx" ON "secu_html_pivots" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_html_pivots_entity_idx" ON "secu_html_pivots" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_html_pivots_type_value_idx" ON "secu_html_pivots" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "secu_infra_providers_category_idx" ON "secu_infrastructure_providers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "secu_infra_providers_active_idx" ON "secu_infrastructure_providers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_engagement_idx" ON "secu_playbook_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_status_idx" ON "secu_playbook_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_key_idx" ON "secu_playbook_runs" USING btree ("playbook_key");--> statement-breakpoint
CREATE INDEX "secu_playbook_runs_parent_idx" ON "secu_playbook_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "secu_rules_trigger_idx" ON "secu_rules" USING btree ("trigger");--> statement-breakpoint
CREATE INDEX "secu_rules_enabled_idx" ON "secu_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "secu_rules_scope_idx" ON "secu_rules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "secu_signal_chain_engagement_idx" ON "secu_signal_chain_log" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_signal_chain_root_idx" ON "secu_signal_chain_log" USING btree ("root_entity_id");--> statement-breakpoint
CREATE INDEX "secu_audit_actor_idx" ON "secu_audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "secu_audit_action_idx" ON "secu_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "secu_audit_target_idx" ON "secu_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "secu_audit_engagement_idx" ON "secu_audit_log" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_engagement_idx" ON "secu_worker_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_playbook_idx" ON "secu_worker_runs" USING btree ("playbook_run_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_entity_idx" ON "secu_worker_runs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_key_idx" ON "secu_worker_runs" USING btree ("worker_key");--> statement-breakpoint
CREATE INDEX "secu_worker_runs_status_idx" ON "secu_worker_runs" USING btree ("status");