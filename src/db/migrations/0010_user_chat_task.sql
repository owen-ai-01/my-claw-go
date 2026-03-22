ALTER TABLE "user_chat_message"
ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'done' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_chat_message"
ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE "user_chat_message"
ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_chat_task" (
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
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_user_message_id_user_chat_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."user_chat_message"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_chat_task" ADD CONSTRAINT "user_chat_task_assistant_message_id_user_chat_message_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."user_chat_message"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_chat_task_user_idx" ON "user_chat_task" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_chat_task_user_agent_idx" ON "user_chat_task" USING btree ("user_id","agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_chat_task_status_idx" ON "user_chat_task" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_chat_task_created_at_idx" ON "user_chat_task" USING btree ("created_at");
