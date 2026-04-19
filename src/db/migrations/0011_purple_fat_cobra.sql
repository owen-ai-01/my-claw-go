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
CREATE TABLE "user_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text DEFAULT 'main' NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_chat_task" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text DEFAULT 'main' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_openrouter_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_encrypted" text NOT NULL,
	"limit_usd" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "user_chat_billing_audit" ADD CONSTRAINT "user_chat_billing_audit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD CONSTRAINT "user_chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_user_message_id_user_chat_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."user_chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_assistant_message_id_user_chat_message_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."user_chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_openrouter_key" ADD CONSTRAINT "user_openrouter_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_user_idx" ON "user_chat_billing_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_user_agent_idx" ON "user_chat_billing_audit" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_created_at_idx" ON "user_chat_billing_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_chat_billing_audit_status_idx" ON "user_chat_billing_audit" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_chat_message_user_idx" ON "user_chat_message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_chat_message_user_agent_idx" ON "user_chat_message" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX "user_chat_message_created_at_idx" ON "user_chat_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_chat_task_user_idx" ON "user_chat_task" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_chat_task_user_agent_idx" ON "user_chat_task" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX "user_chat_task_status_idx" ON "user_chat_task" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_chat_task_created_at_idx" ON "user_chat_task" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_openrouter_key_user_idx" ON "user_openrouter_key" USING btree ("user_id");