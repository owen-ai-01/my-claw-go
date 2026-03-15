CREATE TABLE "user_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text DEFAULT 'main' NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD CONSTRAINT "user_chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_chat_message_user_idx" ON "user_chat_message" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_chat_message_user_agent_idx" ON "user_chat_message" USING btree ("user_id","agent_id");
--> statement-breakpoint
CREATE INDEX "user_chat_message_created_at_idx" ON "user_chat_message" USING btree ("created_at");
