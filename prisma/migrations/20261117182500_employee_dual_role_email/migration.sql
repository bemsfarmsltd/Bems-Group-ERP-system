-- DropIndex
DROP INDEX IF EXISTS "Employee_workEmail_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_workEmail_idx" ON "Employee"("workEmail");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_workEmail_role_key" ON "Employee"("workEmail", "role");
