import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { allowedSubIds, useSubFilter } = ctx;
    const orgFilter = useSubFilter ? { organizationId: { in: allowedSubIds } } : {};

    const [teams, labels, slaRules] = await Promise.all([
      prisma.projectTeam.findMany({
        where: orgFilter,
        orderBy: { name: 'asc' },
        include: {
          members: { include: { employee: { select: { id: true, legalName: true, jobTitle: true } } } },
          _count: { select: { projects: true, workItems: true, sprints: true } },
        },
      }),
      prisma.projectLabel.findMany({ where: orgFilter, orderBy: { name: 'asc' } }),
      prisma.projectSlaRule.findMany({ where: orgFilter, orderBy: { createdAt: 'desc' } }),
    ]);

    return NextResponse.json({ success: true, teams, labels, slaRules });
  } catch (error) {
    console.error('GET /api/projects/teams error:', error);
    return NextResponse.json({ error: 'Failed to load teams and settings.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'CREATE_TEAM') {
      const name = String(body.name || '').trim();
      const key = String(body.key || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!name || !key) {
        return NextResponse.json({ error: 'Team name and key (e.g. BEM) are required.' }, { status: 400 });
      }
      const team = await prisma.projectTeam.create({
        data: {
          organizationId,
          key,
          name,
          description: body.description ? String(body.description).trim() : null,
          color: body.color ? String(body.color) : '#ea580c',
          cyclesEnabled: body.cyclesEnabled !== false,
          cycleDurationDays: Number(body.cycleDurationDays || 14),
          cycleCooldownDays: Number(body.cycleCooldownDays || 0),
          cycleAutomationJson: JSON.stringify({
            autoAddActive: true,
            autoAddStarted: true,
            autoAddCompleted: false,
            carryOverUnfinished: true,
          }),
          members: {
            create: { employeeId: actor.id, role: 'LEAD' },
          },
        },
      });
      return NextResponse.json({ success: true, team });
    }

    if (action === 'ADD_TEAM_MEMBER') {
      const teamId = String(body.teamId || '');
      const employeeId = String(body.employeeId || '');
      if (!teamId || !employeeId) {
        return NextResponse.json({ error: 'teamId and employeeId are required.' }, { status: 400 });
      }
      const member = await prisma.projectTeamMember.upsert({
        where: { teamId_employeeId: { teamId, employeeId } },
        update: { role: String(body.role || 'MEMBER') },
        create: { teamId, employeeId, role: String(body.role || 'MEMBER') },
      });
      return NextResponse.json({ success: true, member });
    }

    if (action === 'CREATE_LABEL') {
      const name = String(body.name || '').trim();
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!name) return NextResponse.json({ error: 'Label name is required.' }, { status: 400 });
      const label = await prisma.projectLabel.create({
        data: {
          organizationId,
          teamId: body.teamId ? String(body.teamId) : null,
          scope: String(body.scope || 'ISSUE'),
          name,
          color: String(body.color || '#3b82f6'),
          description: body.description ? String(body.description).trim() : null,
        },
      });
      return NextResponse.json({ success: true, label });
    }

    if (action === 'CREATE_SLA_RULE') {
      const name = String(body.name || '').trim();
      const organizationId = String(body.organizationId || defaultOrgId);
      if (!name) return NextResponse.json({ error: 'SLA rule name is required.' }, { status: 400 });
      const slaRule = await prisma.projectSlaRule.create({
        data: {
          organizationId,
          teamId: body.teamId ? String(body.teamId) : null,
          name,
          priority: String(body.priority || 'URGENT'),
          responseMinutes: Math.max(5, Number(body.responseMinutes || 60)),
          resolutionMinutes: Math.max(15, Number(body.resolutionMinutes || 1440)),
          isActive: true,
        },
      });
      return NextResponse.json({ success: true, slaRule });
    }

    if (action === 'CARRY_OVER_CYCLE') {
      const fromSprintId = String(body.fromSprintId || '');
      const toSprintId = String(body.toSprintId || '');
      if (!fromSprintId || !toSprintId) {
        return NextResponse.json({ error: 'Source and target cycles are required.' }, { status: 400 });
      }
      const unfinished = await prisma.projectWorkItem.findMany({
        where: {
          sprintId: fromSprintId,
          status: { notIn: ['DONE', 'ACCEPTED', 'ARCHIVED'] },
        },
        select: { id: true },
      });
      if (unfinished.length > 0) {
        await prisma.projectWorkItem.updateMany({
          where: { id: { in: unfinished.map((u) => u.id) } },
          data: { sprintId: toSprintId, version: { increment: 1 } },
        });
      }
      await prisma.projectSprint.update({
        where: { id: fromSprintId },
        data: { status: 'COMPLETED', carriedOverCount: unfinished.length },
      });
      await prisma.projectSprint.update({
        where: { id: toSprintId },
        data: { status: 'ACTIVE' },
      });
      return NextResponse.json({ success: true, carriedOverCount: unfinished.length });
    }

    return NextResponse.json({ error: 'Unsupported team action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/teams error:', error);
    return NextResponse.json({ error: 'Failed to process team request.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const body = await req.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Team id is required.' }, { status: 400 });

    const existing = await prisma.projectTeam.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

    const team = await prisma.projectTeam.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        description: body.description !== undefined ? String(body.description) : existing.description,
        cyclesEnabled: body.cyclesEnabled !== undefined ? Boolean(body.cyclesEnabled) : existing.cyclesEnabled,
        cycleDurationDays:
          body.cycleDurationDays !== undefined ? Number(body.cycleDurationDays) : existing.cycleDurationDays,
        cycleCooldownDays:
          body.cycleCooldownDays !== undefined ? Number(body.cycleCooldownDays) : existing.cycleCooldownDays,
        cycleAutomationJson:
          body.cycleAutomationJson !== undefined
            ? typeof body.cycleAutomationJson === 'string'
              ? body.cycleAutomationJson
              : JSON.stringify(body.cycleAutomationJson)
            : existing.cycleAutomationJson,
        triageEnabled: body.triageEnabled !== undefined ? Boolean(body.triageEnabled) : existing.triageEnabled,
      },
    });

    return NextResponse.json({ success: true, team });
  } catch (error) {
    console.error('PATCH /api/projects/teams error:', error);
    return NextResponse.json({ error: 'Failed to update team settings.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(req.url);
    const kind = String(searchParams.get('kind') || 'label');
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    if (kind === 'label') {
      await prisma.projectLabel.delete({ where: { id } });
    } else if (kind === 'sla') {
      await prisma.projectSlaRule.delete({ where: { id } });
    } else if (kind === 'team') {
      await prisma.projectTeam.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/teams error:', error);
    return NextResponse.json({ error: 'Failed to delete item.' }, { status: 500 });
  }
}

