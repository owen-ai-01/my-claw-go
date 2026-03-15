CREATE TABLE "user_chat_billing_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text DEFAULT 'main' NOT NULL,
	"model" text,
	"pricing_model_key" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"usd_cost" text,
	"credits_deducted" integer,
	"error" text,
	"meta_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_chat_billing_audit" ADD CONSTRAINT "user_chat_billing_audit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_user_idx" ON "user_chat_billing_audit" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_user_agent_idx" ON "user_chat_billing_audit" USING btree ("user_id","agent_id");
--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_created_at_idx" ON "user_chat_billing_audit" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_status_idx" ON "user_chat_billing_audit" USING btree ("status");
