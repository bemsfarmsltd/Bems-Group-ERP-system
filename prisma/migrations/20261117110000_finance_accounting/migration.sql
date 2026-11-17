CREATE TABLE "FinanceAccount" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  "cash" BOOLEAN NOT NULL DEFAULT false CHECK (NOT "cash" OR "kind"='ASSET'),
  UNIQUE ("organizationId","code"), UNIQUE ("organizationId","id")
);
CREATE TABLE "FinanceJournal" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "date" DATE NOT NULL, "memo" TEXT NOT NULL, "source" TEXT NOT NULL, "reference" TEXT NOT NULL,
  "groupOnly" BOOLEAN NOT NULL DEFAULT false,
  "actorId" TEXT NOT NULL REFERENCES "Employee"("id"), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "postingTx" BIGINT NOT NULL DEFAULT txid_current(),
  UNIQUE ("organizationId","source","reference"), UNIQUE ("organizationId","id")
);
CREATE INDEX ON "FinanceJournal" ("organizationId","date");
CREATE TABLE "FinanceJournalLine" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "journalId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor"<>0),
  "departmentId" TEXT REFERENCES "Department"("id"), "projectId" TEXT REFERENCES "Project"("id"),
  FOREIGN KEY ("organizationId","journalId") REFERENCES "FinanceJournal"("organizationId","id"),
  FOREIGN KEY ("organizationId","accountId") REFERENCES "FinanceAccount"("organizationId","id")
);
CREATE INDEX ON "FinanceJournalLine" ("journalId");
CREATE INDEX ON "FinanceJournalLine" ("accountId");
CREATE FUNCTION finance_check_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id TEXT;
BEGIN
  IF TG_TABLE_NAME='FinanceJournal' THEN journal_id:=NEW."id"; ELSE journal_id:=NEW."journalId"; END IF;
  IF (SELECT count(*) < 2 OR COALESCE(sum("amountMinor"),0)<>0 FROM "FinanceJournalLine" WHERE "journalId"=journal_id)
    THEN RAISE EXCEPTION 'Finance journal must balance'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_header_balanced AFTER INSERT ON "FinanceJournal"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_check_journal();
CREATE CONSTRAINT TRIGGER finance_lines_balanced AFTER INSERT ON "FinanceJournalLine"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_check_journal();
CREATE TRIGGER finance_header_immutable BEFORE UPDATE OR DELETE ON "FinanceJournal" FOR EACH ROW EXECUTE FUNCTION bems_wallet_immutable();
CREATE TRIGGER finance_lines_immutable BEFORE UPDATE OR DELETE ON "FinanceJournalLine" FOR EACH ROW EXECUTE FUNCTION bems_wallet_immutable();
CREATE FUNCTION finance_same_posting_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FinanceJournal" WHERE "id"=NEW."journalId" AND "postingTx"=txid_current())
    THEN RAISE EXCEPTION 'Cannot append lines to a posted journal'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_line_posting BEFORE INSERT ON "FinanceJournalLine" FOR EACH ROW EXECUTE FUNCTION finance_same_posting_transaction();
CREATE TABLE "FinanceOpenItem" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PAYABLE','RECEIVABLE')),
  "party" TEXT NOT NULL, "reference" TEXT NOT NULL, "issuedOn" DATE NOT NULL, "dueOn" DATE NOT NULL CHECK ("dueOn">="issuedOn"),
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor">0),
  "remainingMinor" BIGINT NOT NULL CHECK ("remainingMinor" BETWEEN 0 AND "amountMinor"),
  "controlAccountId" TEXT NOT NULL, "journalId" TEXT NOT NULL UNIQUE, "vendorInvoiceId" TEXT UNIQUE REFERENCES "VendorInvoice"("id"),
  FOREIGN KEY ("organizationId","controlAccountId") REFERENCES "FinanceAccount"("organizationId","id"),
  FOREIGN KEY ("organizationId","journalId") REFERENCES "FinanceJournal"("organizationId","id"),
  UNIQUE ("organizationId","kind","party","reference")
);
CREATE TABLE "FinanceStatementLine" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "date" DATE NOT NULL, "reference" TEXT NOT NULL, "memo" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor"<>0),
  "matchedLineId" TEXT UNIQUE REFERENCES "FinanceJournalLine"("id"), "matchedAt" TIMESTAMPTZ,
  FOREIGN KEY ("organizationId","accountId") REFERENCES "FinanceAccount"("organizationId","id"),
  UNIQUE ("accountId","reference")
);
CREATE TABLE "FinancePeriodClose" (
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"), "month" DATE NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "Employee"("id"), "note" TEXT NOT NULL, "closedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId","month")
);
CREATE TABLE "FinanceCashPlan" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "date" DATE NOT NULL, "label" TEXT NOT NULL, "reference" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor"<>0), "active" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE ("organizationId","reference")
);
CREATE TABLE "FinanceAsset" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "tag" TEXT NOT NULL, "name" TEXT NOT NULL, "location" TEXT NOT NULL, "acquiredOn" DATE NOT NULL,
  "costMinor" BIGINT NOT NULL CHECK ("costMinor">0), "residualMinor" BIGINT NOT NULL CHECK ("residualMinor" BETWEEN 0 AND "costMinor"),
  "months" INTEGER NOT NULL CHECK ("months" BETWEEN 1 AND 600), "postedMonths" INTEGER NOT NULL DEFAULT 0 CHECK ("postedMonths" BETWEEN 0 AND "months"),
  "depreciationMinor" BIGINT NOT NULL DEFAULT 0 CHECK ("depreciationMinor" BETWEEN 0 AND "costMinor"-"residualMinor"),
  "assetAccountId" TEXT NOT NULL, "depreciationAccountId" TEXT NOT NULL, "expenseAccountId" TEXT NOT NULL,
  "disposedOn" DATE, UNIQUE ("organizationId","tag"),
  FOREIGN KEY ("organizationId","assetAccountId") REFERENCES "FinanceAccount"("organizationId","id"),
  FOREIGN KEY ("organizationId","depreciationAccountId") REFERENCES "FinanceAccount"("organizationId","id"),
  FOREIGN KEY ("organizationId","expenseAccountId") REFERENCES "FinanceAccount"("organizationId","id")
);
