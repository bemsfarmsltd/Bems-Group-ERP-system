ALTER TABLE "WalletReleaseProposal"
  DROP CONSTRAINT "WalletReleaseProposal_sourceType_check",
  ADD CONSTRAINT "WalletReleaseProposal_sourceType_check"
    CHECK ("sourceType" IN ('REQUEST', 'REQUEST_BATCH', 'PAYROLL_BATCH'));
