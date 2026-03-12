CREATE TABLE "runtime_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"message" text NOT NULL,
	"is_command" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reply" text,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_agent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_key" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"runtime_agent_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_agent_telegram_bot" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_agent_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bot_token_encrypted" text,
	"bot_username" text,
	"bot_telegram_id" text,
	"webhook_path" text,
	"webhook_secret" text,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_channel_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_agent_id" text NOT NULL,
	"telegram_bot_id" text,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_chat_id" text,
	"external_user_id" text,
	"external_username" text,
	"external_display_name" text,
	"bind_code" text,
	"bind_code_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_agent" ADD CONSTRAINT "user_agent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_telegram_bot" ADD CONSTRAINT "user_agent_telegram_bot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_telegram_bot" ADD CONSTRAINT "user_agent_telegram_bot_user_agent_id_user_agent_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channel_binding" ADD CONSTRAINT "user_channel_binding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channel_binding" ADD CONSTRAINT "user_channel_binding_user_agent_id_user_agent_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channel_binding" ADD CONSTRAINT "user_channel_binding_telegram_bot_id_user_agent_telegram_bot_id_fk" FOREIGN KEY ("telegram_bot_id") REFERENCES "public"."user_agent_telegram_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtime_task_session_idx" ON "runtime_tasks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "runtime_task_status_idx" ON "runtime_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runtime_task_created_at_idx" ON "runtime_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_agent_user_idx" ON "user_agent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agent_user_agent_key_idx" ON "user_agent" USING btree ("user_id","agent_key");--> statement-breakpoint
CREATE INDEX "user_agent_user_slug_idx" ON "user_agent" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "user_agent_user_default_idx" ON "user_agent" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "user_agent_telegram_bot_user_idx" ON "user_agent_telegram_bot" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agent_telegram_bot_agent_idx" ON "user_agent_telegram_bot" USING btree ("user_agent_id");--> statement-breakpoint
CREATE INDEX "user_agent_telegram_bot_status_idx" ON "user_agent_telegram_bot" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_agent_telegram_bot_webhook_path_idx" ON "user_agent_telegram_bot" USING btree ("webhook_path");--> statement-breakpoint
CREATE INDEX "user_channel_binding_user_idx" ON "user_channel_binding" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_channel_binding_agent_idx" ON "user_channel_binding" USING btree ("user_agent_id");--> statement-breakpoint
CREATE INDEX "user_channel_binding_bot_idx" ON "user_channel_binding" USING btree ("telegram_bot_id");--> statement-breakpoint
CREATE INDEX "user_channel_binding_channel_idx" ON "user_channel_binding" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "user_channel_binding_status_idx" ON "user_channel_binding" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_channel_binding_chat_idx" ON "user_channel_binding" USING btree ("external_chat_id");--> statement-breakpoint
CREATE INDEX "user_channel_binding_bind_code_idx" ON "user_channel_binding" USING btree ("bind_code");