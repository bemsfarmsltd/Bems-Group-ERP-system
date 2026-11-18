import { prisma } from '@/lib/prisma';

let opsSchemaEnsured = false;

export async function ensureOperationsSchema(): Promise<void> {
  if (opsSchemaEnsured) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS "OpsSite" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "departmentId" TEXT,
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "siteType" TEXT NOT NULL DEFAULT 'OFFICE',
      "stateRegion" TEXT,
      "address" TEXT,
      "timeZone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
      "operatingHoursJson" TEXT,
      "contactName" TEXT,
      "contactPhone" TEXT,
      "supervisorId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsSite_organizationId_status_idx" ON "OpsSite" ("organizationId", "status")`,
    `CREATE INDEX IF NOT EXISTS "OpsSite_supervisorId_idx" ON "OpsSite" ("supervisorId")`,
    `CREATE TABLE IF NOT EXISTS "OpsServiceDefinition" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "departmentId" TEXT,
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'FIELD_SERVICE',
      "description" TEXT,
      "ownerId" TEXT,
      "slaAcknowledgeMins" INTEGER NOT NULL DEFAULT 60,
      "slaResolveHours" INTEGER NOT NULL DEFAULT 24,
      "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
      "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
      "isClientFacing" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsServiceDefinition_organizationId_status_idx" ON "OpsServiceDefinition" ("organizationId", "status")`,
    `CREATE TABLE IF NOT EXISTS "OpsWorkOrder" (
      "id" TEXT PRIMARY KEY,
      "workOrderNumber" TEXT NOT NULL UNIQUE,
      "organizationId" TEXT NOT NULL,
      "siteId" TEXT REFERENCES "OpsSite"("id") ON DELETE SET NULL,
      "serviceId" TEXT REFERENCES "OpsServiceDefinition"("id") ON DELETE SET NULL,
      "departmentId" TEXT,
      "parentWorkOrderId" TEXT REFERENCES "OpsWorkOrder"("id") ON DELETE SET NULL,
      "sourceType" TEXT NOT NULL DEFAULT 'INTERNAL',
      "title" TEXT NOT NULL,
      "description" TEXT,
      "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
      "status" TEXT NOT NULL DEFAULT 'NEW',
      "blockedReason" TEXT,
      "requesterId" TEXT NOT NULL,
      "ownerId" TEXT,
      "assigneeId" TEXT,
      "supervisorId" TEXT,
      "approverId" TEXT,
      "dueAt" TIMESTAMPTZ,
      "acknowledgedAt" TIMESTAMPTZ,
      "startedAt" TIMESTAMPTZ,
      "completedAt" TIMESTAMPTZ,
      "verifiedAt" TIMESTAMPTZ,
      "closedAt" TIMESTAMPTZ,
      "checklistJson" TEXT,
      "evidenceUrlsJson" TEXT,
      "linkedRequestId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkOrder_organizationId_status_idx" ON "OpsWorkOrder" ("organizationId", "status")`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkOrder_assigneeId_status_idx" ON "OpsWorkOrder" ("assigneeId", "status")`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkOrder_requesterId_idx" ON "OpsWorkOrder" ("requesterId")`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkOrder_siteId_idx" ON "OpsWorkOrder" ("siteId")`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkOrder_dueAt_idx" ON "OpsWorkOrder" ("dueAt")`,
    `CREATE TABLE IF NOT EXISTS "OpsDispatchAssignment" (
      "id" TEXT PRIMARY KEY,
      "workOrderId" TEXT NOT NULL REFERENCES "OpsWorkOrder"("id") ON DELETE CASCADE,
      "organizationId" TEXT NOT NULL,
      "siteId" TEXT REFERENCES "OpsSite"("id") ON DELETE SET NULL,
      "assigneeId" TEXT NOT NULL,
      "dispatcherId" TEXT NOT NULL,
      "plannedDate" TIMESTAMPTZ NOT NULL,
      "windowStart" TEXT,
      "windowEnd" TEXT,
      "dispatchStatus" TEXT NOT NULL DEFAULT 'ASSIGNED',
      "notes" TEXT,
      "reassignedFromId" TEXT,
      "reassignReason" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsDispatchAssignment_organizationId_plannedDate_idx" ON "OpsDispatchAssignment" ("organizationId", "plannedDate")`,
    `CREATE INDEX IF NOT EXISTS "OpsDispatchAssignment_assigneeId_dispatchStatus_idx" ON "OpsDispatchAssignment" ("assigneeId", "dispatchStatus")`,
    `CREATE INDEX IF NOT EXISTS "OpsDispatchAssignment_workOrderId_idx" ON "OpsDispatchAssignment" ("workOrderId")`,
    `CREATE TABLE IF NOT EXISTS "OpsWorkLog" (
      "id" TEXT PRIMARY KEY,
      "workOrderId" TEXT NOT NULL REFERENCES "OpsWorkOrder"("id") ON DELETE CASCADE,
      "actorId" TEXT NOT NULL,
      "entryType" TEXT NOT NULL DEFAULT 'COMMENT',
      "fromStatus" TEXT,
      "toStatus" TEXT,
      "message" TEXT NOT NULL,
      "attachmentsJson" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsWorkLog_workOrderId_createdAt_idx" ON "OpsWorkLog" ("workOrderId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "OpsApprovalDecision" (
      "id" TEXT PRIMARY KEY,
      "workOrderId" TEXT NOT NULL REFERENCES "OpsWorkOrder"("id") ON DELETE CASCADE,
      "organizationId" TEXT NOT NULL,
      "initiatorId" TEXT NOT NULL,
      "approverId" TEXT,
      "decision" TEXT NOT NULL DEFAULT 'PENDING',
      "reason" TEXT,
      "decidedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "OpsApprovalDecision_organizationId_decision_idx" ON "OpsApprovalDecision" ("organizationId", "decision")`,
    `CREATE INDEX IF NOT EXISTS "OpsApprovalDecision_workOrderId_idx" ON "OpsApprovalDecision" ("workOrderId")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  opsSchemaEnsured = true;
}
