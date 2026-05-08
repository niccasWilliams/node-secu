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
ALTER TABLE "secu_html_pivots" ADD CONSTRAINT "secu_html_pivots_engagement_id_secu_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."secu_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secu_html_pivots" ADD CONSTRAINT "secu_html_pivots_entity_id_secu_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."secu_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secu_html_pivots_engagement_idx" ON "secu_html_pivots" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "secu_html_pivots_entity_idx" ON "secu_html_pivots" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "secu_html_pivots_type_value_idx" ON "secu_html_pivots" USING btree ("id_type","id_value");