export type AdminModuleKey =
  | 'finance'
  | 'projects'
  | 'hr'
  | 'control-center'
  | 'operations'
  | 'media'
  | 'innovation';

export interface PermissionActionDef {
  key: string;
  label: string;
}

export interface PermissionCategoryDef {
  key: string;
  label: string;
  actions: PermissionActionDef[];
}

export interface PermissionModuleDef {
  key: AdminModuleKey;
  label: string;
  description: string;
  categories: PermissionCategoryDef[];
}

export interface ModulePermissionGrant {
  enabled: boolean;
  subsidiaryScope: 'ALL' | 'SELECTED';
  subsidiaryIds: string[];
  categories: Record<
    string,
    {
      enabled: boolean;
      actions: string[];
    }
  >;
}

export type CustomAdminPermissionsMap = Partial<Record<AdminModuleKey, ModulePermissionGrant>>;

export const ADMIN_PERMISSION_CATALOG: PermissionModuleDef[] = [
  {
    key: 'finance',
    label: 'Financial Management',
    description: 'Treasury, fund requests, approvals, budgets, payroll, and receipt archive.',
    categories: [
      {
        key: 'Overview',
        label: 'Overview',
        actions: [
          { key: 'view_telemetry', label: 'View Group Telemetry & KPIs' },
          { key: 'view_wallet_summary', label: 'View Wallet Funding Summary' },
        ],
      },
      {
        key: 'Executive briefing',
        label: 'Executive Briefing',
        actions: [
          { key: 'view_briefing', label: 'View Daily Executive Briefing' },
          { key: 'export_briefing', label: 'Export CSV / Print Briefing' },
        ],
      },
      {
        key: 'Fund requests',
        label: 'Fund Requests',
        actions: [
          { key: 'view_requests', label: 'View Fund Requests' },
          { key: 'view_dossier', label: 'Inspect Request Dossier & Evidence' },
          { key: 'comment_chat', label: 'Send Request Comments / Chat' },
        ],
      },
      {
        key: 'Approvals & payments',
        label: 'Approvals & Payments',
        actions: [
          { key: 'view_approvals', label: 'View Approvals Desk' },
          { key: 'approve_decline_request', label: 'Approve / Decline / Clarify Requests' },
          { key: 'disburse_monnify', label: 'Initiate Monnify Disbursements' },
          { key: 'emergency_override', label: 'Use Emergency Overrides' },
          { key: 'manage_approval_matrix', label: 'Configure Approval Matrix' },
        ],
      },
      {
        key: 'Budgets & commitments',
        label: 'Budgets & Commitments',
        actions: [
          { key: 'view_budgets', label: 'View Subsidiary Budgets' },
          { key: 'create_edit_budget', label: 'Create / Edit Budget Limits' },
          { key: 'fund_subsidiary_budget', label: 'Fund Subsidiary Budgets' },
        ],
      },
      {
        key: 'Treasury accounts',
        label: 'Treasury Accounts',
        actions: [
          { key: 'view_treasury', label: 'View Treasury Bank Accounts' },
          { key: 'verify_monnify_balance', label: 'Verify Live Monnify Balance' },
          { key: 'manage_bank_accounts', label: 'Add / Edit Company Bank Accounts' },
        ],
      },
      {
        key: 'Wallets & funded budgets',
        label: 'Wallets & Funded Budgets',
        actions: [
          { key: 'view_wallets', label: 'View Staff & Subsidiary Wallets' },
          { key: 'release_wallet_funds', label: 'Release / Fund Staff Wallets' },
        ],
      },
      {
        key: 'Recurring commitments',
        label: 'Recurring Commitments',
        actions: [
          { key: 'view_commitments', label: 'View Recurring Commitments' },
          { key: 'create_pause_commitment', label: 'Create / Pause / Cancel Commitments' },
        ],
      },
      {
        key: 'Hybrid payroll',
        label: 'Hybrid Payroll',
        actions: [
          { key: 'view_payroll', label: 'View Payroll Runs' },
          { key: 'run_calculate_payroll', label: 'Prepare / Calculate Payroll' },
          { key: 'signoff_disburse_payroll', label: 'Sign Off & Disburse Payroll' },
          { key: 'apply_penalty_deduction', label: 'Apply / Waive Penalty Deductions' },
        ],
      },
      {
        key: 'Accounting',
        label: 'Accounting',
        actions: [
          { key: 'view_accounting', label: 'View accounting and financial reports' },
          { key: 'manage_accounting', label: 'Manage accounting records' },
        ],
      },
      {
        key: 'Receipt archive',
        label: 'Receipt Archive',
        actions: [
          { key: 'view_receipts', label: 'View Receipt Archive' },
          { key: 'verify_flag_receipt', label: 'Verify / Flag Receipts' },
          { key: 'export_evidence', label: 'Export Evidence & Audit Pack' },
        ],
      },
    ],
  },
  {
    key: 'projects',
    label: 'Project Management',
    description: 'Programs, sub-projects, staff timelines, Teams chat, credentials vault, and boards.',
    categories: [
      {
        key: 'overview',
        label: 'Overview',
        actions: [
          { key: 'view_overview', label: 'View Project Dashboard' },
          { key: 'pin_widgets', label: 'Pin / Customize Overview Widgets' },
        ],
      },
      {
        key: 'my_work',
        label: 'My Issues / Views / Templates',
        actions: [
          { key: 'view_issues', label: 'View Assigned & Saved Views' },
          { key: 'manage_views_templates', label: 'Create / Edit Views & Templates' },
        ],
      },
      {
        key: 'portfolios',
        label: 'Portfolios & Goals',
        actions: [
          { key: 'view_portfolios', label: 'View Portfolios & OKRs' },
          { key: 'create_edit_okr', label: 'Create / Update Goals & OKRs' },
        ],
      },
      {
        key: 'projects',
        label: 'Projects & Sub-Projects',
        actions: [
          { key: 'view_projects', label: 'View Projects Directory' },
          { key: 'create_edit_project', label: 'Create / Edit Projects' },
          { key: 'create_subproject', label: 'Create Sub-Projects' },
          { key: 'assign_team_lead', label: 'Assign Project Team Lead' },
          { key: 'link_github_repo', label: 'Link GitHub Repository & Branch' },
        ],
      },
      {
        key: 'teams',
        label: 'Teams & Scopes',
        actions: [
          { key: 'view_teams', label: 'View Teams & Scopes' },
          { key: 'manage_team_members', label: 'Add / Remove Team Members' },
        ],
      },
      {
        key: 'staff_timelines',
        label: 'Staff & Timelines',
        actions: [
          { key: 'view_timelines', label: 'View Staff Completion Timelines' },
          { key: 'assign_staff_deadline', label: 'Assign Staff & Set Deadlines' },
          { key: 'flag_payroll_penalty', label: 'Flag SLA Miss for Payroll Penalty' },
        ],
      },
      {
        key: 'handover_vault',
        label: 'Docs, Vault & Media',
        actions: [
          { key: 'view_docs_media', label: 'View Handover Docs & Media Gallery' },
          { key: 'upload_attachments', label: 'Upload Documents & Images' },
          { key: 'view_reveal_credentials', label: 'Reveal Encrypted Vault Credentials' },
          { key: 'add_edit_credentials', label: 'Add / Rotate Credentials' },
          { key: 'manage_handover', label: 'Verify / Complete Staff Handover' },
        ],
      },
      {
        key: 'project_chat',
        label: 'Project Chat (Teams)',
        actions: [
          { key: 'view_chat', label: 'Read Project & Department Chats' },
          { key: 'post_message', label: 'Post Messages & Replies' },
          { key: 'create_dept_channel', label: 'Create Department Chat Groups' },
          { key: 'pin_message', label: 'Pin Announcements / Messages' },
        ],
      },
      {
        key: 'issues',
        label: 'Backlog, Sprints, Board & Roadmap',
        actions: [
          { key: 'view_board', label: 'View Backlog, Board & Roadmap' },
          { key: 'create_edit_issue', label: 'Create / Edit Issues & Blueprints' },
          { key: 'move_stage', label: 'Move Issues Across Stages' },
          { key: 'manage_sprints_milestones', label: 'Manage Sprints & Milestones' },
        ],
      },
      {
        key: 'approvals',
        label: 'Workload, Approvals, Releases & Risks',
        actions: [
          { key: 'rebalance_workload', label: 'Rebalance Team Workload' },
          { key: 'approve_deliverables', label: 'Approve / Reject Deliverables' },
          { key: 'manage_releases_qa', label: 'Manage Releases & QA Matrix' },
          { key: 'manage_risks_loops', label: 'Manage Risks & Column Triggers' },
        ],
      },
      {
        key: 'reports',
        label: 'Ecosystem, Reports & Settings',
        actions: [
          { key: 'view_reports_finance', label: 'View Project Burn & Analytics' },
          { key: 'export_data', label: 'Export Project Reports' },
          { key: 'manage_project_settings', label: 'Edit Project Workspace Settings' },
        ],
      },
    ],
  },
  {
    key: 'hr',
    label: 'Human Resources',
    description: 'Employee directory, attendance, leave, payroll, performance, and HR governance.',
    categories: [
      {
        key: 'overview',
        label: 'Overview',
        actions: [{ key: 'view_hr_overview', label: 'View HR Overview Dashboard' }],
      },
      {
        key: 'employees',
        label: 'Employees',
        actions: [
          { key: 'view_directory', label: 'View Employee Directory' },
          { key: 'edit_employee_profile', label: 'Edit Employee Profiles & Placements' },
          { key: 'manage_staff_app_modules', label: 'Manage Staff App Module Access' },
          { key: 'approve_staff_signup', label: 'Approve Pending Staff Registrations' },
          { key: 'manage_exits', label: 'Process Terminations & Exits' },
        ],
      },
      {
        key: 'id_cards',
        label: 'ID Cards',
        actions: [
          { key: 'view_id_cards', label: 'View Staff ID Cards & QR Codes' },
          { key: 'issue_revoke_id_cards', label: 'Issue, Reissue & Revoke ID Cards' },
          { key: 'print_export_id_cards', label: 'Print & Export CR80 ID Cards' },
        ],
      },
      {
        key: 'attendance',
        label: 'Attendance & Scheduling',
        actions: [
          { key: 'view_attendance', label: 'View Daily Attendance' },
          { key: 'override_attendance', label: 'Override / Exempt Attendance' },
          { key: 'manage_shifts', label: 'Manage Shifts & Schedules' },
        ],
      },
      {
        key: 'leave',
        label: 'Leave Management',
        actions: [
          { key: 'view_leave', label: 'View Leave Requests & Balances' },
          { key: 'approve_reject_leave', label: 'Approve / Reject Leave Requests' },
          { key: 'manage_leave_policies', label: 'Configure Leave Policies' },
        ],
      },
      {
        key: 'payroll',
        label: 'Payroll & Benefits',
        actions: [
          { key: 'view_hr_payroll', label: 'View Compensation & Loans' },
          { key: 'manage_compensation_loans', label: 'Update Salary & Loan Approvals' },
        ],
      },
      {
        key: 'performance',
        label: 'Performance, Recruitment & Relations',
        actions: [
          { key: 'manage_appraisals_pips', label: 'Manage Appraisals & PIPs' },
          { key: 'manage_hiring_training', label: 'Manage Recruitment & Training' },
          { key: 'manage_grievances_discipline', label: 'Handle Grievances & Discipline' },
        ],
      },
      {
        key: 'governance',
        label: 'Requests, Documents, Reports & Config',
        actions: [
          { key: 'approve_hr_requests', label: 'Approve HR Desk Requests' },
          { key: 'manage_contracts_docs', label: 'Manage Contracts & Letters' },
          { key: 'export_hr_reports', label: 'Export HR Analytics Reports' },
          { key: 'manage_hr_config', label: 'Edit HR Policies & Configuration' },
        ],
      },
    ],
  },
  {
    key: 'control-center',
    label: 'Enterprise Control Center',
    description: 'Cross-system governance, admin onboarding, mobile apps, subsidiaries, and audit logs.',
    categories: [
      {
        key: 'overview',
        label: 'Command Overview',
        actions: [{ key: 'view_control_overview', label: 'View Control Center Overview' }],
      },
      {
        key: 'onboarding',
        label: 'Admin Onboarding',
        actions: [
          { key: 'view_admins', label: 'View Leadership & Admin Roster' },
          { key: 'invite_new_admin', label: 'Send Fresh Admin Invitations' },
          { key: 'promote_staff_to_admin', label: 'Promote Existing Staff to Admin' },
          { key: 'manage_staff_app_modules', label: 'Manage Staff App Module Access' },
          { key: 'create_edit_admin_profiles', label: 'Create / Edit Custom Admin Profiles' },
          { key: 'suspend_activate_admin', label: 'Suspend / Activate Admin Accounts' },
        ],
      },
      {
        key: 'mobile_apps',
        label: 'Mobile Apps',
        actions: [
          { key: 'view_mobile_releases', label: 'View Mobile App Releases & Gates' },
          { key: 'upload_apk_update_gates', label: 'Upload APK & Update Version Gates' },
        ],
      },
      {
        key: 'org_structure',
        label: 'Subsidiaries & Depts',
        actions: [
          { key: 'view_orgs_depts', label: 'View Subsidiaries & Departments' },
          { key: 'create_edit_subsidiary', label: 'Create / Edit Subsidiaries' },
          { key: 'create_department', label: 'Create Shared Departments' },
        ],
      },
      {
        key: 'audit_trail',
        label: 'System Audit Log',
        actions: [
          { key: 'view_audit_logs', label: 'View System Audit Trail' },
          { key: 'export_audit_logs', label: 'Export Audit Records' },
        ],
      },
    ],
  },
  {
    key: 'operations',
    label: 'Operations Management',
    description: 'Operations Command Centre, sites, service catalogue, work orders, dispatch, and approvals.',
    categories: [
      {
        key: 'operations_core',
        label: 'Operations Core & Command Centre',
        actions: [
          { key: 'view_module', label: 'View Operations Module' },
          { key: 'manage_records', label: 'Create / Update Field & Fleet Records' },
          { key: 'approve_workflows', label: 'Approve Operations Workflows' },
        ],
      },
      {
        key: 'operations_work_orders',
        label: 'Work Orders & Dispatch',
        actions: [
          { key: 'view_work_orders', label: 'View Work Orders & Service Requests' },
          { key: 'create_work_orders', label: 'Create & Update Work Orders' },
          { key: 'assign_dispatch', label: 'Schedule & Reassign Dispatch' },
          { key: 'verify_close', label: 'Verify & Close Completed Work' },
        ],
      },
      {
        key: 'operations_setup',
        label: 'Sites & Service Catalogue',
        actions: [
          { key: 'view_sites_services', label: 'View Sites & Service Definitions' },
          { key: 'manage_sites_services', label: 'Create & Edit Sites & Services' },
        ],
      },
    ],
  },
  {
    key: 'media',
    label: 'Media Management',
    description: 'Media production workflows, studio scheduling, and digital archives.',
    categories: [
      {
        key: 'media_core',
        label: 'Media Core',
        actions: [
          { key: 'view_module', label: 'View Media Module' },
          { key: 'manage_records', label: 'Manage Studio & Production Assets' },
          { key: 'approve_workflows', label: 'Approve Media Deliverables' },
        ],
      },
    ],
  },
  {
    key: 'innovation',
    label: 'Innovation Management',
    description: 'Proprietary software technologies, platforms, and technology R&D.',
    categories: [
      {
        key: 'innovation_core',
        label: 'Innovation Core',
        actions: [
          { key: 'view_module', label: 'View Innovation Module' },
          { key: 'manage_records', label: 'Manage R&D & Platform Records' },
          { key: 'approve_workflows', label: 'Approve Innovation Releases' },
        ],
      },
    ],
  },
];

export function createEmptyPermissionsMap(): CustomAdminPermissionsMap {
  return {};
}

export function parsePermissionsJson(raw?: string | null): CustomAdminPermissionsMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function hasModuleAccess(
  role: string,
  permissions: CustomAdminPermissionsMap | null | undefined,
  moduleKey: AdminModuleKey
): boolean {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'GMD') return true;
  if (normalized === 'CUSTOM_ADMIN') {
    if (!permissions || Object.keys(permissions).length === 0) return false;
    return Boolean(permissions[moduleKey]?.enabled);
  }
  if (!['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(normalized)) return false;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  return Boolean(permissions[moduleKey]?.enabled);
}

export function hasCategoryAccess(
  role: string,
  permissions: CustomAdminPermissionsMap | null | undefined,
  moduleKey: AdminModuleKey,
  categoryKey: string
): boolean {
  if (!hasModuleAccess(role, permissions, moduleKey)) return false;
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'GMD') return true;
  if (normalized === 'CUSTOM_ADMIN') {
    if (!permissions || Object.keys(permissions).length === 0) return false;
  } else if (!permissions || Object.keys(permissions).length === 0) {
    return true;
  }
  const grant = permissions?.[moduleKey];
  if (!grant?.enabled) return false;
  return Boolean(grant.categories?.[categoryKey]?.enabled);
}

export function hasActionPermission(
  role: string,
  permissions: CustomAdminPermissionsMap | null | undefined,
  moduleKey: AdminModuleKey,
  categoryKey: string,
  actionKey: string
): boolean {
  if (!hasCategoryAccess(role, permissions, moduleKey, categoryKey)) return false;
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'GMD') return true;
  if (normalized === 'CUSTOM_ADMIN') {
    if (!permissions || Object.keys(permissions).length === 0) return false;
  } else if (!permissions || Object.keys(permissions).length === 0) {
    return true;
  }
  const actions = permissions?.[moduleKey]?.categories?.[categoryKey]?.actions || [];
  return actions.includes(actionKey);
}

export function getAllowedSubsidiariesForModule(
  role: string,
  permissions: CustomAdminPermissionsMap | null | undefined,
  moduleKey: AdminModuleKey
): 'ALL' | string[] {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'GMD') {
    return 'ALL';
  }
  if (normalized !== 'CUSTOM_ADMIN' && (!permissions || Object.keys(permissions).length === 0)) {
    return 'ALL';
  }
  const grant = permissions?.[moduleKey];
  if (!grant?.enabled) return [];
  if (grant.subsidiaryScope === 'ALL') return 'ALL';
  return grant.subsidiaryIds || [];
}

/**
 * Returns true if an action key is strictly read-only (non-mutating, non-secret-revealing).
 */
export function isReadOnlyActionKey(actionKey: string): boolean {
  const normalized = String(actionKey || '').trim().toLowerCase();
  return normalized === 'view' || (normalized.startsWith('view_') && normalized !== 'view_reveal_credentials');
}

/**
 * Returns true when an account is a CUSTOM_ADMIN with zero mutating action grants
 * (i.e. all granted actions across enabled modules/categories are strictly read-only).
 */
export function isReadOnlyCustomAdmin(
  role: string | null | undefined,
  permissions: CustomAdminPermissionsMap | null | undefined
): boolean {
  const normalized = String(role || '').toUpperCase();
  if (normalized !== 'CUSTOM_ADMIN') return false;
  if (!permissions || Object.keys(permissions).length === 0) return true;

  for (const modGrant of Object.values(permissions)) {
    if (!modGrant?.enabled || !modGrant.categories) continue;
    for (const catGrant of Object.values(modGrant.categories)) {
      if (!catGrant?.enabled) continue;
      const actions = Array.isArray(catGrant.actions) ? catGrant.actions : [];
      for (const action of actions) {
        if (!isReadOnlyActionKey(action)) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Preset permission map for external compliance / payment partner reviewers (e.g. Monnify).
 * Grants strictly view-only access to Finance, Treasury, Wallets, Accounting, Receipts, and Audit Trail.
 */
export function createMonnifyComplianceReadOnlyPermissions(): CustomAdminPermissionsMap {
  return {
    finance: {
      enabled: true,
      subsidiaryScope: 'ALL',
      subsidiaryIds: [],
      categories: {
        Overview: { enabled: true, actions: ['view_telemetry', 'view_wallet_summary'] },
        'Executive briefing': { enabled: true, actions: ['view_briefing'] },
        'Fund requests': { enabled: true, actions: ['view_requests', 'view_dossier'] },
        'Approvals & payments': { enabled: true, actions: ['view_approvals'] },
        'Budgets & commitments': { enabled: true, actions: ['view_budgets'] },
        'Treasury accounts': { enabled: true, actions: ['view_treasury'] },
        'Wallets & funded budgets': { enabled: true, actions: ['view_wallets'] },
        'Recurring commitments': { enabled: true, actions: ['view_commitments'] },
        Accounting: { enabled: true, actions: ['view_accounting'] },
        'Receipt archive': { enabled: true, actions: ['view_receipts'] },
      },
    },
    'control-center': {
      enabled: true,
      subsidiaryScope: 'ALL',
      subsidiaryIds: [],
      categories: {
        overview: { enabled: true, actions: ['view_control_overview'] },
        org_structure: { enabled: true, actions: ['view_orgs_depts'] },
        audit_trail: { enabled: true, actions: ['view_audit_logs'] },
      },
    },
  };
}

