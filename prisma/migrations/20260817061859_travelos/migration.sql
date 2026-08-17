-- CreateTable
CREATE TABLE "TravelPreferences" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "homeAirport" TEXT,
    "maxFlightHours" INTEGER NOT NULL DEFAULT 6,
    "domesticOnly" BOOLEAN NOT NULL DEFAULT false,
    "passportsReady" BOOLEAN NOT NULL DEFAULT false,
    "budgetPerTripCents" INTEGER NOT NULL DEFAULT 0,
    "preferredStyles" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCalendar" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolName" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "schoolYearStart" TIMESTAMP(3),
    "schoolYearEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "extractionModel" TEXT,
    "extractionNotes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCalendarChild" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "SchoolCalendarChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCalendarEntry" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "noSchool" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'PARSED',
    "confidence" DOUBLE PRECISION,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAvailability" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "ptoDaysPerYear" INTEGER NOT NULL DEFAULT 15,
    "ptoDaysRemaining" INTEGER NOT NULL DEFAULT 15,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackoutPeriod" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlackoutPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelWindow" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "schoolDaysMissed" INTEGER NOT NULL DEFAULT 0,
    "ptoDaysRequired" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonLabel" TEXT,
    "reasons" JSONB,
    "conflicts" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "engineVersion" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightOption" (
    "id" TEXT NOT NULL,
    "windowId" TEXT,
    "tripId" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationName" TEXT,
    "departAt" TIMESTAMP(3) NOT NULL,
    "returnAt" TIMESTAMP(3),
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "airline" TEXT,
    "flightNumber" TEXT,
    "transfers" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "bookingUrl" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'TRAVELPAYOUTS',
    "priceSeenAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlightOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "windowId" TEXT,
    "name" TEXT NOT NULL,
    "destinationCode" TEXT,
    "destinationName" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "savingsGoalId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelPreferences_householdId_key" ON "TravelPreferences"("householdId");

-- CreateIndex
CREATE INDEX "SchoolCalendar_householdId_status_idx" ON "SchoolCalendar"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCalendarChild_calendarId_childId_key" ON "SchoolCalendarChild"("calendarId", "childId");

-- CreateIndex
CREATE INDEX "SchoolCalendarEntry_calendarId_startDate_idx" ON "SchoolCalendarEntry"("calendarId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "TravelAvailability_memberId_key" ON "TravelAvailability"("memberId");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_householdId_startDate_idx" ON "BlackoutPeriod"("householdId", "startDate");

-- CreateIndex
CREATE INDEX "TravelWindow_householdId_status_idx" ON "TravelWindow"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TravelWindow_householdId_startDate_endDate_key" ON "TravelWindow"("householdId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "FlightOption_windowId_rank_idx" ON "FlightOption"("windowId", "rank");

-- CreateIndex
CREATE INDEX "Trip_householdId_startDate_idx" ON "Trip"("householdId", "startDate");

-- AddForeignKey
ALTER TABLE "TravelPreferences" ADD CONSTRAINT "TravelPreferences_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendar" ADD CONSTRAINT "SchoolCalendar_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarChild" ADD CONSTRAINT "SchoolCalendarChild_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SchoolCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarChild" ADD CONSTRAINT "SchoolCalendarChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCalendarEntry" ADD CONSTRAINT "SchoolCalendarEntry_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SchoolCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelAvailability" ADD CONSTRAINT "TravelAvailability_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutPeriod" ADD CONSTRAINT "BlackoutPeriod_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutPeriod" ADD CONSTRAINT "BlackoutPeriod_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelWindow" ADD CONSTRAINT "TravelWindow_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightOption" ADD CONSTRAINT "FlightOption_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "TravelWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightOption" ADD CONSTRAINT "FlightOption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "TravelWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
