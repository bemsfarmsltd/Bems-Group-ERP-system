import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const orgId = defaultOrgId;
    const today = new Date();
    const iso = (offsetDays: number) => {
      const d = new Date(today.getTime() + offsetDays * 86400000);
      return d.toISOString().split('T')[0];
    };

    // 1. Teams
    const teamBem = await prisma.projectTeam.upsert({
      where: { organizationId_key: { organizationId: orgId, key: 'BEM' } },
      update: {},
      create: {
        organizationId: orgId,
        key: 'BEM',
        name: 'BemsSoft Hub Ltd',
        description: 'Core product engineering, APIs, and revenue platforms.',
        color: '#ea580c',
        cyclesEnabled: true,
        cycleDurationDays: 14,
        cycleAutomationJson: JSON.stringify({
          autoAddActive: true,
          autoAddStarted: true,
          autoAddCompleted: false,
          carryOverUnfinished: true,
        }),
        members: { create: { employeeId: actor.id, role: 'LEAD' } },
      },
    });

    const teamOps = await prisma.projectTeam.upsert({
      where: { organizationId_key: { organizationId: orgId, key: 'OPS' } },
      update: {},
      create: {
        organizationId: orgId,
        key: 'OPS',
        name: 'Field Operations & Rollout',
        description: 'State deployments, hardware procurement, and terminal onboarding.',
        color: '#0284c7',
        cyclesEnabled: true,
        cycleDurationDays: 14,
        members: { create: { employeeId: actor.id, role: 'LEAD' } },
      },
    });

    // 2. Labels
    const labelDefs = [
      { name: 'Backend', color: '#2563eb' },
      { name: 'Frontend', color: '#7c3aed' },
      { name: 'Eticket', color: '#ea580c' },
      { name: 'Enumeration', color: '#d97706' },
      { name: 'API Ready', color: '#10b981' },
    ];
    for (const l of labelDefs) {
      await prisma.projectLabel.upsert({
        where: { organizationId_scope_name: { organizationId: orgId, scope: 'ISSUE', name: l.name } },
        update: {},
        create: { organizationId: orgId, teamId: teamBem.id, scope: 'ISSUE', name: l.name, color: l.color },
      });
    }

    // 3. Portfolio & Goal
    const portfolio = await prisma.projectPortfolio.create({
      data: {
        organizationId: orgId,
        name: '2026 Digital & Revenue Expansion',
        description: 'Group-wide software, e-ticketing, and state IGR platforms.',
        ownerId: actor.id,
        status: 'ACTIVE',
      },
    });

    const goal = await prisma.projectGoal.create({
      data: {
        organizationId: orgId,
        title: 'Launch 3 State Revenue & Mobility Platforms',
        measurementPeriod: 'Q4 2026',
        targetValue: 100,
        currentValue: 62,
        unit: '%',
        ownerId: actor.id,
      },
    });

    // 4. Projects
    const count = await prisma.project.count();
    const p1 = await prisma.project.create({
      data: {
        projectCode: `BEMS-PM-${count + 101}`,
        organizationId: orgId,
        teamId: teamBem.id,
        portfolioId: portfolio.id,
        goalId: goal.id,
        title: 'Edo State IGR Upscaling Programme',
        description: 'Revenue collection APIs, share configuration, and reporting dashboards.',
        projectType: 'SOFTWARE',
        methodology: 'SCRUM',
        status: 'ACTIVE',
        priority: 'URGENT',
        healthStatus: 'ON_TRACK',
        managerId: actor.id,
        createdById: actor.id,
        startDate: iso(-20),
        targetDate: iso(25),
        proposedBudgetMinor: BigInt(1500000000),
        approvedBudgetMinor: BigInt(1500000000),
        progressPercent: 64,
        members: { create: { employeeId: actor.id, projectRole: 'PROJECT_MANAGER', raciRole: 'A' } },
        milestones: {
          create: [
            { title: 'Core Revenue & Share APIs', dueDate: iso(-3), status: 'COMPLETED', weightPercent: 40 },
            { title: 'Frontend Reporting & Portal', dueDate: iso(12), status: 'IN_PROGRESS', weightPercent: 35 },
            { title: 'Statewide UAT & Cutover', dueDate: iso(25), status: 'PENDING', weightPercent: 25 },
          ],
        },
        releases: {
          create: {
            versionTag: 'v2.4.0',
            title: 'IGR Share Config & Summary Release',
            environment: 'PRODUCTION',
            plannedDate: iso(10),
            status: 'RELEASE_CANDIDATE',
            ownerId: actor.id,
          },
        },
        testCases: {
          create: [
            {
              title: 'Verify /v1/shares/{id} PATCH & soft delete',
              suiteName: 'API Regression',
              steps: '1. Authenticate as admin\n2. PATCH share config\n3. Assert audit log',
              expectedResult: '200 OK and updated share percentage persisted',
              lastRunStatus: 'PASS',
              executedById: actor.id,
            },
            {
              title: 'Revenue Summary Chart Aggregation',
              suiteName: 'UI E2E',
              steps: '1. Open IGR dashboard\n2. Filter by month',
              expectedResult: 'Totals match ledger within 0.00',
              lastRunStatus: 'NOT_RUN',
            },
          ],
        },
      },
    });

    const p2 = await prisma.project.create({
      data: {
        projectCode: `BEMS-PM-${count + 102}`,
        organizationId: orgId,
        teamId: teamOps.id,
        portfolioId: portfolio.id,
        title: 'Bus Terminal — MVP 3: Digital & Operations',
        description: 'Passenger mobile/web booking, wallet transfers, and vehicle enumeration.',
        projectType: 'OPERATIONS',
        methodology: 'HYBRID',
        status: 'ACTIVE',
        priority: 'HIGH',
        healthStatus: 'AT_RISK',
        managerId: actor.id,
        createdById: actor.id,
        startDate: iso(-10),
        targetDate: iso(35),
        proposedBudgetMinor: BigInt(950000000),
        approvedBudgetMinor: BigInt(950000000),
        progressPercent: 38,
        members: { create: { employeeId: actor.id, projectRole: 'PROJECT_MANAGER', raciRole: 'A' } },
      },
    });

    // 5. Sprint / Cycle
    const sprint = await prisma.projectSprint.create({
      data: {
        organizationId: orgId,
        teamId: teamBem.id,
        projectId: p1.id,
        cycleNumber: 14,
        name: 'Cycle 14 — Core API & Portal',
        goal: 'Ship share configuration UI, vehicle enumeration, and report endpoints.',
        startDate: iso(-5),
        endDate: iso(9),
        capacityPoints: 34,
        status: 'ACTIVE',
      },
    });

    // 6. Work Items
    const wiCount = await prisma.projectWorkItem.count();
    const itemsData = [
      {
        itemKey: `BEM-${wiCount + 101}`,
        projectId: p1.id,
        teamId: teamBem.id,
        sprintId: sprint.id,
        itemType: 'FEATURE',
        title: '[FE] E-Ticket Asset Registration UI — Vehicle Enrollment',
        status: 'IN_PROGRESS',
        priority: 'URGENT',
        storyPoints: 8,
        dueDate: iso(3),
        labelsJson: JSON.stringify(['Eticket', 'Frontend']),
      },
      {
        itemKey: `BEM-${wiCount + 102}`,
        projectId: p1.id,
        teamId: teamBem.id,
        sprintId: sprint.id,
        itemType: 'TASK',
        title: '[BE] GET/PATCH/DELETE /v1/shares/{id} — Share Configuration',
        status: 'IN_REVIEW',
        priority: 'HIGH',
        storyPoints: 5,
        dueDate: iso(2),
        labelsJson: JSON.stringify(['Backend', 'API Ready']),
      },
      {
        itemKey: `BEM-${wiCount + 103}`,
        projectId: p1.id,
        teamId: teamBem.id,
        sprintId: sprint.id,
        itemType: 'TASK',
        title: 'Implement Revenue Collection Statistics Summary API',
        status: 'TODO',
        priority: 'MEDIUM',
        storyPoints: 5,
        dueDate: iso(5),
        labelsJson: JSON.stringify(['Backend']),
      },
      {
        itemKey: `BEM-${wiCount + 104}`,
        projectId: p2.id,
        teamId: teamOps.id,
        itemType: 'STORY',
        title: 'Routes, fares and passenger booking features',
        status: 'BACKLOG',
        priority: 'HIGH',
        storyPoints: 8,
        dueDate: iso(14),
        labelsJson: JSON.stringify(['Eticket', 'Frontend']),
      },
      {
        itemKey: `BEM-${wiCount + 105}`,
        projectId: p2.id,
        teamId: teamOps.id,
        itemType: 'BUG',
        title: 'Fix vehicle enumeration search & filter pagination',
        status: 'BLOCKED',
        priority: 'URGENT',
        storyPoints: 3,
        dueDate: iso(1),
        isBlocked: true,
        labelsJson: JSON.stringify(['Enumeration', 'Frontend']),
      },
      {
        itemKey: `BEM-${wiCount + 106}`,
        projectId: p1.id,
        teamId: teamBem.id,
        sprintId: sprint.id,
        itemType: 'TASK',
        title: 'Ticket Scheduling & Automated Dispatch Worker',
        status: 'DONE',
        priority: 'MEDIUM',
        storyPoints: 5,
        dueDate: iso(-1),
        completedAt: new Date(),
        labelsJson: JSON.stringify(['Backend', 'Eticket']),
      },
    ];

    for (const d of itemsData) {
      await prisma.projectWorkItem.create({
        data: {
          ...d,
          organizationId: orgId,
          assigneeId: actor.id,
          reporterId: actor.id,
        },
      });
    }

    return NextResponse.json({ success: true, message: 'BEMS starter workspace loaded.' });
  } catch (error) {
    console.error('POST /api/projects/seed error:', error);
    return NextResponse.json({ error: 'Failed to seed starter workspace.' }, { status: 500 });
  }
}

