ALTER TABLE "Task" ADD COLUMN "scheduleType" TEXT NOT NULL DEFAULT 'ONE_TIME';
ALTER TABLE "Task" ADD COLUMN "scheduleDate" DATE;

CREATE INDEX "Task_scheduleType_scheduleDate_idx" ON "Task"("scheduleType", "scheduleDate");
