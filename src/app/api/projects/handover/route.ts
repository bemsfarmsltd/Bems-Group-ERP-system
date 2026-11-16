import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveProjectContext, logProjectAudit } from '@/lib/projectRouteHelper';
import {
  encryptCredentialSecret,
  decryptCredentialSecret,
  canRevealProjectCredential,
} from '@/lib/credentialVault';

export async function POST(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive, defaultOrgId } = ctx;

    const body = await req.json();
    const action = String(body.action || 'SUBMIT_HANDOVER');
    const projectId = String(body.projectId || '');
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

    if (action === 'VERIFY_HANDOVER') {
      const handoverId = String(body.handoverId || '');
      if (!handoverId) return NextResponse.json({ error: 'handoverId is required.' }, { status: 400 });
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { teamLeadId: true } });
      if (!isExecutive && project?.teamLeadId !== actor.id) {
        return NextResponse.json(
          { error: 'Only GMD, Super Admin, or the Project Team Lead can verify staff handovers.' },
          { status: 403 }
        );
      }
      const handover = await prisma.projectStaffHandover.update({
        where: { id: handoverId },
        data: { submissionStatus: 'VERIFIED', verifiedById: actor.id, verifiedAt: new Date() },
      });
      return NextResponse.json({ success: true, handover });
    }

    const employeeId = body.employeeId && isExecutive ? String(body.employeeId) : actor.id;
    const technologiesUsedJson = Array.isArray(body.technologies)
      ? JSON.stringify(body.technologies)
      : body.technologiesUsedJson
      ? String(body.technologiesUsedJson)
      : '[]';

    const handover = await prisma.projectStaffHandover.upsert({
      where: { projectId_employeeId: { projectId, employeeId } },
      update: {
        docTitle: body.docTitle ? String(body.docTitle).trim() : null,
        docUrl: body.docUrl ? String(body.docUrl).trim() : null,
        docSummary: body.docSummary ? String(body.docSummary).trim() : null,
        technologiesUsedJson,
        submissionStatus: 'SUBMITTED',
        submittedAt: new Date(),
      },
      create: {
        projectId,
        employeeId,
        docTitle: body.docTitle ? String(body.docTitle).trim() : null,
        docUrl: body.docUrl ? String(body.docUrl).trim() : null,
        docSummary: body.docSummary ? String(body.docSummary).trim() : null,
        technologiesUsedJson,
        submissionStatus: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, legalName: true, employeeNumber: true, jobTitle: true } },
      },
    });

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: defaultOrgId,
      targetType: 'PROJECT_HANDOVER',
      targetId: handover.id,
      action: 'STAFF_HANDOVER_SUBMITTED',
      metadata: { projectId, employeeId, docTitle: handover.docTitle },
    });

    return NextResponse.json({ success: true, handover });
  } catch (error) {
    console.error('POST /api/projects/handover error:', error);
    return NextResponse.json({ error: 'Failed to submit project handover.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const body = await req.json();
    const projectId = String(body.projectId || '');
    const toolName = String(body.toolName || '').trim();
    const username = String(body.username || '').trim();
    const secret = String(body.secret || '');
    if (!projectId || !toolName || !username || !secret) {
      return NextResponse.json(
        { error: 'projectId, toolName, username, and password/secret are required.' },
        { status: 400 }
      );
    }

    const encrypted = encryptCredentialSecret(secret);
    const entry = await prisma.projectCredentialEntry.create({
      data: {
        projectId,
        employeeId: actor.id,
        toolName,
        category: String(body.category || 'TECH_STACK'),
        environment: String(body.environment || 'PROD'),
        loginUrl: body.loginUrl ? String(body.loginUrl).trim() : null,
        username,
        encryptedSecret: encrypted.encryptedSecret,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        notes: body.notes ? String(body.notes).trim() : null,
      },
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
    });

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: defaultOrgId,
      targetType: 'PROJECT_CREDENTIAL',
      targetId: entry.id,
      action: 'CREDENTIAL_STORED',
      metadata: { projectId, toolName, category: entry.category },
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('PUT /api/projects/handover error:', error);
    return NextResponse.json({ error: 'Failed to store encrypted credential.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, defaultOrgId } = ctx;

    const body = await req.json();
    const credentialId = String(body.credentialId || '');
    if (!credentialId) return NextResponse.json({ error: 'credentialId is required.' }, { status: 400 });

    const entry = await prisma.projectCredentialEntry.findUnique({
      where: { id: credentialId },
      include: { project: { select: { id: true, teamLeadId: true, organizationId: true } } },
    });
    if (!entry) return NextResponse.json({ error: 'Credential entry not found.' }, { status: 404 });

    const allowed = canRevealProjectCredential({
      role: actor.role,
      actorId: actor.id,
      entryEmployeeId: entry.employeeId,
      projectTeamLeadId: entry.project.teamLeadId,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: only GMD, Super Admin, the Project Team Lead, or the submitter can reveal this credential.' },
        { status: 403 }
      );
    }

    const secret = decryptCredentialSecret({
      encryptedSecret: entry.encryptedSecret,
      iv: entry.iv,
      authTag: entry.authTag,
    });

    await logProjectAudit({
      actorId: actor.id,
      actorName: actor.legalName,
      actorRole: actor.role,
      groupId: entry.project.organizationId,
      subsidiaryId: entry.project.organizationId,
      targetType: 'PROJECT_CREDENTIAL',
      targetId: entry.id,
      action: 'CREDENTIAL_REVEALED',
      metadata: { toolName: entry.toolName, projectId: entry.projectId },
    });

    return NextResponse.json({ success: true, secret });
  } catch (error) {
    console.error('PATCH /api/projects/handover error:', error);
    return NextResponse.json({ error: 'Failed to decrypt credential.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await resolveProjectContext(req);
    if ('error' in ctx) return ctx.error;
    const { actor, isExecutive, defaultOrgId } = ctx;

    const { searchParams } = new URL(req.url);
    const credentialId = String(searchParams.get('credentialId') || '');
    if (!credentialId) return NextResponse.json({ error: 'credentialId is required.' }, { status: 400 });

    const existing = await prisma.projectCredentialEntry.findUnique({ where: { id: credentialId } });
    if (!existing) return NextResponse.json({ error: 'Credential entry not found.' }, { status: 404 });
    if (!isExecutive && existing.employeeId !== actor.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    await prisma.projectCredentialEntry.delete({ where: { id: credentialId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/projects/handover error:', error);
    return NextResponse.json({ error: 'Failed to delete credential.' }, { status: 500 });
  }
}

