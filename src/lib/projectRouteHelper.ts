import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, hasEmployeePermission } from '@/lib/auth';
import { hasStaffAppModuleAccess } from '@/lib/staff-modules';
import { resolveAuthorizedOrganizationScope } from '@/lib/organizations';
import { prisma } from '@/lib/prisma';

export const PROJECT_TEMPLATES = [
  {
    key: 'SOFTWARE_DEV',
    name: 'Software Development',
    projectType: 'SOFTWARE',
    methodology: 'SCRUM',
    description: 'Full-stack product engineering with sprints, QA testing, code review, and release cycles.',
    defaultMilestones: ['Requirements & Architecture', 'Core Implementation', 'QA & UAT Sign-off', 'Production Launch'],
    defaultTasks: [
      { title: 'Finalize technical specification & data model', itemType: 'STORY', priority: 'HIGH' },
      { title: 'Implement core backend APIs & validation', itemType: 'TASK', priority: 'HIGH' },
      { title: 'Build UI & run QA regression suite', itemType: 'TASK', priority: 'MEDIUM' },
    ],
  },
  {
    key: 'ERP_IMPL',
    name: 'ERP Implementation',
    projectType: 'SOFTWARE',
    methodology: 'HYBRID',
    description: 'Enterprise module rollout across BEMS subsidiaries with data migration, training, and governance.',
    defaultMilestones: ['Discovery & Mapping', 'Module Build & Integration', 'User Acceptance Testing', 'Go-Live & Handover'],
    defaultTasks: [
      { title: 'Audit subsidiary data & permissions', itemType: 'TASK', priority: 'HIGH' },
      { title: 'Configure workflows & finance linkages', itemType: 'FEATURE', priority: 'HIGH' },
    ],
  },
  {
    key: 'GOV_REVENUE',
    name: 'Government Revenue System Deployment',
    projectType: 'INFRASTRUCTURE',
    methodology: 'HYBRID',
    description: 'State revenue platform deployment, field terminal rollout, stakeholder training, and SLA monitoring.',
    defaultMilestones: ['Stakeholder Charter & Scope', 'Infrastructure & Terminal Prep', 'Pilot Deployment', 'Statewide Rollout'],
    defaultTasks: [
      { title: 'Complete state agency onboarding checklist', itemType: 'OPERATIONAL_ACTION', priority: 'URGENT' },
      { title: 'Verify payment gateway & reconciliation hooks', itemType: 'TASK', priority: 'HIGH' },
    ],
  },
  {
    key: 'HARDWARE_PROCUREMENT',
    name: 'Hardware Procurement and Installation',
    projectType: 'PROCUREMENT',
    methodology: 'WATERFALL',
    description: 'End-to-end hardware sourcing, vendor quotes, delivery inspection, and site installation.',
    defaultMilestones: ['Spec & Vendor Quotations', 'PO Approval & Payment', 'Delivery & 3-Way Inspection', 'Site Installation & Sign-off'],
    defaultTasks: [
      { title: 'Collect 3 vendor quotations & spec comparison', itemType: 'OPERATIONAL_ACTION', priority: 'HIGH' },
      { title: 'Inspect delivered hardware against GRN', itemType: 'APPROVAL_ITEM', priority: 'MEDIUM' },
    ],
  },
  {
    key: 'PRODUCT_LAUNCH',
    name: 'Product Launch',
    projectType: 'OPERATIONS',
    methodology: 'KANBAN',
    description: 'Cross-functional launch coordination across engineering, marketing, sales, and support.',
    defaultMilestones: ['Launch Readiness', 'Campaign & Enablement', 'Public Release', 'Post-Launch Review'],
    defaultTasks: [{ title: 'Prepare launch announcement & user guide', itemType: 'TASK', priority: 'MEDIUM' }],
  },
  {
    key: 'INFRASTRUCTURE_UPGRADE',
    name: 'Infrastructure Upgrade',
    projectType: 'INFRASTRUCTURE',
    methodology: 'WATERFALL',
    description: 'Server, power, Starlink connectivity, or facility upgrades with rollback and verification controls.',
    defaultMilestones: ['Site Assessment', 'Equipment Staging', 'Cutover & Testing', 'Operational Handover'],
    defaultTasks: [{ title: 'Document rollback & downtime window', itemType: 'TASK', priority: 'HIGH' }],
  },
  {
    key: 'INTERNAL_OPERATIONS',
    name: 'Internal Operations',
    projectType: 'OPERATIONS',
    methodology: 'KANBAN',
    description: 'Standard departmental operations, SOP rollouts, and recurring operational initiatives.',
    defaultMilestones: ['Kickoff & Ownership', 'Execution Phase', 'Management Review'],
    defaultTasks: [{ title: 'Assign operational owners & target dates', itemType: 'OPERATIONAL_ACTION', priority: 'MEDIUM' }],
  },
  {
    key: 'R_AND_D',
    name: 'Research and Development',
    projectType: 'SOFTWARE',
    methodology: 'AGILE',
    description: 'Technical spikes, prototypes, feasibility studies, and innovation R&D.',
    defaultMilestones: ['Hypothesis & Spike', 'Prototype Build', 'Feasibility Decision'],
    defaultTasks: [{ title: 'Run technical spike & document findings', itemType: 'SPIKE', priority: 'MEDIUM' }],
  },
  {
    key: 'MARKETING_CAMPAIGN',
    name: 'Marketing Campaign',
    projectType: 'MEDIA',
    methodology: 'KANBAN',
    description: 'Studio Arella / brand campaigns, media assets, approvals, and distribution tracking.',
    defaultMilestones: ['Creative Brief', 'Asset Production', 'Executive Sign-off', 'Campaign Launch'],
    defaultTasks: [{ title: 'Deliver creative assets for review', itemType: 'TASK', priority: 'MEDIUM' }],
  },
  {
    key: 'COMPLIANCE_AUDIT',
    name: 'Compliance and Audit',
    projectType: 'FINANCE',
    methodology: 'WATERFALL',
    description: 'Regulatory compliance, financial reconciliation, and internal audit remediation.',
    defaultMilestones: ['Evidence Collection', 'Audit Review', 'Remediation & Closure'],
    defaultTasks: [{ title: 'Compile supporting audit evidence', itemType: 'APPROVAL_ITEM', priority: 'HIGH' }],
  },
  {
    key: 'TRAINING_CAPACITY',
    name: 'Training and Capacity Development',
    projectType: 'ADMINISTRATION',
    methodology: 'HYBRID',
    description: 'Staff and client training programs, curriculum delivery, and certification tracking.',
    defaultMilestones: ['Curriculum & Materials', 'Training Sessions', 'Assessment & Certification'],
    defaultTasks: [{ title: 'Schedule training cohort & attendance sheet', itemType: 'OPERATIONAL_ACTION', priority: 'MEDIUM' }],
  },
] as const;

export const DEFAULT_WORKFLOWS = [
  {
    name: 'Software Engineering Workflow',
    departmentType: 'ENGINEERING',
    statuses: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA_TESTING', 'DONE', 'ACCEPTED'],
  },
  {
    name: 'Operations Workflow',
    departmentType: 'OPERATIONS',
    statuses: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ACCEPTED'],
  },
  {
    name: 'Procurement Workflow',
    departmentType: 'PROCUREMENT',
    statuses: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ACCEPTED'],
  },
] as const;

export async function resolveProjectContext(req: Request, allowStaffPortal = false) {
  const actor = await getAuthenticatedEmployee(req);
  if (!actor) {
    return {
      error: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }
  if (!hasStaffAppModuleAccess(actor, 'projects')) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: Project Management module is not enabled for your Staff App account.' },
        { status: 403 }
      ),
    };
  }

  const { searchParams } = new URL(req.url);
  const requestedSubId = searchParams.get('subsidiaryId') || '';

  const staffPortal = allowStaffPortal && actor.role === 'CUSTOM_ADMIN' && (searchParams.get('view') === 'staff' || !hasEmployeePermission(actor, 'projects'));
  const orgScope = await resolveAuthorizedOrganizationScope(actor, requestedSubId || 'ALL', staffPortal ? 'staff' : 'projects');
  if (!orgScope.organizationIds.length) {
    return {
      error: NextResponse.json({ error: 'Forbidden. No authorized workspace access.' }, { status: 403 }),
    };
  }

  const roleUpper = String(actor.role || 'STAFF').toUpperCase();
  const isExecutive =
    roleUpper === 'GMD' ||
    roleUpper === 'SUPER_ADMIN' ||
    roleUpper === 'SYSTEM_ADMIN' ||
    (roleUpper === 'CUSTOM_ADMIN' && !staffPortal);
  const isGmd = roleUpper === 'GMD';

  const allowedSubIds = requestedSubId
    ? orgScope.organizationIds.includes(requestedSubId)
      ? [requestedSubId]
      : []
    : orgScope.organizationIds;

  if (requestedSubId && allowedSubIds.length === 0) {
    return {
      error: NextResponse.json({ error: 'Forbidden. Subsidiary outside your scope.' }, { status: 403 }),
    };
  }

  const useSubFilter = Boolean(requestedSubId) || !isExecutive;
  const defaultOrg = await prisma.organization.findFirst({
    where: requestedSubId ? { id: requestedSubId } : { id: { in: allowedSubIds }, status: 'ACTIVE' },
    orderBy: { type: 'asc' },
    select: { id: true },
  });

  return {
    actor,
    staffPortal,
    roleUpper,
    isExecutive,
    isGmd,
    requestedSubId,
    allowedSubIds,
    useSubFilter,
    defaultOrgId: requestedSubId || defaultOrg?.id || allowedSubIds[0] || '',
  };
}

export async function logProjectAudit(params: {
  actorId: string;
  actorName: string;
  actorRole: string;
  groupId: string;
  subsidiaryId?: string;
  targetType: string;
  targetId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        groupId: params.groupId,
        subsidiaryId: params.subsidiaryId || null,
        targetType: params.targetType,
        targetId: params.targetId,
        action: params.action,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        correlationId: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  } catch (e) {
    console.error('Failed to write Project audit event:', e);
  }
}

export function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T;
}

