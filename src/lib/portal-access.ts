export function isStaffAccount(role: string) {
  return role === 'STAFF' || role === 'CUSTOM_ADMIN';
}

/** Approved staff keep their own portal access during leave; suspension/termination always deny access. */
export function canAccessEmployeePortal(employee: { role: string; status: string; approvalStatus: string }) {
  return employee.approvalStatus === 'APPROVED' && ['STAFF', 'GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN'].includes(employee.role) &&
    (employee.status === 'ACTIVE' || (isStaffAccount(employee.role) && employee.status === 'ON_LEAVE'));
}
