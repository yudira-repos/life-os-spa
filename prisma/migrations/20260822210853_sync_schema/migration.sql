-- CreateTable
CREATE TABLE "DayPreferences" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "morningBriefMinute" INTEGER NOT NULL DEFAULT 420,
    "eveningBriefMinute" INTEGER,
    "briefEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultArrivalBufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "defaultPrepMinutes" INTEGER NOT NULL DEFAULT 10,
    "askLeadMinutes" INTEGER NOT NULL DEFAULT 120,
    "remindLeadMinutes" INTEGER NOT NULL DEFAULT 45,
    "escalateLeadMinutes" INTEGER NOT NULL DEFAULT 25,
    "uncoveredLeadMinutes" INTEGER NOT NULL DEFAULT 10,
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberDayProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "homePlaceId" TEXT,
    "workPlaceId" TEXT,
    "workWeekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "workStartMinute" INTEGER NOT NULL DEFAULT 540,
    "workEndMinute" INTEGER NOT NULL DEFAULT 1020,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberDayProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
    "address" TEXT NOT NULL,
    "providerPlaceId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "parkingBufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalContact" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'NONE',
    "channelAddress" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChannel" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "quietFromMinute" INTEGER,
    "quietToMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinationGroup" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CARPOOL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinationGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT,
    "contactId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CoordinationGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rotation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIXED_WEEKDAY',
    "anchorDay" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RotationSlot" (
    "id" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "weekday" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "memberId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "RotationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentOverride" (
    "id" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COVER',
    "assigneeMemberId" TEXT,
    "assigneeContactId" TEXT,
    "replacedMemberId" TEXT,
    "replacedContactId" TEXT,
    "swappedWithDay" TIMESTAMP(3),
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "subjectMemberId" TEXT,
    "placeId" TEXT,
    "originPlaceId" TEXT,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER,
    "weekdays" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "schoolDaysOnly" BOOLEAN NOT NULL DEFAULT false,
    "travelRequired" BOOLEAN NOT NULL DEFAULT true,
    "arrivalBufferMinutes" INTEGER,
    "prepMinutes" INTEGER,
    "defaultResponsibleMemberId" TEXT,
    "rotationId" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "notifyChannels" TEXT NOT NULL DEFAULT '',
    "notifyGroup" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySkip" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityOccurrence" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "responsibleMemberId" TEXT,
    "responsibleContactId" TEXT,
    "assignmentSource" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "originPlaceId" TEXT,
    "originConfidence" TEXT,
    "travelMinutes" INTEGER,
    "leaveAt" TIMESTAMP(3),
    "arriveBy" TIMESTAMP(3),
    "estimateComputedAt" TIMESTAMP(3),
    "estimateConverged" BOOLEAN NOT NULL DEFAULT true,
    "retimeAlertsSent" INTEGER NOT NULL DEFAULT 0,
    "lastToldTravelMinutes" INTEGER,
    "lastToldAt" TIMESTAMP(3),
    "phase" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "confirmationState" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "confirmedAt" TIMESTAMP(3),
    "escalationsSent" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelEstimate" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "originKey" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "departureBucket" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE',
    "quality" TEXT NOT NULL DEFAULT 'LIVE',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayPreferences_householdId_key" ON "DayPreferences"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberDayProfile_memberId_key" ON "MemberDayProfile"("memberId");

-- CreateIndex
CREATE INDEX "Place_householdId_kind_idx" ON "Place"("householdId", "kind");

-- CreateIndex
CREATE INDEX "ExternalContact_householdId_idx" ON "ExternalContact"("householdId");

-- CreateIndex
CREATE INDEX "MemberChannel_memberId_isPrimary_idx" ON "MemberChannel"("memberId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "MemberChannel_memberId_channel_key" ON "MemberChannel"("memberId", "channel");

-- CreateIndex
CREATE INDEX "CoordinationGroup_householdId_idx" ON "CoordinationGroup"("householdId");

-- CreateIndex
CREATE INDEX "CoordinationGroupMember_groupId_orderIndex_idx" ON "CoordinationGroupMember"("groupId", "orderIndex");

-- CreateIndex
CREATE INDEX "Rotation_householdId_idx" ON "Rotation"("householdId");

-- CreateIndex
CREATE INDEX "RotationSlot_rotationId_orderIndex_idx" ON "RotationSlot"("rotationId", "orderIndex");

-- CreateIndex
CREATE INDEX "AssignmentOverride_rotationId_day_idx" ON "AssignmentOverride"("rotationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentOverride_rotationId_day_key" ON "AssignmentOverride"("rotationId", "day");

-- CreateIndex
CREATE INDEX "Activity_householdId_status_idx" ON "Activity"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_householdId_externalEventId_key" ON "Activity"("householdId", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySkip_activityId_day_key" ON "ActivitySkip"("activityId", "day");

-- CreateIndex
CREATE INDEX "ActivityOccurrence_householdId_day_idx" ON "ActivityOccurrence"("householdId", "day");

-- CreateIndex
CREATE INDEX "ActivityOccurrence_householdId_leaveAt_idx" ON "ActivityOccurrence"("householdId", "leaveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityOccurrence_activityId_day_key" ON "ActivityOccurrence"("activityId", "day");

-- CreateIndex
CREATE INDEX "TravelEstimate_householdId_observedAt_idx" ON "TravelEstimate"("householdId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelEstimate_householdId_originKey_destinationKey_weekday_key" ON "TravelEstimate"("householdId", "originKey", "destinationKey", "weekday", "departureBucket");

-- CreateIndex
CREATE INDEX "NotificationDispatch_occurrenceId_createdAt_idx" ON "NotificationDispatch"("occurrenceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDispatch_occurrenceId_kind_recipient_key" ON "NotificationDispatch"("occurrenceId", "kind", "recipient");

-- AddForeignKey
ALTER TABLE "DayPreferences" ADD CONSTRAINT "DayPreferences_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDayProfile" ADD CONSTRAINT "MemberDayProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDayProfile" ADD CONSTRAINT "MemberDayProfile_homePlaceId_fkey" FOREIGN KEY ("homePlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDayProfile" ADD CONSTRAINT "MemberDayProfile_workPlaceId_fkey" FOREIGN KEY ("workPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChannel" ADD CONSTRAINT "MemberChannel_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationGroup" ADD CONSTRAINT "CoordinationGroup_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationGroupMember" ADD CONSTRAINT "CoordinationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CoordinationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationGroupMember" ADD CONSTRAINT "CoordinationGroupMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationGroupMember" ADD CONSTRAINT "CoordinationGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rotation" ADD CONSTRAINT "Rotation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CoordinationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "Rotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "Rotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_assigneeMemberId_fkey" FOREIGN KEY ("assigneeMemberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_assigneeContactId_fkey" FOREIGN KEY ("assigneeContactId") REFERENCES "ExternalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentOverride" ADD CONSTRAINT "AssignmentOverride_replacedMemberId_fkey" FOREIGN KEY ("replacedMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_subjectMemberId_fkey" FOREIGN KEY ("subjectMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_defaultResponsibleMemberId_fkey" FOREIGN KEY ("defaultResponsibleMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_originPlaceId_fkey" FOREIGN KEY ("originPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "Rotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySkip" ADD CONSTRAINT "ActivitySkip_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOccurrence" ADD CONSTRAINT "ActivityOccurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOccurrence" ADD CONSTRAINT "ActivityOccurrence_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOccurrence" ADD CONSTRAINT "ActivityOccurrence_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOccurrence" ADD CONSTRAINT "ActivityOccurrence_responsibleContactId_fkey" FOREIGN KEY ("responsibleContactId") REFERENCES "ExternalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOccurrence" ADD CONSTRAINT "ActivityOccurrence_originPlaceId_fkey" FOREIGN KEY ("originPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelEstimate" ADD CONSTRAINT "TravelEstimate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ActivityOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
