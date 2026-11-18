CREATE TABLE IF NOT EXISTS "OpsSopDocument" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "serviceId" TEXT,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0',
  "content" TEXT NOT NULL,
  "checklistTemplateJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsSopDocument_organizationId_status_idx" ON "OpsSopDocument" ("organizationId", "status");

CREATE TABLE IF NOT EXISTS "OpsInspection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "workOrderId" TEXT,
  "sopId" TEXT,
  "inspectorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "checklistResultsJson" TEXT,
  "scorePct" INTEGER NOT NULL DEFAULT 100,
  "outcome" TEXT NOT NULL DEFAULT 'PASS',
  "notes" TEXT,
  "inspectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsInspection_organizationId_outcome_idx" ON "OpsInspection" ("organizationId", "outcome");
CREATE INDEX IF NOT EXISTS "OpsInspection_siteId_idx" ON "OpsInspection" ("siteId");

CREATE TABLE IF NOT EXISTS "OpsIncident" (
  "id" TEXT PRIMARY KEY,
  "incidentNumber" TEXT NOT NULL UNIQUE,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "workOrderId" TEXT,
  "reporterId" TEXT NOT NULL,
  "ownerId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "category" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "OpsIncident_organizationId_status_severity_idx" ON "OpsIncident" ("organizationId", "status", "severity");
CREATE INDEX IF NOT EXISTS "OpsIncident_siteId_idx" ON "OpsIncident" ("siteId");

CREATE TABLE IF NOT EXISTS "OpsAsset" (
  "id" TEXT PRIMARY KEY,
  "assetTag" TEXT NOT NULL UNIQUE,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'EQUIPMENT',
  "serialNumber" TEXT,
  "custodianId" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "lastServiceAt" TIMESTAMPTZ,
  "nextServiceDueAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsAsset_organizationId_status_idx" ON "OpsAsset" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "OpsAsset_custodianId_idx" ON "OpsAsset" ("custodianId");

CREATE TABLE IF NOT EXISTS "OpsShiftHandover" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "shiftLabel" TEXT NOT NULL,
  "outgoingOfficerId" TEXT NOT NULL,
  "incomingOfficerId" TEXT,
  "openItemsSummary" TEXT NOT NULL,
  "incidentsSummary" TEXT,
  "criticalRisks" TEXT,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsShiftHandover_organizationId_createdAt_idx" ON "OpsShiftHandover" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OpsShiftHandover_incomingOfficerId_idx" ON "OpsShiftHandover" ("incomingOfficerId");

CREATE TABLE IF NOT EXISTS "OpsStockItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "sku" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'PCS',
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsStockItem_organizationId_siteId_idx" ON "OpsStockItem" ("organizationId", "siteId");

CREATE TABLE IF NOT EXISTS "OpsStockMovement" (
  "id" TEXT PRIMARY KEY,
  "stockItemId" TEXT NOT NULL REFERENCES "OpsStockItem"("id") ON DELETE CASCADE,
  "movementType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "workOrderId" TEXT,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsStockMovement_stockItemId_createdAt_idx" ON "OpsStockMovement" ("stockItemId", "createdAt");

CREATE TABLE IF NOT EXISTS "OpsFleetVehicle" (
  "id" TEXT PRIMARY KEY,
  "plateNumber" TEXT NOT NULL UNIQUE,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "model" TEXT NOT NULL,
  "driverId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "odometerKm" INTEGER NOT NULL DEFAULT 0,
  "nextServiceDueAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsFleetVehicle_organizationId_status_idx" ON "OpsFleetVehicle" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "OpsFleetVehicle_driverId_idx" ON "OpsFleetVehicle" ("driverId");

CREATE TABLE IF NOT EXISTS "OpsFleetLog" (
  "id" TEXT PRIMARY KEY,
  "vehicleId" TEXT NOT NULL REFERENCES "OpsFleetVehicle"("id") ON DELETE CASCADE,
  "workOrderId" TEXT,
  "driverId" TEXT NOT NULL,
  "tripPurpose" TEXT NOT NULL,
  "startKm" INTEGER NOT NULL DEFAULT 0,
  "endKm" INTEGER,
  "fuelCostMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsFleetLog_vehicleId_createdAt_idx" ON "OpsFleetLog" ("vehicleId", "createdAt");

CREATE TABLE IF NOT EXISTS "OpsReconciliationRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "verifiedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsReconciliationRun_organizationId_status_idx" ON "OpsReconciliationRun" ("organizationId", "status");

CREATE TABLE IF NOT EXISTS "OpsReconciliationException" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "OpsReconciliationRun"("id") ON DELETE CASCADE,
  "exceptionType" TEXT NOT NULL,
  "referenceCode" TEXT NOT NULL,
  "ownerId" TEXT,
  "resolutionNote" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsReconciliationException_runId_status_idx" ON "OpsReconciliationException" ("runId", "status");

CREATE TABLE IF NOT EXISTS "OpsAutomationRule" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "triggerEvent" TEXT NOT NULL,
  "conditionJson" TEXT,
  "actionType" TEXT NOT NULL,
  "targetRoleOrId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OpsAutomationRule_organizationId_isActive_idx" ON "OpsAutomationRule" ("organizationId", "isActive");
