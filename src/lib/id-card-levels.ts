export type IdCardLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type IdCardTierCompat = 'EXECUTIVE' | 'ADMIN_STAFF' | 'STAFF';

export interface IdCardLevelSpec {
  level: IdCardLevel;
  code: `L${IdCardLevel}`;
  name: string;
  shortTitle: string;
  clearanceLabel: string;
  facilityScope: string;
  systemScope: string;
  badgeCls: string;
  accentDefault: string;
  secondaryDefault: string;
  tierCompat: IdCardTierCompat;
}

export const ID_CARD_LEVELS: Record<IdCardLevel, IdCardLevelSpec> = {
  1: {
    level: 1,
    code: 'L1',
    name: 'Intern / NYSC / Trainee',
    shortTitle: 'Trainee Pass',
    clearanceLabel: 'L1 · CAMPUS & SUPERVISED',
    facilityScope: 'Assigned Training & Workspace Zones',
    systemScope: 'Standard Portal (Supervised)',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accentDefault: '#0f766e',
    secondaryDefault: '#14b8a6',
    tierCompat: 'STAFF',
  },
  2: {
    level: 2,
    code: 'L2',
    name: 'Field, Fleet & Facility Support',
    shortTitle: 'Facility & Field',
    clearanceLabel: 'L2 · FACILITY & STATION ACCESS',
    facilityScope: 'Operations Sites, Fleet & Attendance Stations',
    systemScope: 'Kiosk & Attendance Check-In',
    badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
    accentDefault: '#d97706',
    secondaryDefault: '#475569',
    tierCompat: 'STAFF',
  },
  3: {
    level: 3,
    code: 'L3',
    name: 'Associate & Studio Crew',
    shortTitle: 'Associate Pass',
    clearanceLabel: 'L3 · STANDARD SUBSIDIARY ZONE',
    facilityScope: 'Subsidiary Offices & Production Studios',
    systemScope: 'Staff Self-Service & Tasks',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    accentDefault: '#0284c7',
    secondaryDefault: '#0ea5e9',
    tierCompat: 'STAFF',
  },
  4: {
    level: 4,
    code: 'L4',
    name: 'Specialist / Officer',
    shortTitle: 'Specialist Pass',
    clearanceLabel: 'L4 · DEPARTMENTAL OPERATIONS',
    facilityScope: 'Subsidiary Departments & Shared Floors',
    systemScope: 'Departmental Workflows & Finance Requests',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    accentDefault: '#2563eb',
    secondaryDefault: '#4f46e5',
    tierCompat: 'STAFF',
  },
  5: {
    level: 5,
    code: 'L5',
    name: 'Engineering, Product & Tech Specialist',
    shortTitle: 'Tech & Dev (ENG)',
    clearanceLabel: 'L5 · DEV / STAGING & TECH LAB',
    facilityScope: 'Engineering Labs, Server Racks (L2) & R&D',
    systemScope: 'Git, Staging Environments & API Tooling',
    badgeCls: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    accentDefault: '#0891b2',
    secondaryDefault: '#1e293b',
    tierCompat: 'STAFF',
  },
  6: {
    level: 6,
    code: 'L6',
    name: 'Team Lead / Senior Tech & Ops Lead',
    shortTitle: 'Squad Lead',
    clearanceLabel: 'L6 · SQUAD LEAD & PROD SYSTEMS',
    facilityScope: 'Production Labs, Studio Control & Branch Ops',
    systemScope: 'Project Sign-Off & Production Monitoring',
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    accentDefault: '#4338ca',
    secondaryDefault: '#64748b',
    tierCompat: 'STAFF',
  },
  7: {
    level: 7,
    code: 'L7',
    name: 'Department Head (HOD) / Manager',
    shortTitle: 'HOD / Manager',
    clearanceLabel: 'L7 · DEPARTMENT COMMAND',
    facilityScope: 'All Subsidiary Zones & Management Suites',
    systemScope: 'Departmental Approvals & Budget Oversight',
    badgeCls: 'bg-violet-50 text-violet-700 border-violet-200',
    accentDefault: '#6d28d9',
    secondaryDefault: '#0f172a',
    tierCompat: 'STAFF',
  },
  8: {
    level: 8,
    code: 'L8',
    name: 'Privileged Admin / Systems Controller',
    shortTitle: 'System Admin',
    clearanceLabel: 'L8 · PRIVILEGED ERP ADMIN',
    facilityScope: 'Restricted Admin Wing & NOC Operations',
    systemScope: 'Scoped ERP Admin Console & Audit Gates',
    badgeCls: 'bg-rose-50 text-rose-700 border-rose-200',
    accentDefault: '#be123c',
    secondaryDefault: '#334155',
    tierCompat: 'ADMIN_STAFF',
  },
  9: {
    level: 9,
    code: 'L9',
    name: 'C-Suite / Subsidiary Executive & Super Admin',
    shortTitle: 'Executive / DC',
    clearanceLabel: 'L9 · EXECUTIVE & DATA CENTER',
    facilityScope: 'Executive Suites, Treasury Vault & Data Center',
    systemScope: 'Multi-Subsidiary Control Center & Governance',
    badgeCls: 'bg-slate-100 text-slate-900 border-slate-300',
    accentDefault: '#0f172a',
    secondaryDefault: '#b45309',
    tierCompat: 'EXECUTIVE',
  },
  10: {
    level: 10,
    code: 'L10',
    name: 'Group Managing Director (Sovereign Master)',
    shortTitle: 'GMD Sovereign',
    clearanceLabel: 'L10 · SOVEREIGN ALL-GROUP MASTER',
    facilityScope: 'Unrestricted All-Group Facilities & Data Centers',
    systemScope: 'Sovereign Treasury, AI & Master Override',
    badgeCls: 'bg-amber-100 text-amber-900 border-amber-300',
    accentDefault: '#b45309',
    secondaryDefault: '#0f172a',
    tierCompat: 'EXECUTIVE',
  },
};

export const ID_CARD_LEVEL_LIST: IdCardLevelSpec[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
  (n) => ID_CARD_LEVELS[n as IdCardLevel]
);

export function clampIdCardLevel(input: unknown): IdCardLevel {
  const num = Number(input);
  if (Number.isInteger(num) && num >= 1 && num <= 10) {
    return num as IdCardLevel;
  }
  return 4;
}

export function levelToTierCompat(level: IdCardLevel): IdCardTierCompat {
  return ID_CARD_LEVELS[level].tierCompat;
}

export function resolveDefaultCardLevel(emp: {
  role?: string | null;
  staffGrade?: string | null;
  jobTitle?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  customAdminProfileId?: string | null;
  customAdminTitle?: string | null;
}): IdCardLevel {
  const role = String(emp.role || '').toUpperCase();
  const grade = String(emp.staffGrade || '').toLowerCase();
  const title = String(emp.jobTitle || '').toLowerCase();
  const dept = String(emp.departmentName || '').toLowerCase();
  const empType = String(emp.employmentType || '').toUpperCase();

  // L10: Group Managing Director
  if (role === 'GMD' || title.includes('group managing director')) {
    return 10;
  }

  // L9: C-Suite / Super Admin / COO / Subsidiary Executive Director
  if (
    role === 'SUPER_ADMIN' ||
    grade.includes('level 8') ||
    grade.includes('c-suite') ||
    grade.includes('executive director') ||
    title.includes('chief operating officer') ||
    title.includes('managing director') ||
    title.includes('projects director')
  ) {
    return 9;
  }

  // L8: Privileged System Admin / Delegated Admin Profile
  if (role === 'SYSTEM_ADMIN' || Boolean(emp.customAdminProfileId) || Boolean(emp.customAdminTitle)) {
    return 8;
  }

  // L7: Department Head (HOD) / Manager
  if (
    grade.includes('level 7') ||
    grade.includes('level 12') ||
    grade.includes('head of department') ||
    title.includes('hod') ||
    title.includes('operations manager') ||
    title.includes('senior manager') ||
    title.includes('managerial')
  ) {
    return 7;
  }

  // L6: Team Lead / Supervisor / Lead Engineer / Studio Manager
  if (
    grade.includes('level 6') ||
    grade.includes('level 10') ||
    grade.includes('team lead') ||
    grade.includes('supervisor') ||
    title.includes('lead') ||
    title.includes('chief product') ||
    title.includes('studio manager') ||
    title.includes('assistant office manager')
  ) {
    return 6;
  }

  // L2 explicit field/fleet/facility roles take precedence over department tech heuristic
  const isExplicitFieldRole =
    title.includes('driver') ||
    title.includes('cleaner') ||
    title.includes('security') ||
    title.includes('janitor');

  // L5: Engineering, Product & Tech Specialists (Developers, Designers, Data/AI)
  const isTechTrack =
    !isExplicitFieldRole &&
    (dept.includes('software') ||
      dept.includes('engineering') ||
      dept.includes('product & creative') ||
      dept.includes('data / ai') ||
      title.includes('developer') ||
      title.includes('engineer') ||
      title.includes('ui/ux') ||
      title.includes('data analyst') ||
      title.includes('ai automation'));

  if (isTechTrack || grade.includes('level 5') || grade.includes('level 08') || grade.includes('senior_officer')) {
    return 5;
  }

  // L4: Mid-Level Specialist / Officer
  if (
    grade.includes('level 4') ||
    grade.includes('level 06') ||
    grade === 'officer' ||
    grade === 'general staff' ||
    title.includes('administrative officer') ||
    title.includes('graphic designer') ||
    title.includes('media and content')
  ) {
    return 4;
  }

  // L3: Junior Staff / Associate / Studio Crew
  if (
    grade.includes('level 3') ||
    grade.includes('level 05') ||
    grade.includes('junior') ||
    title.includes('studio operation') ||
    title.includes('sales representative') ||
    title.includes('reporter') ||
    title.includes('support')
  ) {
    return 3;
  }

  // L2: Field, Fleet & Facility Support
  if (
    grade.includes('level 2') ||
    grade.includes('field assistant') ||
    title.includes('driver') ||
    title.includes('cleaner') ||
    title.includes('cashier') ||
    title.includes('office assistant') ||
    dept.includes('facilities')
  ) {
    return 2;
  }

  // L1: Intern / NYSC / Trainee
  if (
    empType === 'INTERN' ||
    grade.includes('level 1') ||
    grade.includes('intern') ||
    grade.includes('nysc') ||
    grade.includes('trainee')
  ) {
    return 1;
  }

  return 4;
}
