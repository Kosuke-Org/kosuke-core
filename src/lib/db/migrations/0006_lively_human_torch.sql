ALTER TABLE "tasks" RENAME COLUMN "task_id" TO "external_id";--> statement-breakpoint
DROP INDEX "idx_tasks_task_id";--> statement-breakpoint
CREATE INDEX "idx_tasks_external_id" ON "tasks" USING btree ("external_id");