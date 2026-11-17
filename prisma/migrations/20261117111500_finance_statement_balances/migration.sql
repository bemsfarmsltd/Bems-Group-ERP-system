CREATE TABLE "FinanceStatementBalance" (
  "organizationId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "month" DATE NOT NULL,
  "openingMinor" BIGINT NOT NULL, "closingMinor" BIGINT NOT NULL, "reference" TEXT NOT NULL,
  PRIMARY KEY ("accountId","month"),
  FOREIGN KEY ("organizationId","accountId") REFERENCES "FinanceAccount"("organizationId","id")
);
CREATE TABLE "FinanceReconciliationAssignment" (
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "targetType" TEXT NOT NULL CHECK ("targetType" IN ('STATEMENT','LEDGER')),
  "targetId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL REFERENCES "Employee"("id"),
  PRIMARY KEY ("organizationId","targetType","targetId")
);
