BEGIN;

-- Keep the duplicate checks and alias rewrite in the same transaction.
LOCK TABLE "Employee" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF (SELECT count(*) FROM "Employee"
      WHERE "role" IN ('SYSTEM_ADMIN', 'SUPER_ADMIN')
        AND "status" = 'ACTIVE' AND "approvalStatus" = 'APPROVED') > 1 THEN
    RAISE EXCEPTION 'Review the existing active System Admin accounts before enforcing the single seat.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Employee"
      WHERE "role" IN ('SYSTEM_ADMIN', 'SUPER_ADMIN')
      GROUP BY lower("workEmail") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Review duplicate System Admin email records before normalizing the role alias.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Employee_single_active_system_admin"
ON "Employee" ((1))
WHERE "role" IN ('SYSTEM_ADMIN', 'SUPER_ADMIN')
  AND "status" = 'ACTIVE' AND "approvalStatus" = 'APPROVED';

UPDATE "Employee" SET "role" = 'SYSTEM_ADMIN' WHERE "role" = 'SUPER_ADMIN';
UPDATE "AdminInvitation" SET "role" = 'SYSTEM_ADMIN' WHERE "role" = 'SUPER_ADMIN';

COMMIT;
