ALTER TABLE "User" ADD COLUMN "branchId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ResignationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "backupSnapshot" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResignationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarningLetter" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SP1',
    "reason" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarningLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "ResignationRequest_userId_idx" ON "ResignationRequest"("userId");
CREATE INDEX "ResignationRequest_status_idx" ON "ResignationRequest"("status");
CREATE INDEX "WarningLetter_employeeId_status_idx" ON "WarningLetter"("employeeId", "status");
CREATE INDEX "WarningLetter_expiresAt_idx" ON "WarningLetter"("expiresAt");

ALTER TABLE "ResignationRequest" ADD CONSTRAINT "ResignationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarningLetter" ADD CONSTRAINT "WarningLetter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarningLetter" ADD CONSTRAINT "WarningLetter_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
