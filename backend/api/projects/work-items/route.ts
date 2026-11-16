import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, logProjectAudit } from '@/lib/projectRouteHelper';

async function hasPath(startId: string, targetId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await prisma.projectDependency.findMany({
      where: { sourceItemId: current },
      select: { targetItemId: true },
    });
    for (const edge of edges) {
      if (!visited.has(edge.targetItemId)) queue.push(edge.targetItemId);
    }
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'CREATE_WORK_ITEM') {
      const projectId = String(body.projectId || '');
      const title = String(body.title || '').trim();
      if (!projectId || !title) {
        return NextResponse.json({ error: 'Project and work item title are required.' }, { status: 400 });
      }
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

      const count = await prisma.projectWorkItem.count();
      const itemKey = `BEMS-${count + 101}`;

      const item = await prisma.projectWorkItem.create({
        data: {
          itemKey,
          projectId,
          organizationId: project.organizationId,
          departmentId: body.departmentId ? String(body.departmentId) : project.departmentId,
          teamId: body.teamId ? String(body.teamId) : project.teamId,
          milestoneId: body.milestoneId ? String(body.milestoneId) : null,
          sprintId: body.sprintId ? String(body.sprintId) : null,
          parentId: body.parentId ? String(body.parentId) : null,
          itemType: String(body.itemType || 'TASK'),
          title,
          description: body.description ? String(body.description).trim() : null,
          status: String(body.status || 'TODO'),
          priority: String(body.priority || 'MEDIUM'),
          severity: body.severity ? String(body.severity) : null,
          environment: body.environment ? String(body.environment) : null,
          storyPoints: body.storyPoints ? Number(body.storyPoints) : null,
          estimatedHours: body.estimatedHours ? Number(body.estimatedHours) : null,
          assigneeId: body.assigneeId ? String(body.assigneeId) : null,
          reporterId: actor.id,
          reviewerId: body.reviewerId ? String(body.reviewerId) : null,
          startDate: body.startDate ? String(body.startDate) : null,
          dueDate: body.dueDate ? String(body.dueDate) : null,
          labelsJson: body.labelsJson ? String(body.labelsJson) : null,
          acceptanceCriteria: body.acceptanceCriteria ? String(body.acceptanceCriteria) : null,
          checklistJson: body.checklistJson ? String(body.checklistJson) : null,
        },
      });

      // Auto-spawn subtasks from ProjectIssueTemplate or explicit subtasks array
      let subtaskTitles: string[] = Array.isArray(body.subtasks)
        ? body.subtasks.map((s: any) => String(s).trim()).filter(Boolean)
        : [];
      if (body.templateId && subtaskTitles.length === 0) {
        const tpl = await prisma.projectIssueTemplate.findUnique({ where: { id: String(body.templateId) } });
        if (tpl?.subtasksJson) {
          try {
            const arr = JSON.parse(tpl.subtasksJson);
            if (Array.isArray(arr)) subtaskTitles = arr.map(String).filter(Boolean);
          } catch {}
        }
      }
      if (subtaskTitles.length > 0) {
        for (let i = 0; i < subtaskTitles.length; i++) {
          await prisma.projectWorkItem.create({
            data: {
              itemKey: `BEMS-${count + 102 + i}`,
              projectId,
              organizationId: project.organizationId,
              departmentId: item.departmentId,
              teamId: item.teamId,
              parentId: item.id,
              itemType: 'SUBTASK',
              title: subtaskTitles[i],
              status: 'TODO',
              priority: item.priority,
              assigneeId: item.assigneeId,
              reporterId: actor.id,
            },
          });
        }
      }

      await prisma.projectWorkItemSubscription.upsert({
        where: { workItemId_employeeId: { workItemId: item.id, employeeId: actor.id } },
        update: {},
        create: { workItemId: item.id, employeeId: actor.id },
      });

      await prisma.projectActivityLog.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          workItemId: item.id,
          actorId: actor.id,
          action: 'CREATED',
          field: 'status',
          newValue: item.status,
        },
      });

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: project.organizationId,
        subsidiaryId: project.organizationId,
        targetType: 'PROJECT_WORK_ITEM',
        targetId: item.id,
        action: 'WORK_ITEM_CREATED',
        metadata: { itemKey, itemType: item.itemType, projectId },
      });

      return NextResponse.json({ success: true, workItem: item });
    }

    if (action === 'UPDATE_WORK_ITEM') {
      const id = String(body.id || '');
      const existing = await prisma.projectWorkItem.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Work item not found.' }, { status: 404 });

      if (body.expectedVersion !== undefined && Number(body.expectedVersion) !== existing.version) {
        return NextResponse.json(
          { error: 'This task was updated by another user. Refresh to avoid overwriting changes.' },
          { status: 409 }
        );
      }

      const nextStatus = body.status !== undefined ? String(body.status) : existing.status;
      if (nextStatus === 'ACCEPTED' && existing.reviewerId && existing.reviewerId !== actor.id && actor.role === 'STAFF') {
        return NextResponse.json({ error: 'Only the assigned reviewer or executive can accept this deliverable.' }, { status: 403 });
      }
      if (nextStatus === 'ACCEPTED' && existing.assigneeId === actor.id && actor.role === 'STAFF') {
        return NextResponse.json({ error: 'Assignees cannot self-accept deliverables requiring independent verification.' }, { status: 403 });
      }

      const updated = await prisma.projectWorkItem.update({
        where: { id },
        data: {
          status: nextStatus,
          priority: body.priority !== undefined ? String(body.priority) : existing.priority,
          assigneeId: body.assigneeId !== undefined ? (body.assigneeId ? String(body.assigneeId) : null) : existing.assigneeId,
          sprintId: body.sprintId !== undefined ? (body.sprintId ? String(body.sprintId) : null) : existing.sprintId,
          dueDate: body.dueDate !== undefined ? (body.dueDate ? String(body.dueDate) : null) : existing.dueDate,
          isBlocked: body.isBlocked !== undefined ? Boolean(body.isBlocked) : nextStatus === 'BLOCKED',
          blockerReason: body.blockerReason !== undefined ? String(body.blockerReason) : existing.blockerReason,
          checklistJson: body.checklistJson !== undefined ? String(body.checklistJson) : existing.checklistJson,
          completedAt: ['DONE', 'ACCEPTED'].includes(nextStatus) ? existing.completedAt || new Date() : null,
          version: { increment: 1 },
        },
      });

      await logProjectAudit({
        actorId: actor.id,
        actorName: actor.legalName,
        actorRole: actor.role,
        groupId: existing.organizationId,
        subsidiaryId: existing.organizationId,
        targetType: 'PROJECT_WORK_ITEM',
        targetId: id,
        action: 'WORK_ITEM_UPDATED',
        metadata: { itemKey: existing.itemKey, previousStatus: existing.status, nextStatus },
      });

      return NextResponse.json({ success: true, workItem: updated });
    }

    if (action === 'ADD_DEPENDENCY') {
      const sourceItemId = String(body.sourceItemId || '');
      const targetItemId = String(body.targetItemId || '');
      const dependencyType = String(body.dependencyType || 'FINISH_TO_START');
      if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
        return NextResponse.json({ error: 'Valid distinct source and target tasks are required.' }, { status: 400 });
      }
      // Prevent circular dependency
      if (await hasPath(targetItemId, sourceItemId)) {
        return NextResponse.json({ error: 'Circular dependency detected. This link cannot be created.' }, { status: 400 });
      }
      const dep = await prisma.projectDependency.create({
        data: { sourceItemId, targetItemId, dependencyType, lagDays: Number(body.lagDays || 0) },
      });
      return NextResponse.json({ success: true, dependency: dep });
    }

    if (action === 'ADD_COMMENT') {
      const projectId = String(body.projectId || '');
      const workItemId = body.workItemId ? String(body.workItemId) : null;
      const bodyText = String(body.body || '').trim();
      if (!projectId || !bodyText) {
        return NextResponse.json({ error: 'Comment text is required.' }, { status: 400 });
      }
      const comment = await prisma.projectComment.create({
        data: { projectId, workItemId, authorId: actor.id, body: bodyText, isInternal: Boolean(body.isInternal) },
      });
      return NextResponse.json({ success: true, comment });
    }

    if (action === 'LOG_TIME') {
      const projectId = String(body.projectId || '');
      const workItemId = body.workItemId ? String(body.workItemId) : null;
      const hours = Number(body.hours || 0);
      const description = String(body.description || '').trim();
      const workDate = String(body.workDate || new Date().toISOString().split('T')[0]);
      if (!projectId || hours <= 0 || !description) {
        return NextResponse.json({ error: 'Project, positive hours, and work description are required.' }, { status: 400 });
      }
      const entry = await prisma.projectTimeEntry.create({
        data: {
          projectId,
          workItemId,
          employeeId: actor.id,
          workDate,
          hours,
          description,
          isBillable: body.isBillable !== false,
        },
      });
      return NextResponse.json({ success: true, timeEntry: entry });
    }

    if (action === 'TOGGLE_SUBSCRIPTION') {
      const workItemId = String(body.workItemId || '');
      if (!workItemId) return NextResponse.json({ error: 'workItemId is required.' }, { status: 400 });
      const existingSub = await prisma.projectWorkItemSubscription.findUnique({
        where: { workItemId_employeeId: { workItemId, employeeId: actor.id } },
      });
      if (existingSub) {
        await prisma.projectWorkItemSubscription.delete({ where: { id: existingSub.id } });
        return NextResponse.json({ success: true, subscribed: false });
      }
      await prisma.projectWorkItemSubscription.create({ data: { workItemId, employeeId: actor.id } });
      return NextResponse.json({ success: true, subscribed: true });
    }

    return NextResponse.json({ error: 'Unsupported work item action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/work-items error:', error);
    return NextResponse.json({ error: 'Failed to process work item action.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor } = ctx;

    const body = await req.json();

    // Bulk update support
    if (Array.isArray(body.bulkIds) && body.bulkIds.length > 0) {
      const ids = body.bulkIds.map((x: unknown) => String(x));
      const data: Record<string, unknown> = { version: { increment: 1 } };
      if (body.status !== undefined) {
        data.status = String(body.status);
        data.completedAt = ['DONE', 'ACCEPTED'].includes(String(body.status)) ? new Date() : null;
      }
      if (body.priority !== undefined) data.priority = String(body.priority);
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId ? String(body.assigneeId) : null;
      if (body.sprintId !== undefined) data.sprintId = body.sprintId ? String(body.sprintId) : null;
      if (body.labelsJson !== undefined) data.labelsJson = body.labelsJson ? String(body.labelsJson) : null;

      await prisma.projectWorkItem.updateMany({
        where: { id: { in: ids } },
        data,
      });

      return NextResponse.json({ success: true, updatedCount: ids.length });
    }

    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Work item id is required.' }, { status: 400 });

    const existing = await prisma.projectWorkItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Work item not found.' }, { status: 404 });

    const nextStatus = body.status !== undefined ? String(body.status) : existing.status;
    if (nextStatus === 'ACCEPTED' && existing.reviewerId && existing.reviewerId !== actor.id && actor.role === 'STAFF') {
      return NextResponse.json({ error: 'Only the assigned reviewer or executive can accept this deliverable.' }, { status: 403 });
    }

    const updated = await prisma.projectWorkItem.update({
      where: { id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : existing.title,
        description: body.description !== undefined ? (body.description ? String(body.description) : null) : existing.description,
        status: nextStatus,
        priority: body.priority !== undefined ? String(body.priority) : existing.priority,
        itemType: body.itemType !== undefined ? String(body.itemType) : existing.itemType,
        assigneeId: body.assigneeId !== undefined ? (body.assigneeId ? String(body.assigneeId) : null) : existing.assigneeId,
        sprintId: body.sprintId !== undefined ? (body.sprintId ? String(body.sprintId) : null) : existing.sprintId,
        milestoneId: body.milestoneId !== undefined ? (body.milestoneId ? String(body.milestoneId) : null) : existing.milestoneId,
        teamId: body.teamId !== undefined ? (body.teamId ? String(body.teamId) : null) : existing.teamId,
        parentId: body.parentId !== undefined ? (body.parentId ? String(body.parentId) : null) : existing.parentId,
        startDate: body.startDate !== undefined ? (body.startDate ? String(body.startDate) : null) : existing.startDate,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? String(body.dueDate) : null) : existing.dueDate,
        storyPoints: body.storyPoints !== undefined ? (body.storyPoints !== null ? Number(body.storyPoints) : null) : existing.storyPoints,
        estimatedHours: body.estimatedHours !== undefined ? (body.estimatedHours !== null ? Number(body.estimatedHours) : null) : existing.estimatedHours,
        labelsJson: body.labelsJson !== undefined ? (body.labelsJson ? String(body.labelsJson) : null) : existing.labelsJson,
        customFieldsJson: body.customFieldsJson !== undefined ? (body.customFieldsJson ? String(body.customFieldsJson) : null) : existing.customFieldsJson,
        isBlocked: body.isBlocked !== undefined ? Boolean(body.isBlocked) : nextStatus === 'BLOCKED',
        completedAt: ['DONE', 'ACCEPTED'].includes(nextStatus) ? existing.completedAt || new Date() : null,
        version: { increment: 1 },
      },
    });

    const activityCreates: Array<{
      organizationId: string;
      projectId: string;
      workItemId: string;
      actorId: string;
      action: string;
      field: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    if (body.status !== undefined && body.status !== existing.status) {
      activityCreates.push({
        organizationId: existing.organizationId,
        projectId: existing.projectId,
        workItemId: existing.id,
        actorId: actor.id,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: existing.status,
        newValue: nextStatus,
      });

      // Execute per-column workflow automation triggers
      const columnRules = await prisma.projectAutomationRule.findMany({
        where: {
          organizationId: existing.organizationId,
          isActive: true,
          triggerType: 'COLUMN_ENTER',
        },
      });
      for (const rule of columnRules) {
        try {
          const cond = JSON.parse(rule.conditionsJson || '{}');
          const cfg = JSON.parse(rule.actionConfigJson || '{}');
          if (cond.status !== nextStatus) continue;
          if (rule.projectId && rule.projectId !== existing.projectId) continue;

          if (rule.actionType === 'ESCALATE_PRIORITY') {
            await prisma.projectWorkItem.update({
              where: { id: existing.id },
              data: { priority: String(cfg.priority || 'URGENT') },
            });
          } else if (rule.actionType === 'FLAG_PROJECT_AT_RISK') {
            await prisma.project.update({
              where: { id: existing.projectId },
              data: { healthStatus: 'AT_RISK', healthUpdateAt: new Date() },
            });
          } else if (rule.actionType === 'AUTO_ASSIGN' && cfg.assigneeId) {
            await prisma.projectWorkItem.update({
              where: { id: existing.id },
              data: { assigneeId: String(cfg.assigneeId) },
            });
          }

          await prisma.projectAutomationRule.update({
            where: { id: rule.id },
            data: { lastTriggeredAt: new Date() },
          });
          activityCreates.push({
            organizationId: existing.organizationId,
            projectId: existing.projectId,
            workItemId: existing.id,
            actorId: actor.id,
            action: 'AUTOMATION_TRIGGERED',
            field: 'rule',
            oldValue: nextStatus,
            newValue: rule.name,
          });
        } catch {}
      }
    }
    if (body.priority !== undefined && body.priority !== existing.priority) {
      activityCreates.push({
        organizationId: existing.organizationId,
        projectId: existing.projectId,
        workItemId: existing.id,
        actorId: actor.id,
        action: 'PRIORITY_CHANGED',
        field: 'priority',
        oldValue: existing.priority,
        newValue: String(body.priority),
      });
    }
    if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
      activityCreates.push({
        organizationId: existing.organizationId,
        projectId: existing.projectId,
        workItemId: existing.id,
        actorId: actor.id,
        action: 'ASSIGNED',
        field: 'assigneeId',
        oldValue: existing.assigneeId,
        newValue: body.assigneeId ? String(body.assigneeId) : null,
      });
    }
    if (activityCreates.length > 0) {
      await prisma.projectActivityLog.createMany({ data: activityCreates });
    }

    return NextResponse.json({ success: true, workItem: updated });
  } catch (error) {
    console.error('PATCH /api/projects/work-items error:', error);
    return NextResponse.json({ error: 'Failed to update work item.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'Work item id is required.' }, { status: 400 });

    const existing = await prisma.projectWorkItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Work item not found.' }, { status: 404 });

    if (!isExecutive && existing.reporterId !== actor.id) {
      return NextResponse.json({ error: 'Only the reporter or an executive can delete this work item.' }, { status: 403 });
    }

    await prisma.projectWorkItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/work-items error:', error);
    return NextResponse.json({ error: 'Failed to delete work item.' }, { status: 500 });
  }
}
