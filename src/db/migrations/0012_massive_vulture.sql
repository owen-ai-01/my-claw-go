DROP INDEX "user_credit_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_credit_user_id_idx" ON "user_credit" USING btree ("user_id");