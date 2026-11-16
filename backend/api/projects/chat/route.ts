import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext } from '@/lib/projectRouteHelper';

async function verifyProjectAccess(projectId: string, actorId: string, isExecutive: boolean) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      teamLeadId: true,
      managerId: true,
      members: { where: { employeeId: actorId }, select: { id: true } },
    },
  });
  if (!project) return { error: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  const isMember =
    isExecutive ||
    project.teamLeadId === actorId ||
    project.managerId === actorId ||
    project.members.length > 0;
  if (!isMember) {
    return { error: NextResponse.json({ error: 'Forbidden: you are not assigned to this project.' }, { status: 403 }) };
  }
  return { project };
}

export async function GET(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get('projectId') || '');
    const requestedChannelId = String(searchParams.get('channelId') || '');
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

    const access = await verifyProjectAccess(projectId, actor.id, isExecutive);
    if ('error' in access) return access.error;

    let channels = await prisma.projectChatChannel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { messages: true } } },
    });

    if (channels.length === 0) {
      await prisma.projectChatChannel.createMany({
        data: [
          {
            projectId,
            slug: 'general',
            name: 'General',
            channelType: 'GENERAL',
            description: 'Project-wide updates, announcements & cross-department sync',
            createdById: actor.id,
          },
          {
            projectId,
            slug: 'blockers-escalations',
            name: 'Blockers & Escalations',
            channelType: 'BLOCKERS',
            description: 'Urgent blockers, SLA risks & leadership escalations',
            createdById: actor.id,
          },
          {
            projectId,
            slug: 'handover-qa',
            name: 'Handover & QA',
            channelType: 'HANDOVER',
            description: 'Documentation, credentials handover & QA sign-offs',
            createdById: actor.id,
          },
        ],
        skipDuplicates: true,
      });
      channels = await prisma.projectChatChannel.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { messages: true } } },
      });
    }

    const activeChannelId =
      requestedChannelId && channels.some((c) => c.id === requestedChannelId)
        ? requestedChannelId
        : channels[0]?.id || '';

    const messages = activeChannelId
      ? await prisma.projectChatMessage.findMany({
          where: { channelId: activeChannelId },
          orderBy: { createdAt: 'asc' },
          take: 250,
          include: {
            author: { select: { id: true, legalName: true, jobTitle: true } },
          },
        })
      : [];

    return NextResponse.json({
      success: true,
      channels,
      activeChannelId,
      messages,
    });
  } catch (error) {
    console.error('GET /api/projects/chat error:', error);
    return NextResponse.json({ error: 'Failed to load project chat.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const body = await req.json();
    const action = String(body.action || 'SEND_MESSAGE');

    if (action === 'CREATE_CHANNEL') {
      const projectId = String(body.projectId || '');
      const name = String(body.name || '').trim();
      if (!projectId || !name) {
        return NextResponse.json({ error: 'projectId and channel name are required.' }, { status: 400 });
      }
      const access = await verifyProjectAccess(projectId, actor.id, isExecutive);
      if ('error' in access) return access.error;

      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'group';
      const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

      const channel = await prisma.projectChatChannel.create({
        data: {
          projectId,
          departmentId: body.departmentId ? String(body.departmentId) : null,
          channelType: String(body.channelType || 'DEPARTMENT'),
          slug,
          name,
          description: body.description ? String(body.description).trim() : null,
          createdById: actor.id,
        },
      });
      return NextResponse.json({ success: true, channel });
    }

    if (action === 'SEND_MESSAGE') {
      const projectId = String(body.projectId || '');
      const channelId = String(body.channelId || '');
      const text = String(body.body || '').trim();
      if (!projectId || !channelId || !text) {
        return NextResponse.json({ error: 'projectId, channelId, and message body are required.' }, { status: 400 });
      }
      const access = await verifyProjectAccess(projectId, actor.id, isExecutive);
      if ('error' in access) return access.error;

      const message = await prisma.projectChatMessage.create({
        data: {
          projectId,
          channelId,
          authorId: actor.id,
          parentMessageId: body.parentMessageId ? String(body.parentMessageId) : null,
          body: text,
          isAnnouncement: Boolean(body.isAnnouncement) && (isExecutive || access.project.teamLeadId === actor.id),
          linkedWorkItemId: body.linkedWorkItemId ? String(body.linkedWorkItemId) : null,
          attachmentsJson:
            Array.isArray(body.attachments) && body.attachments.length > 0
              ? JSON.stringify(body.attachments)
              : null,
        },
        include: {
          author: { select: { id: true, legalName: true, jobTitle: true } },
        },
      });
      return NextResponse.json({ success: true, message });
    }

    if (action === 'TOGGLE_REACTION') {
      const messageId = String(body.messageId || '');
      const emoji = String(body.emoji || '').trim();
      if (!messageId || !emoji) {
        return NextResponse.json({ error: 'messageId and emoji are required.' }, { status: 400 });
      }
      const existing = await prisma.projectChatMessage.findUnique({ where: { id: messageId } });
      if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

      let map: Record<string, string[]> = {};
      try {
        map = existing.reactionsJson ? JSON.parse(existing.reactionsJson) : {};
      } catch {}
      const list = Array.isArray(map[emoji]) ? map[emoji] : [];
      map[emoji] = list.includes(actor.id)
        ? list.filter((id) => id !== actor.id)
        : [...list, actor.id];

      const updated = await prisma.projectChatMessage.update({
        where: { id: messageId },
        data: { reactionsJson: JSON.stringify(map) },
      });
      return NextResponse.json({ success: true, message: updated });
    }

    if (action === 'TOGGLE_PIN') {
      const messageId = String(body.messageId || '');
      if (!messageId) return NextResponse.json({ error: 'messageId is required.' }, { status: 400 });
      const existing = await prisma.projectChatMessage.findUnique({
        where: { id: messageId },
        include: { project: { select: { teamLeadId: true } } },
      });
      if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
      if (!isExecutive && existing.project.teamLeadId !== actor.id) {
        return NextResponse.json({ error: 'Only Executives or Team Lead can pin messages.' }, { status: 403 });
      }
      const updated = await prisma.projectChatMessage.update({
        where: { id: messageId },
        data: { isPinned: !existing.isPinned },
      });
      return NextResponse.json({ success: true, message: updated });
    }

    return NextResponse.json({ error: 'Unsupported chat action.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/projects/chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat action.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive } = ctx;

    const { searchParams } = new URL(req.url);
    const messageId = String(searchParams.get('messageId') || '');
    if (!messageId) return NextResponse.json({ error: 'messageId is required.' }, { status: 400 });

    const existing = await prisma.projectChatMessage.findUnique({ where: { id: messageId } });
    if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
    if (!isExecutive && existing.authorId !== actor.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    await prisma.projectChatMessage.delete({ where: { id: messageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/chat error:', error);
    return NextResponse.json({ error: 'Failed to delete message.' }, { status: 500 });
  }
}

