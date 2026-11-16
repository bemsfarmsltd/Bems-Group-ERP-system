import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  resolveProjectContext,
  logProjectAudit,
  serializeBigInt,
  PROJECT_TEMPLATES,
  DEFAULT_WORKFLOWS,
} from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive, allowedSubIds, useSubFilter } = ctx;

    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

    const [
      projects,
      workItems,
      milestones,
      sprints,
      portfolios,
      goals,
      risks,
      approvals,
      timeEntries,
      subsidiaries,
      departments,
      staffOptions,
      teams,
      labels,
      savedViews,
      slaRules,
      releases,
      testCases,
      automations,
      activityLogs,
      statusUpdates,
      subscriptions,
      issueTemplates,
    ] = await Promise.all([
      prisma.project.findMany({
        where: orgFilter,
        orderBy: { updatedAt: 'desc' },
        include: {
          organization: { select: { id: true, legalName: true, code: true, logoUrl: true, brandColor: true } },
          department: { select: { id: true, name: true } },
          team: { select: { id: true, key: true, name: true, color: true } },
          portfolio: { select: { id: true, name: true } },
          goal: { select: { id: true, title: true } },
          manager: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
          teamLead: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
          sponsor: { select: { id: true, legalName: true } },
          parentProject: { select: { id: true, projectCode: true, title: true } },
          subProjects: {
            select: {
              id: true,
              projectCode: true,
              title: true,
              status: true,
              healthStatus: true,
              progressPercent: true,
              targetDate: true,
              teamLeadId: true,
              projectType: true,
            },
          },
          members: {
            include: {
              employee: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
            },
          },
          staffHandovers: {
            include: {
              employee: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
            },
          },
          credentialEntries: {
            select: {
              id: true,
              projectId: true,
              employeeId: true,
              employee: { select: { id: true, legalName: true } },
              toolName: true,
              category: true,
              environment: true,
              loginUrl: true,
              username: true,
              notes: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          documents: {
            orderBy: { createdAt: 'desc' },
          },
          expenditureRequests: {
            select: { id: true, requestNumber: true, title: true, amountMinor: true, approvalStatus: true },
          },
          _count: {
            select: { workItems: true, milestones: true, risks: true, approvals: true },
          },
        },
      }),
      prisma.projectWorkItem.findMany({
        where: orgFilter,
        orderBy: [{ updatedAt: 'desc' }],
        take: 400,
        include: {
          project: { select: { id: true, projectCode: true, title: true, organizationId: true } },
          team: { select: { id: true, key: true, name: true, color: true } },
          parent: { select: { id: true, itemKey: true, title: true } },
          department: { select: { id: true, name: true } },
          milestone: { select: { id: true, title: true } },
          sprint: { select: { id: true, name: true } },
          assignee: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
          reporter: { select: { id: true, legalName: true } },
          reviewer: { select: { id: true, legalName: true } },
          subtasks: { select: { id: true, itemKey: true, title: true, status: true } },
          blockedByLinks: {
            include: { sourceItem: { select: { id: true, itemKey: true, title: true, status: true } } },
          },
          blocksLinks: {
            include: { targetItem: { select: { id: true, itemKey: true, title: true, status: true } } },
          },
          _count: { select: { comments: true, timeEntries: true } },
        },
      }),
      prisma.projectMilestone.findMany({
        where: { project: orgFilter },
        orderBy: { dueDate: 'asc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          _count: { select: { workItems: true } },
        },
      }),
      prisma.projectSprint.findMany({
        where: orgFilter,
        orderBy: { startDate: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          _count: { select: { workItems: true } },
        },
      }),
      prisma.projectPortfolio.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { projects: true } } },
      }),
      prisma.projectGoal.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { projects: true } } },
      }),
      prisma.projectRisk.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          owner: { select: { id: true, legalName: true } },
        },
      }),
      prisma.projectApproval.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
        },
      }),
      prisma.projectTimeEntry.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        take: 150,
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          workItem: { select: { id: true, itemKey: true, title: true } },
          employee: { select: { id: true, legalName: true } },
        },
      }),
      prisma.organization.findMany({
        where: { status: 'ACTIVE', ...(isExecutive ? {} : { id: { in: allowedSubIds } }) },
        orderBy: { type: 'asc' },
        select: { id: true, legalName: true, code: true, type: true, logoUrl: true, brandColor: true },
      }),
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      prisma.employee.findMany({
        where: {
          status: 'ACTIVE',
          ...(useSubFilter
            ? { assignments: { some: { subsidiaryId: { in: allowedSubIds }, status: 'ACTIVE' } } }
            : {}),
        },
        orderBy: { legalName: 'asc' },
        select: {
          id: true,
          employeeNumber: true,
          legalName: true,
          jobTitle: true,
          role: true,
        },
      }),
      prisma.projectTeam.findMany({
        where: orgFilter,
        orderBy: { name: 'asc' },
        include: {
          members: { include: { employee: { select: { id: true, legalName: true, jobTitle: true } } } },
          _count: { select: { projects: true, workItems: true, sprints: true } },
        },
      }),
      prisma.projectLabel.findMany({
        where: orgFilter,
        orderBy: { name: 'asc' },
      }),
      prisma.projectSavedView.findMany({
        where: orgFilter,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.projectSlaRule.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.projectRelease.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, projectCode: true, title: true } } },
      }),
      prisma.projectTestCase.findMany({
        where: { project: orgFilter },
        orderBy: { updatedAt: 'desc' },
        include: {
          project: { select: { id: true, projectCode: true, title: true } },
          workItem: { select: { id: true, itemKey: true, title: true } },
        },
      }),
      prisma.projectAutomationRule.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.projectActivityLog.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
        take: 120,
        include: {
          actor: { select: { id: true, legalName: true } },
          workItem: { select: { id: true, itemKey: true, title: true } },
        },
      }),
      prisma.projectStatusUpdate.findMany({
        where: { project: orgFilter },
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          author: { select: { id: true, legalName: true } },
          project: { select: { id: true, projectCode: true, title: true } },
        },
      }),
      prisma.projectWorkItemSubscription.findMany({
        where: { employeeId: actor.id },
        select: { workItemId: true },
      }),
      prisma.projectIssueTemplate.findMany({
        where: orgFilter,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const next7Str = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const enrichedProjects = projects.map((p) => {
      const committedOrActual = p.expenditureRequests.reduce((sum: number, r: any) => {
        if (['REJECTED', 'CANCELLED'].includes(String(r.approvalStatus).toUpperCase())) return sum;
        return sum + Number(r.amountMinor || 0) / 100;
      }, 0);
      const approvedBudget = Number(p.approvedBudgetMinor || 0) / 100;
      const proposedBudget = Number(p.proposedBudgetMinor || 0) / 100;
      return {
        ...p,
        approvedBudgetNgn: approvedBudget,
        proposedBudgetNgn: proposedBudget,
        committedSpendNgn: committedOrActual,
        availableBudgetNgn: Math.max(0, (approvedBudget || proposedBudget) - committedOrActual),
      };
    });

    const visibleProjects = isExecutive
      ? enrichedProjects
      : enrichedProjects
          .filter(
            (p) =>
              p.teamLeadId === actor.id ||
              p.managerId === actor.id ||
              (p.members || []).some((m: any) => m.employeeId === actor.id)
          )
          .map((p) => ({
            ...p,
            members: (p.members || []).map((m: any) =>
              m.employeeId === actor.id || p.teamLeadId === actor.id
                ? m
                : {
                    ...m,
                    salaryDeductionFlagged: false,
                    proposedDeductionMinor: BigInt(0),
                    performanceImpactNote: null,
                  }
            ),
            credentialEntries: (p.credentialEntries || []).filter(
              (c: any) => c.employeeId === actor.id || p.teamLeadId === actor.id
            ),
          }));

    const visibleProjectIds = new Set(visibleProjects.map((p) => p.id));
    const visibleWorkItems = isExecutive
      ? workItems
      : workItems.filter(
          (w) =>
            visibleProjectIds.has(w.projectId) ||
            w.assigneeId === actor.id ||
            w.reporterId === actor.id
        );

    const activeProjects = visibleProjects.filter((p) => p.status === 'ACTIVE').length;
    const awaitingApproval = visibleProjects.filter((p) => p.status === 'SUBMITTED_FOR_APPROVAL').length;
    const openTasks = visibleWorkItems.filter((w) => !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)).length;
    const blockedTasks = visibleWorkItems.filter((w) => w.isBlocked || w.status === 'BLOCKED').length;
    const dueThisWeek = visibleWorkItems.filter(
      (w) => w.dueDate && w.dueDate >= todayStr && w.dueDate <= next7Str && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
    ).length;
    const myTasks = visibleWorkItems.filter(
      (w) => w.assigneeId === actor.id && !['DONE', 'ACCEPTED', 'ARCHIVED'].includes(w.status)
    ).length;

    return NextResponse.json(
      serializeBigInt({
        success: true,
        actor: {
          id: actor.id,
          legalName: actor.legalName,
          role: actor.role,
          customAdminPermissions: actor.customAdminPermissions || null,
        },
        projects: visibleProjects,
        workItems: visibleWorkItems,
        milestones,
        sprints,
        portfolios,
        goals,
        risks,
        approvals: isExecutive ? approvals : [],
        timeEntries,
        subsidiaries,
        departments,
        staffOptions,
        teams,
        labels,
        savedViews,
        slaRules,
        releases,
        testCases,
        automations,
        activityLogs,
        statusUpdates,
        subscribedWorkItemIds: subscriptions.map((s) => s.workItemId),
        issueTemplates,
        templates: PROJECT_TEMPLATES,
        workflows: DEFAULT_WORKFLOWS,
        metrics: {
          totalProjects: enrichedProjects.length,
          activeProjects,
          awaitingApproval,
          openTasks,
          blockedTasks,
          dueThisWeek,
          myTasks,
          pendingApprovals: approvals.filter((a) => a.status === 'PENDING').length,
          openRisks: risks.filter((r) => ['OPEN', 'MITIGATING'].includes(r.status)).length,
        },
      })
    );
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to load project workspace data.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive, allowedSubIds, defaultOrgId } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'CREATE_PROJECT') {
      if (!isExecutive) {
        return NextResponse.json(
          { error: 'Only GMD or Super Admin can create top-level projects or sub-projects.' },
          { status: 403 }
        );
      }
      const title = String(body.title || '').trim();
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!title || !organizationId) {
        return NextResponse.json({ error: 'Project title and subsidiary are required.' }, { status: 400 });
      }
      if (!isExecutive && !allowedSubIds.includes(organizationId)) {
        return NextResponse.json({ error: 'Forbidden subsidiary.' }, { status: 403 });
      }

      const template = PROJECT_TEMPLATES.find((t) => t.key === body.templateKey);
      const count = await prisma.project.count();
      const projectCode = `BEMS-PM-${String(count + 1).padStart(3, '0')}`;
      const proposedBudgetMinor = BigInt(Math.round(Math.max(0, Number(body.proposedBudget || 0)) * 100));
      const initialStatus = body.submitForApproval ? 'SUBMITTED_FOR_APPROVAL' : 'DRAFT_PROPOSAL';

      const project = await prisma.project.create({
        data: {
          projectCode,
          organizationId,
          departmentId: body.departmentId ? String(body.departmentId) : null,
          portfolioId: body.portfolioId ? String(body.portfolioId) : null,
          goalId: body.goalId ? String(body.goalId) : null,
          templateKey: template?.key || null,
          title,
          description: body.description ? String(body.description).trim() : template?.description || null,
          objectives: body.objectives ? String(body.objectives).trim() : null,
          deliverablesSummary: body.deliverablesSummary ? String(body.deliverablesSummary).trim() : null,
          projectType: String(body.projectType || template?.projectType || 'OPERATIONS'),
          methodology: String(body.methodology || template?.methodology || 'HYBRID'),
          visibility: String(body.visibility || 'COMPANY'),
          status: initialStatus,
          priority: String(body.priority || 'MEDIUM'),
          healthStatus: 'ON_TRACK',
          sponsorId: body.sponsorId ? String(body.sponsorId) : null,
          managerId: body.managerId ? String(body.managerId) : actor.id,
          teamLeadId: body.teamLeadId ? String(body.teamLeadId) : null,
          parentProjectId: body.parentProjectId ? String(body.parentProjectId) : null,
          githubRepoUrl: body.githubRepoUrl ? String(body.githubRepoUrl).trim() : null,
          githubBranch: body.githubBranch ? String(body.githubBranch).trim() : 'main',
          githubSyncEnabled: Boolean(body.githubRepoUrl),
          startDate: body.startDate ? String(body.startDate) : new Date().toISOString().split('T')[0],
          targetDate: body.targetDate ? String(body.targetDate) : null,
          baselineStartDate: body.startDate ? String(body.startDate) : new Date().toISOString().split('T')[0],
          baselineTargetDate: body.targetDate ? String(body.targetDate) : null,
          proposedBudgetMinor,
          createdById: actor.id,
        },
      });

      const memberIds = new Set<string>([actor.id]);
      if (project.managerId) memberIds.add(project.managerId);
      if (project.teamLeadId) memberIds.add(project.teamLeadId);
      await prisma.projectMember.createMany({
        data: Array.from(memberIds).map((empId) => ({
          projectId: project.id,
          employeeId: empId,
          projectRole:
            empId === project.teamLeadId
              ? 'TEAM_LEAD'
              : empId === project.managerId
              ? 'PROJECT_MANAGER'
              : 'PROJECT_MEMBER',
          raciRole: empId === project.managerId || empId === project.teamLeadId ? 'A' : 'R',
        })),
        skipDuplicates: true,
      });

      if (template) {
        if (template.defaultMilestones.length > 0) {
          await prisma.projectMilestone.createMany({
            data: template.defaultMilestones.map((mTitle, idx) => ({
              projectId: project.id,
              title: mTitle,
              ownerId: project.managerId || actor.id,
              weightPercent: Math.round(100 / template.defaultMilestones.length),
              status: idx === 0 ? 'IN_PROGRESS' : 'PENDING',
            })),
          });
        }
        const existingItemCount = await prisma.projectWorkItem.count();
        for (let i = 0; i < template.defaultTasks.length; i++) {
          const dt = template.defaultTasks[i];
          await prisma.projectWorkItem.create({
            data: {
              itemKey: `BEMS-${existingItemCount + i + 1}`,
              projectId: project.id,
              organizationId,
              itemType: dt.itemType,
              title: dt.title,
              priority: dt.priority,
              status: 'TODO',
              reporterId: actor.id,
              assigneeId: project.managerId || actor.id,
            },
          });
        }
      }

      if (initialStatus === 'SUBMITTED_FOR_APPROVAL') {
        await prisma.projectApproval.create({
          data: {
            projectId: project.id,
            category: 'PROJECT_AUTH',
            title: `Project Authorization: ${project.projectCode} — ${project.title}`,
            requestedById: actor.id,
            status: 'PENDING',
            snapshotJson: JSON.stringify({ proposedBudgetMinor: proposedBudgetMinor.toString(), targetDate: project.targetDate }),
          },
        });
      }

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: organizationId,
        subsidiaryId: organizationId,
        targetType: 'PROJECT',
        targetId: project.id,
        action: 'PROJECT_CREATED',
        metadata: { projectCode, templateKey: template?.key || null, status: initialStatus },
      });

      return NextResponse.json(serializeBigInt({ success: true, project }));
    }

    if (action === 'ADVANCE_PROJECT_STATUS') {
      const projectId = String(body.projectId || '');
      const nextStatus = String(body.status || '');
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

      const executiveOnly = ['APPROVED_PLANNED', 'REJECTED', 'COMPLETED'].includes(nextStatus);
      if (executiveOnly && !isExecutive) {
        return NextResponse.json({ error: 'Only GMD or Super Admin can approve, reject, or close projects.' }, { status: 403 });
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          status: nextStatus,
          ...(nextStatus === 'APPROVED_PLANNED' ? { approvedBudgetMinor: project.proposedBudgetMinor } : {}),
          ...(nextStatus === 'COMPLETED' ? { actualEndDate: new Date().toISOString().split('T')[0], progressPercent: 100 } : {}),
          version: { increment: 1 },
        },
      });

      if (nextStatus === 'SUBMITTED_FOR_APPROVAL') {
        await prisma.projectApproval.create({
          data: {
            projectId: project.id,
            category: 'PROJECT_AUTH',
            title: `Project Authorization: ${project.projectCode} — ${project.title}`,
            requestedById: actor.id,
            status: 'PENDING',
          },
        });
      }

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: project.organizationId,
        subsidiaryId: project.organizationId,
        targetType: 'PROJECT',
        targetId: project.id,
        action: `PROJECT_STATUS_${nextStatus}`,
        metadata: { previousStatus: project.status, nextStatus },
      });

      return NextResponse.json(serializeBigInt({ success: true, project: updated }));
    }

    if (action === 'CREATE_PORTFOLIO') {
      const name = String(body.name || '').trim();
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!name) return NextResponse.json({ error: 'Portfolio name is required.' }, { status: 400 });
      const portfolio = await prisma.projectPortfolio.create({
        data: { organizationId, name, description: body.description ? String(body.description) : null, ownerId: actor.id },
      });
      return NextResponse.json({ success: true, portfolio });
    }

    if (action === 'CREATE_GOAL') {
      const title = String(body.title || '').trim();
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!title) return NextResponse.json({ error: 'Goal title is required.' }, { status: 400 });
      const goal = await prisma.projectGoal.create({
        data: {
          organizationId,
          title,
          description: body.description ? String(body.description) : null,
          measurementPeriod: String(body.measurementPeriod || 'Q4 2026'),
          targetValue: Number(body.targetValue || 100),
          unit: String(body.unit || '%'),
          ownerId: actor.id,
        },
      });
      return NextResponse.json({ success: true, goal });
    }

    if (action === 'CREATE_SPRINT') {
      const name = String(body.name || '').trim();
      const startDate = String(body.startDate || '');
      const endDate = String(body.endDate || '');
      if (!name || !startDate || !endDate) {
        return NextResponse.json({ error: 'Sprint name, start date, and end date are required.' }, { status: 400 });
      }
      const sprint = await prisma.projectSprint.create({
        data: {
          organizationId: String(body.organizationId || defaultOrgId),
          projectId: body.projectId ? String(body.projectId) : null,
          name,
          goal: body.goal ? String(body.goal) : null,
          startDate,
          endDate,
          capacityPoints: Math.max(1, Number(body.capacityPoints || 40)),
          status: 'PLANNED',
        },
      });
      return NextResponse.json({ success: true, sprint });
    }

    if (action === 'CREATE_MILESTONE') {
      const projectId = String(body.projectId || '');
      const title = String(body.title || '').trim();
      if (!projectId || !title) {
        return NextResponse.json({ error: 'Project and milestone title are required.' }, { status: 400 });
      }
      const milestone = await prisma.projectMilestone.create({
        data: {
          projectId,
          title,
          description: body.description ? String(body.description) : null,
          dueDate: body.dueDate ? String(body.dueDate) : null,
          ownerId: body.ownerId ? String(body.ownerId) : actor.id,
          deliverablesSummary: body.deliverablesSummary ? String(body.deliverablesSummary) : null,
          weightPercent: Math.min(100, Math.max(1, Number(body.weightPercent || 25))),
        },
      });
      return NextResponse.json({ success: true, milestone });
    }

    return NextResponse.json({ error: 'Unsupported project action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to process project action.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Project id is required.' }, { status: 400 });

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const updated = await prisma.project.update({
      where: { id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : existing.title,
        status: body.status !== undefined ? String(body.status) : existing.status,
        healthStatus: body.healthStatus !== undefined ? String(body.healthStatus) : existing.healthStatus,
        healthUpdateAt: body.healthStatus !== undefined ? new Date() : existing.healthUpdateAt,
        priority: body.priority !== undefined ? String(body.priority) : existing.priority,
        startDate: body.startDate !== undefined ? (body.startDate ? String(body.startDate) : null) : existing.startDate,
        targetDate: body.targetDate !== undefined ? (body.targetDate ? String(body.targetDate) : null) : existing.targetDate,
        managerId: body.managerId !== undefined ? (body.managerId ? String(body.managerId) : null) : existing.managerId,
        teamLeadId: body.teamLeadId !== undefined ? (body.teamLeadId ? String(body.teamLeadId) : null) : existing.teamLeadId,
        parentProjectId:
          body.parentProjectId !== undefined
            ? body.parentProjectId && body.parentProjectId !== id
              ? String(body.parentProjectId)
              : null
            : existing.parentProjectId,
        githubRepoUrl:
          body.githubRepoUrl !== undefined
            ? body.githubRepoUrl
              ? String(body.githubRepoUrl).trim()
              : null
            : existing.githubRepoUrl,
        githubBranch:
          body.githubBranch !== undefined
            ? body.githubBranch
              ? String(body.githubBranch).trim()
              : 'main'
            : existing.githubBranch,
        githubSyncEnabled:
          body.githubSyncEnabled !== undefined
            ? Boolean(body.githubSyncEnabled)
            : existing.githubSyncEnabled,
        teamId: body.teamId !== undefined ? (body.teamId ? String(body.teamId) : null) : existing.teamId,
        progressPercent:
          body.progressPercent !== undefined
            ? Math.min(100, Math.max(0, Number(body.progressPercent)))
            : existing.progressPercent,
        version: { increment: 1 },
      },
    });

    if (body.healthSummary) {
      await prisma.projectStatusUpdate.create({
        data: {
          projectId: id,
          authorId: actor.id,
          healthStatus: updated.healthStatus,
          summary: String(body.healthSummary).trim(),
        },
      });
    }

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: existing.organizationId,
      subsidiaryId: existing.organizationId,
      targetType: 'PROJECT',
      targetId: id,
      action: 'PROJECT_UPDATED',
      metadata: { projectCode: existing.projectCode, status: updated.status, healthStatus: updated.healthStatus },
    });

    return NextResponse.json(serializeBigInt({ success: true, project: updated }));
  } catch (error) {
    console.error('PATCH /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to update project.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    if (!isExecutive) {
      return NextResponse.json({ error: 'Only executives can delete projects.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'Project id is required.' }, { status: 400 });

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    await prisma.project.delete({ where: { id } });

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: existing.organizationId,
      subsidiaryId: existing.organizationId,
      targetType: 'PROJECT',
      targetId: id,
      action: 'PROJECT_DELETED',
      metadata: { projectCode: existing.projectCode },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to delete project.' }, { status: 500 });
  }
}
