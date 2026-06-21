CREATE TABLE "realtime_coordination" (
	"key" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"created_at" bigint
);
--> statement-breakpoint
CREATE INDEX "realtime_coordination_expires_at_idx" ON "realtime_coordination" USING btree ("expires_at");