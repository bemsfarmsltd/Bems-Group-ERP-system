CREATE TABLE "WalletApprovalCredential" (
  "employeeId" TEXT PRIMARY KEY REFERENCES "Employee"("id"),
  "pinHash" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("failedAttempts" BETWEEN 0 AND 3),
  "lockedAt" TIMESTAMPTZ,
  "recoveryUntil" TIMESTAMPTZ
);
ALTER TABLE "WalletChallenge"
  ADD COLUMN "approvalPinHash" TEXT,
  ADD COLUMN "otpDigest" TEXT,
  ADD COLUMN "otpVerifiedAt" TIMESTAMPTZ,
  ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("otpAttempts" BETWEEN 0 AND 3);
