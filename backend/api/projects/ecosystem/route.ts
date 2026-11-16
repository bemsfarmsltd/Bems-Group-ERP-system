import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, serializeBigInt, logProjectAudit } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;

    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};
    const subFilter = useSubFilter ? { subsidiaryId: { in: allowedSubIds } } : {};

    const todayStr = new Date().toISOString().split('T')[0];
    const next14Str = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const [
      projects,
      workItems,
      timeEntries,
      testCases,
      expenditures,
      budgets,
      leaves,
      attendanceToday,
      kpis,
      evaluations,
    ] = await Promise.all([
      prisma.project.findMany({
        where: orgFilter,
        select: {
          id: true,
          projectCode: true,
          title: true,
          status: true,
          healthStatus: true,
          progressPercent: true,
          approvedBudgetMinor: true,
          proposedBudgetMinor: true,
          kpiDefinitionId: true,
          kpiDefinition: { select: { id: true, title: true, targetMetric: true, weightPercent: true } },
          organization: { select: { id: true, legalName: true, code: true } },
        },
      }),
      prisma.projectWorkItem.findMany({
        where: orgFilter,
        select: {
          id: true,
          projectId: true,
          assigneeId: true,
          status: true,
          priority: true,
          storyPoints: true,
          dueDate: true,
          completedAt: true,
          assignee: { select: { id: true, legalName: true, jobTitle: true } },
        },
      }),
      prisma.projectTimeEntry.findMany({
        where: { project: orgFilter },
        select: { projectId: true, employeeId: true, hours: true },
      }),
      prisma.projectTestCase.findMany({
        where: { project: orgFilter },
        select: { projectId: true, executedById: true, lastRunStatus: true },
      }),
      prisma.expenditureRequest.findMany({
        where: { ...subFilter, projectId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requestNumber: true,
          projectId: true,
          workItemId: true,
          title: true,
          category: true,
          amountMinor: true,
          approvalStatus: true,
          paymentStatus: true,
          accountabilityStatus: true,
          createdAt: true,
          requester: { select: { id: true, legalName: true } },
        },
      }),
      prisma.budget.findMany({
        where: { ...orgFilter, projectId: { not: null } },
        select: {
          id: true,
          projectId: true,
          periodName: true,
          totalAmount: true,
          status: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: { in: ['APPROVED', 'PENDING'] },
          endDate: { gte: todayStr },
          startDate: { lte: next14Str },
        },
        select: {
          id: true,
          employeeId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          status: true,
          employee: { select: { id: true, legalName: true, jobTitle: true } },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { workDate: todayStr },
        select: { employeeId: true, status: true, checkInTime: true },
      }),
      prisma.kpiDefinition.findMany({
        where: { ...orgFilter, isActive: true },
        select: { id: true, title: true, targetMetric: true, weightPercent: true, reviewPeriod: true },
      }),
      prisma.performanceEvaluation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          employeeId: true,
          overallScore: true,
          status: true,
          employee: { select: { id: true, legalName: true } },
        },
      }),
    ]);

    // 1. Finance & Earned-Value per Project
    const projectFinance = projects.map((p) => {
      const projExp = expenditures.filter((e) => e.projectId === p.id);
      const projBudgets = budgets.filter((b) => b.projectId === p.id);
      const budgetNgn =
        projBudgets.reduce((s, b) => s + Number(b.totalAmount || 0), 0) ||
        Number(p.approvedBudgetMinor || p.proposedBudgetMinor || 0) / 100;

      const committedNgn = projExp
        .filter((e) => !['REJECTED', 'CANCELLED'].includes(e.approvalStatus))
        .reduce((s, e) => s + Number(e.amountMinor || 0) / 100, 0);

      const disbursedNgn = projExp
        .filter((e) => e.paymentStatus !== 'UNPAID')
        .reduce((s, e) => s + Number(e.amountMinor || 0) / 100, 0);

      const pendingAccountability = projExp.filter(
        (e) => e.paymentStatus !== 'UNPAID' && e.accountabilityStatus === 'PENDING'
      ).length;

      const projItems = workItems.filter((w) => w.projectId === p.id);
      const doneItems = projItems.filter((w) => ['DONE', 'ACCEPTED'].includes(w.status)).length;
      const workCompletionPct = projItems.length > 0 ? Math.round((doneItems / projItems.length) * 100) : p.progressPercent;
      const budgetBurnPct = budgetNgn > 0 ? Math.round((committedNgn / budgetNgn) * 100) : 0;

      return {
        projectId: p.id,
        projectCode: p.projectCode,
        title: p.title,
        organizationName: p.organization?.legalName,
        budgetNgn,
        committedNgn,
        disbursedNgn,
        remainingNgn: Math.max(0, budgetNgn - committedNgn),
        budgetBurnPct,
        workCompletionPct,
        burnVariance: budgetBurnPct - workCompletionPct,
        pendingAccountability,
        expenditureCount: projExp.length,
        kpiDefinition: p.kpiDefinition,
      };
    });

    // 2. Staff Availability (Leave + Today's Attendance + Active Workload)
    const attendanceMap = new Map(attendanceToday.map((a) => [a.employeeId, a]));
    const leaveByEmployee: Record<string, any[]> = {};
    leaves.forEach((l) => {
      if (!leaveByEmployee[l.employeeId]) leaveByEmployee[l.employeeId] = [];
      leaveByEmployee[l.employeeId].push(l);
    });

    // 3. Performance & Delivery Scorecards per Staff
    const staffStatsMap: Record<
      string,
      {
        employeeId: string;
        legalName: string;
        jobTitle: string;
        openTasks: number;
        openPoints: number;
        completedTasks: number;
        completedPoints: number;
        onTimeTasks: number;
        overdueOpenTasks: number;
        loggedHours: number;
      }
    > = {};

    workItems.forEach((w) => {
      if (!w.assigneeId || !w.assignee) return;
      if (!staffStatsMap[w.assigneeId]) {
        staffStatsMap[w.assigneeId] = {
          employeeId: w.assigneeId,
          legalName: w.assignee.legalName,
          jobTitle: w.assignee.jobTitle || 'Staff',
          openTasks: 0,
          openPoints: 0,
          completedTasks: 0,
          completedPoints: 0,
          onTimeTasks: 0,
          overdueOpenTasks: 0,
          loggedHours: 0,
        };
      }
      const st = staffStatsMap[w.assigneeId];
      const pts = Number(w.storyPoints) || 1;
      const isDone = ['DONE', 'ACCEPTED'].includes(w.status);
      if (isDone) {
        st.completedTasks += 1;
        st.completedPoints += pts;
        if (!w.dueDate || (w.completedAt && w.completedAt.toISOString().split('T')[0] <= w.dueDate)) {
          st.onTimeTasks += 1;
        }
      } else if (w.status !== 'ARCHIVED') {
        st.openTasks += 1;
        st.openPoints += pts;
        if (w.dueDate && w.dueDate < todayStr) {
          st.overdueOpenTasks += 1;
        }
      }
    });

    timeEntries.forEach((t) => {
      if (staffStatsMap[t.employeeId]) {
        staffStatsMap[t.employeeId].loggedHours += Number(t.hours || 0);
      }
    });

    const evalMap = new Map(evaluations.map((e) => [e.employeeId, e]));

    const staffScorecards = Object.values(staffStatsMap)
      .map((st) => {
        const onTimeRate = st.completedTasks > 0 ? Math.round((st.onTimeTasks / st.completedTasks) * 100) : 100;
        const att = attendanceMap.get(st.employeeId);
        const empLeaves = leaveByEmployee[st.employeeId] || [];
        const activeLeave = empLeaves.find((l) => l.startDate <= todayStr && l.endDate >= todayStr && l.status === 'APPROVED');
        const evalRec = evalMap.get(st.employeeId);
        return {
          ...st,
          onTimeRate,
          attendanceStatus: activeLeave ? 'ON_LEAVE' : att?.status || 'NOT_CHECKED_IN',
          upcomingLeaves: empLeaves,
          latestEval: evalRec ? { finalScore: evalRec.overallScore, rating: evalRec.status } : null,
        };
      })
      .sort((a, b) => b.completedPoints - a.completedPoints);

    return NextResponse.json(
      serializeBigInt({
        success: true,
        projectFinance,
        expenditures,
        leaves,
        attendanceToday: Object.fromEntries(attendanceMap),
        staffScorecards,
        kpis,
        testSummary: {
          total: testCases.length,
          passed: testCases.filter((t) => t.lastRunStatus === 'PASS').length,
        },
      })
    );
  } catch (error) {
    console.error('GET /api/projects/ecosystem error:', error);
    return NextResponse.json({ error: 'Failed to load BEMS ecosystem intelligence.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'RAISE_PROJECT_EXPENDITURE') {
      const projectId = String(body.projectId || '');
      const title = String(body.title || '').trim();
      const amountNgn = Number(body.amountNgn || 0);
      const justification = String(body.justification || '').trim();
      const deliverable = String(body.deliverable || '').trim();
      const category = String(body.category || 'OPERATIONS');

      if (!projectId || !title || amountNgn <= 0 || !justification || !deliverable) {
        return NextResponse.json(
          { error: 'Project, title, positive amount, justification, and deliverable are required.' },
          { status: 400 }
        );
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

      const count = await prisma.expenditureRequest.count();
      const requestNumber = `REQ-${new Date().getFullYear()}-${String(count + 1001).padStart(4, '0')}`;

      const exp = await prisma.expenditureRequest.create({
        data: {
          requestNumber,
          groupId: project.organizationId,
          subsidiaryId: project.organizationId,
          requestedById: actor.id,
          projectId: project.id,
          workItemId: body.workItemId ? String(body.workItemId) : null,
          requestType: String(body.requestType || 'ORDINARY'),
          category,
          amountMinor: BigInt(Math.round(amountNgn * 100)),
          currency: project.currency || 'NGN',
          title,
          justification,
          deliverable,
          neededBy: body.neededBy ? new Date(String(body.neededBy)) : new Date(Date.now() + 7 * 86400000),
          approvalStatus: 'SUBMITTED',
        },
      });

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: project.organizationId,
        subsidiaryId: project.organizationId,
        targetType: 'EXPENDITURE_REQUEST',
        targetId: exp.id,
        action: 'PROJECT_EXPENDITURE_RAISED',
        metadata: { requestNumber, projectCode: project.projectCode, amountNgn },
      });

      return NextResponse.json(serializeBigInt({ success: true, expenditure: exp }));
    }

    if (action === 'LINK_PROJECT_KPI') {
      const projectId = String(body.projectId || '');
      const kpiDefinitionId = body.kpiDefinitionId ? String(body.kpiDefinitionId) : null;
      if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

      const updated = await prisma.project.update({
        where: { id: projectId },
        data: { kpiDefinitionId },
      });
      return NextResponse.json(serializeBigInt({ success: true, project: updated }));
    }

    return NextResponse.json({ error: 'Unsupported ecosystem action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/ecosystem error:', error);
    return NextResponse.json({ error: 'Failed to process ecosystem action.' }, { status: 500 });
  }
}

