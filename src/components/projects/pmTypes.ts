export type ProjectSectionId =
  | 'overview'
  | 'my_work'
  | 'inbox'
  | 'projects'
  | 'staff_timelines'
  | 'handover_vault'
  | 'project_chat'
  | 'issues'
  | 'views'
  | 'teams'
  | 'portfolios'
  | 'backlog'
  | 'sprints'
  | 'roadmaps'
  | 'workload'
  | 'approvals'
  | 'releases'
  | 'risks'
  | 'reports'
  | 'ecosystem'
  | 'loops'
  | 'templates'
  | 'settings';

export type ViewMode = 'board' | 'list' | 'calendar';
export type GroupByField = 'status' | 'priority' | 'assignee' | 'project' | 'sprint';
export type IssuesScopeTab = 'active' | 'backlog' | 'all';
export type MyIssuesSubTab = 'assigned' | 'created' | 'subscribed' | 'activity';

export interface DisplayConfig {
  viewMode: ViewMode;
  groupBy: GroupByField;
  showLabels: boolean;
  showAssignee: boolean;
  showDueDate: boolean;
  showPoints: boolean;
  showSubIssues: boolean;
  showProjectBadge: boolean;
}

export interface FilterConfig {
  search: string;
  status: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  sprintId: string;
  label: string;
}

export interface TeamMemberRow {
  id: string;
  employeeId: string;
  role: string;
  employee?: { id: string; legalName: string; jobTitle?: string | null };
}

export interface TeamRow {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description?: string | null;
  color: string;
  cyclesEnabled: boolean;
  cycleDurationDays: number;
  cycleCooldownDays: number;
  cycleAutomationJson?: string | null;
  triageEnabled: boolean;
  members?: TeamMemberRow[];
  _count?: { projects: number; workItems: number; sprints: number };
}

export interface LabelRow {
  id: string;
  organizationId: string;
  teamId?: string | null;
  scope: string;
  name: string;
  color: string;
  description?: string | null;
}

export interface SavedViewRow {
  id: string;
  name: string;
  description?: string | null;
  visibility: string;
  teamId?: string | null;
  filtersJson: string;
  displayJson: string;
}

export interface ReleaseRow {
  id: string;
  projectId: string;
  versionTag: string;
  title: string;
  environment: string;
  plannedDate?: string | null;
  deployedAt?: string | null;
  status: string;
  rollbackPlan?: string | null;
  releaseNotes?: string | null;
  project?: { id: string; projectCode: string; title: string };
}

export interface TestCaseRow {
  id: string;
  projectId: string;
  workItemId?: string | null;
  title: string;
  suiteName: string;
  steps: string;
  expectedResult: string;
  lastRunStatus: string;
  project?: { id: string; projectCode: string; title: string };
  workItem?: { id: string; itemKey: string; title: string } | null;
}

export interface LoopRuleRow {
  id: string;
  name: string;
  triggerType: string;
  actionType: string;
  conditionsJson: string;
  actionConfigJson: string;
  isActive: boolean;
  lastTriggeredAt?: string | null;
}

export interface SlaRuleRow {
  id: string;
  name: string;
  priority: string;
  responseMinutes: number;
  resolutionMinutes: number;
  isActive: boolean;
}

export interface ActivityLogRow {
  id: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
  actor?: { id: string; legalName: string };
  workItem?: { id: string; itemKey: string; title: string } | null;
}

