-- Dev/test database setup for one-user-one-VPS runtime provisioning.
-- Run this manually against the test database only.
-- Do not run against production until the dev flow has been verified.
-- Hetzner project configuration is read from HETZNER_PROJECTS env JSON.
-- No hetznerProject table is required.

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
