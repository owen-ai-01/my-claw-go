CREATE TABLE "user_agent_doc" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"doc_key" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"leader_id" text NOT NULL,
	"members" jsonb NOT NULL,
	"relay" jsonb,
	"channels" jsonb,
	"group_created_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD COLUMN "channel" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD COLUMN "chat_scope" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD COLUMN "routed_agent_id" text;--> statement-breakpoint
ALTER TABLE "user_chat_message" ADD COLUMN "meta_json" jsonb;--> statement-breakpoint
ALTER TABLE "user_agent_doc" ADD CONSTRAINT "user_agent_doc_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group" ADD CONSTRAINT "user_group_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_agent_doc_unique_idx" ON "user_agent_doc" USING btree ("user_id","agent_id","doc_key");--> statement-breakpoint
CREATE INDEX "user_agent_doc_user_idx" ON "user_agent_doc" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agent_doc_user_agent_idx" ON "user_agent_doc" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_unique_idx" ON "user_group" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "user_group_user_idx" ON "user_group" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_chat_message_group_idx" ON "user_chat_message" USING btree ("user_id","group_id");