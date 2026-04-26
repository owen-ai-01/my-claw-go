-- Dev/test database setup for one-user-one-VPS runtime provisioning.
-- Run this manually against the test database only.
-- Do not run against production until the dev flow has been verified.

CREATE TABLE IF NOT EXISTS "hetznerProject" (
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

CREATE TABLE IF NOT EXISTS "runtimeHost" (
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

CREATE TABLE IF NOT EXISTS "runtimeAllocation" (
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

CREATE TABLE IF NOT EXISTS "runtimeProvisionJob" (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtimeHost_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "runtimeHost"
      ADD CONSTRAINT "runtimeHost_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtimeHost_project_id_hetznerProject_id_fk'
  ) THEN
    ALTER TABLE "runtimeHost"
      ADD CONSTRAINT "runtimeHost_project_id_hetznerProject_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."hetznerProject"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtimeAllocation_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "runtimeAllocation"
      ADD CONSTRAINT "runtimeAllocation_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtimeAllocation_host_id_runtimeHost_id_fk'
  ) THEN
    ALTER TABLE "runtimeAllocation"
      ADD CONSTRAINT "runtimeAllocation_host_id_runtimeHost_id_fk"
      FOREIGN KEY ("host_id") REFERENCES "public"."runtimeHost"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runtimeProvisionJob_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "runtimeProvisionJob"
      ADD CONSTRAINT "runtimeProvisionJob_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Insert/update the dev Hetzner project manually after replacing placeholders.
--
-- Security note:
-- The current code reads hetznerProject.api_token directly, so this dev SQL
-- stores the Hetzner API Token in the test database. This is acceptable only
-- for short-lived development verification. For production, prefer the safer
-- follow-up design documented in DEV_RUNTIME_VPS_NEXT_STEPS_20260426.md:
-- store api_token_ref in DB and keep the real token in environment variables.
--
-- The app reads hetznerProject and does not auto-sync HETZNER_PROJECTS from
-- .env at Node.js startup.
INSERT INTO "hetznerProject" (
  "id",
  "name",
  "api_token",
  "region",
  "max_servers",
  "ssh_key_id",
  "firewall_id",
  "snapshot_id",
  "status"
) VALUES (
  'proj-01',
  'myclawgo-runtime-01',
  '<HETZNER_API_TOKEN>',
  'fsn1',
  90,
  <HETZNER_SSH_KEY_ID>,
  <HETZNER_FIREWALL_ID>,
  <HETZNER_SNAPSHOT_ID_OR_NULL>,
  'active'
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "api_token" = EXCLUDED."api_token",
  "region" = EXCLUDED."region",
  "max_servers" = EXCLUDED."max_servers",
  "ssh_key_id" = EXCLUDED."ssh_key_id",
  "firewall_id" = EXCLUDED."firewall_id",
  "snapshot_id" = EXCLUDED."snapshot_id",
  "status" = EXCLUDED."status",
  "updated_at" = now();
