import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  logOpsAudit,
  requireCustomAdminOpsAction,
  resolveOperationsContext,
} from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organizationId') || '';

    const where: Record<string, any> = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    const sites = await prisma.opsSite.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ sites });
  } catch (error) {
    console.error('Operations sites GET error:', error);
    return NextResponse.json({ error: 'Could not load operations sites.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_setup', 'manage_sites_services');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    const codeInput = String(body?.code || '').trim().toUpperCase();
    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and site name are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const code = codeInput || `SITE-${Date.now().toString().slice(-6)}`;
    const site = await prisma.opsSite.create({
      data: {
        organizationId,
        departmentId: body?.departmentId || null,
        code,
        name,
        siteType: String(body?.siteType || 'OFFICE').toUpperCase(),
        stateRegion: body?.stateRegion ? String(body.stateRegion).trim() : null,
        address: body?.address ? String(body.address).trim() : null,
        timeZone: String(body?.timeZone || 'Africa/Lagos'),
        contactName: body?.contactName ? String(body.contactName).trim() : null,
        contactPhone: body?.contactPhone ? String(body.contactPhone).trim() : null,
        supervisorId: body?.supervisorId || null,
        status: 'ACTIVE',
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_SITE_CREATED',
      targetType: 'OPS_SITE',
      targetId: site.id,
      subsidiaryId: site.organizationId,
      metadata: { code: site.code, name: site.name, siteType: site.siteType },
    });

    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error('Operations sites POST error:', error);
    return NextResponse.json({ error: 'Could not create operations site.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_setup', 'manage_sites_services');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Site id is required.' }, { status: 400 });

    const existing = await prisma.opsSite.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const updated = await prisma.opsSite.update({
      where: { id },
      data: {
        name: body?.name ? String(body.name).trim() : existing.name,
        siteType: body?.siteType ? String(body.siteType).toUpperCase() : existing.siteType,
        stateRegion: body?.stateRegion !== undefined ? (body.stateRegion ? String(body.stateRegion).trim() : null) : existing.stateRegion,
        address: body?.address !== undefined ? (body.address ? String(body.address).trim() : null) : existing.address,
        contactName: body?.contactName !== undefined ? (body.contactName ? String(body.contactName).trim() : null) : existing.contactName,
        contactPhone: body?.contactPhone !== undefined ? (body.contactPhone ? String(body.contactPhone).trim() : null) : existing.contactPhone,
        supervisorId: body?.supervisorId !== undefined ? (body.supervisorId || null) : existing.supervisorId,
        status: body?.status ? String(body.status).toUpperCase() : existing.status,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_SITE_UPDATED',
      targetType: 'OPS_SITE',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: { code: updated.code, status: updated.status },
    });

    return NextResponse.json({ site: updated });
  } catch (error) {
    console.error('Operations sites PATCH error:', error);
    return NextResponse.json({ error: 'Could not update operations site.' }, { status: 500 });
  }
}
