-- CreateTable
CREATE TABLE "LeaveCancellationRequest" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveCancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveCancellationRequest_leaveRequestId_idx" ON "LeaveCancellationRequest"("leaveRequestId");

-- CreateIndex
CREATE INDEX "LeaveCancellationRequest_userId_status_idx" ON "LeaveCancellationRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "LeaveCancellationRequest_reviewerId_idx" ON "LeaveCancellationRequest"("reviewerId");

-- AddForeignKey
ALTER TABLE "LeaveCancellationRequest" ADD CONSTRAINT "LeaveCancellationRequest_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCancellationRequest" ADD CONSTRAINT "LeaveCancellationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCancellationRequest" ADD CONSTRAINT "LeaveCancellationRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
