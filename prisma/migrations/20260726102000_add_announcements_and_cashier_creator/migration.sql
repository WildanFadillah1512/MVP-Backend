-- Track who submitted cashier revenue reports.
ALTER TABLE "CashierReport"
ADD COLUMN "createdById" TEXT;

CREATE INDEX "CashierReport_createdById_idx" ON "CashierReport"("createdById");

ALTER TABLE "CashierReport"
ADD CONSTRAINT "CashierReport_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CEO announcements shown as popup notifications to employees.
CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileName" TEXT,
  "isPopup" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_isActive_createdAt_idx" ON "Announcement"("isActive", "createdAt");
CREATE INDEX "Announcement_createdById_idx" ON "Announcement"("createdById");

ALTER TABLE "Announcement"
ADD CONSTRAINT "Announcement_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
