-- CreateTable
CREATE TABLE "FinancialProfile" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "filingStatus" TEXT NOT NULL DEFAULT 'MARRIED_JOINT',
    "stateCode" TEXT NOT NULL DEFAULT 'CA',
    "emergencyFundMonthsTarget" INTEGER NOT NULL DEFAULT 6,
    "riskTolerance" TEXT NOT NULL DEFAULT 'MODERATE',
    "financialLiteracy" TEXT NOT NULL DEFAULT 'BEGINNER',
    "hasWill" BOOLEAN NOT NULL DEFAULT false,
    "hasEstateBeneficiaries" BOOLEAN NOT NULL DEFAULT false,
    "highInterestDebtCents" INTEGER NOT NULL DEFAULT 0,
    "highInterestDebtApr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarnerProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "annualSalaryCents" INTEGER NOT NULL DEFAULT 0,
    "annualBonusCents" INTEGER NOT NULL DEFAULT 0,
    "selfEmployed" BOOLEAN NOT NULL DEFAULT false,
    "hasWorkplacePlan" BOOLEAN NOT NULL DEFAULT false,
    "planType" TEXT NOT NULL DEFAULT '401K',
    "employerMatchPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employerMatchLimitPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentDeferralPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentDeferralIsRoth" BOOLEAN NOT NULL DEFAULT false,
    "planAllowsAfterTax" BOOLEAN NOT NULL DEFAULT false,
    "planAllowsInPlanRoth" BOOLEAN NOT NULL DEFAULT false,
    "planAllowsInServiceW" BOOLEAN NOT NULL DEFAULT false,
    "employerContribCents" INTEGER NOT NULL DEFAULT 0,
    "traditionalIraBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "currentIraContribCents" INTEGER NOT NULL DEFAULT 0,
    "hsaEligible" BOOLEAN NOT NULL DEFAULT false,
    "hsaCoverage" TEXT NOT NULL DEFAULT 'NONE',
    "currentHsaContribCents" INTEGER NOT NULL DEFAULT 0,
    "employerHsaContribCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GOOD',
    "statusDetail" TEXT,
    "cursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "consentExpiresAt" TIMESTAMP(3),
    "linkedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "plaidItemId" TEXT,
    "plaidAccountId" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currentBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "availableBalanceCents" INTEGER,
    "limitCents" INTEGER,
    "isoCurrency" TEXT NOT NULL DEFAULT 'USD',
    "interestRateApr" DOUBLE PRECISION,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "ownerMemberId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'HOUSEHOLD',
    "closedAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plaidTransactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedDate" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "amountCents" INTEGER NOT NULL,
    "isoCurrency" TEXT NOT NULL DEFAULT 'USD',
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "categoryKey" TEXT NOT NULL DEFAULT 'uncategorized',
    "categorySource" TEXT NOT NULL DEFAULT 'PLAID',
    "plaidPfcPrimary" TEXT,
    "plaidPfcDetailed" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringKey" TEXT,
    "excludedFromCashflow" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "matchField" TEXT NOT NULL DEFAULT 'NAME',
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "pattern" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "markAsTransfer" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "templateKey" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "monthlyContributionCents" INTEGER NOT NULL DEFAULT 0,
    "currentCents" INTEGER NOT NULL DEFAULT 0,
    "linkedAccountId" TEXT,
    "forMemberId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "transactionId" TEXT,
    "note" TEXT,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT,
    "type" TEXT NOT NULL,
    "carrier" TEXT,
    "coverageCents" INTEGER NOT NULL DEFAULT 0,
    "annualPremiumCents" INTEGER NOT NULL DEFAULT 0,
    "termYears" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "beneficiary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSnapshot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplanationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'OK',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialProfile_householdId_key" ON "FinancialProfile"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "EarnerProfile_memberId_key" ON "EarnerProfile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- CreateIndex
CREATE INDEX "PlaidItem_householdId_idx" ON "PlaidItem"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_plaidAccountId_key" ON "FinancialAccount"("plaidAccountId");

-- CreateIndex
CREATE INDEX "FinancialAccount_householdId_type_idx" ON "FinancialAccount"("householdId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_date_idx" ON "Transaction"("householdId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_householdId_categoryKey_idx" ON "Transaction"("householdId", "categoryKey");

-- CreateIndex
CREATE INDEX "CategoryRule_householdId_priority_idx" ON "CategoryRule"("householdId", "priority");

-- CreateIndex
CREATE INDEX "SavingsGoal_householdId_status_idx" ON "SavingsGoal"("householdId", "status");

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_occurredAt_idx" ON "GoalContribution"("goalId", "occurredAt");

-- CreateIndex
CREATE INDEX "InsurancePolicy_householdId_idx" ON "InsurancePolicy"("householdId");

-- CreateIndex
CREATE INDEX "RecommendationSnapshot_householdId_generatedAt_idx" ON "RecommendationSnapshot"("householdId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExplanationCache_cacheKey_key" ON "ExplanationCache"("cacheKey");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_householdId_createdAt_idx" ON "FinancialAuditLog"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinancialProfile" ADD CONSTRAINT "FinancialProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarnerProfile" ADD CONSTRAINT "EarnerProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_forMemberId_fkey" FOREIGN KEY ("forMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnapshot" ADD CONSTRAINT "RecommendationSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAuditLog" ADD CONSTRAINT "FinancialAuditLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
