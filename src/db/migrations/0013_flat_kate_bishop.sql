CREATE TABLE "hetznerProject" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_token" text NOT NULL,
	"region" text DEFAULT 'fsn1' NOT NULL,
	"max_servers" integer DEFAULT 90 NOT NULL,
	"ssh_key_id" integer DEFAULT 0 NOT NULL,
	"firewall_id" integer DEFAULT 0 NOT NULL,
	"snapshot_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "runtimeAllocation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"host_id" text,
	"plan" text NOT NULL,
	"bridge_base_url" text,
	"bridge_token" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "runtimeAllocation_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "runtimeHost" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"project_id" text,
	"hetzner_server_id" text,
	"name" text NOT NULL,
	"plan" text NOT NULL,
	"server_type" text NOT NULL,
	"region" text DEFAULT 'fsn1' NOT NULL,
	"public_ip" text,
	"bridge_base_url" text,
	"bridge_token" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "runtimeHost_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "runtimeProvisionJob" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"project_id" text,
	"hetzner_server_id" text,
	"last_error" text,
	"attempt_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "runtimeAllocation" ADD CONSTRAINT "runtimeAllocation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtimeAllocation" ADD CONSTRAINT "runtimeAllocation_host_id_runtimeHost_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."runtimeHost"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtimeHost" ADD CONSTRAINT "runtimeHost_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtimeHost" ADD CONSTRAINT "runtimeHost_project_id_hetznerProject_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."hetznerProject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtimeProvisionJob" ADD CONSTRAINT "runtimeProvisionJob_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;