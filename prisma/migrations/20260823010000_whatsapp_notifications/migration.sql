-- Per-person notification preferences, independent of the channel they arrive on.
CREATE TABLE "MemberNotificationPrefs" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "calendarBrief" BOOLEAN NOT NULL DEFAULT true,
    "leaveNowAlerts" BOOLEAN NOT NULL DEFAULT true,
    "aiNewsBrief" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberNotificationPrefs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberNotificationPrefs_memberId_key" ON "MemberNotificationPrefs"("memberId");
ALTER TABLE "MemberNotificationPrefs" ADD CONSTRAINT "MemberNotificationPrefs_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Outbound WhatsApp queue. The gateway holds the paired session and exposes no
-- HTTP send API, so delivery is pull-based and this is the handoff point.
CREATE TABLE "WhatsappOutbox" (
    "id" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BRIEF',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsappOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsappOutbox_dedupeKey_key" ON "WhatsappOutbox"("dedupeKey");
CREATE INDEX "WhatsappOutbox_status_createdAt_idx" ON "WhatsappOutbox"("status", "createdAt");
CREATE INDEX "WhatsappOutbox_status_urgent_createdAt_idx" ON "WhatsappOutbox"("status", "urgent", "createdAt");
