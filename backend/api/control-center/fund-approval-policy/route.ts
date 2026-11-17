import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, verifyPassword } from '@/lib/auth';
import { canApproveWalletRelease, fundApprovalOrganization, getFundApprovalPolicy, setFundApprovalPolicy } from '@/lib/gmd-access';
import { checkRateLimit } from '@/lib/rate-limiter';
import { sessionBinding } from '@/lib/wallet/security';
import { invalidateServerCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';
const roles = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];
const forbidden = () => NextResponse.json({ error: 'Only the designated GMD can change fund approval authority.' }, { status: 403 });

export async function GET(request: Request) {
  const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true });
  if (!actor || !roles.includes(actor.role)) return forbidden();
  const canEdit = canApproveWalletRelease(actor);
  const policy = await getFundApprovalPolicy();
  const candidates = canEdit ? await prisma.employee.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'SYSTEM_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED' },
    select: { id: true, legalName: true, employeeNumber: true },
    orderBy: { legalName: 'asc' },
  }) : [];
  return NextResponse.json({ ...policy, candidates, canEdit, hardLockedByEnv: process.env.BEMS_SUPER_ADMIN_GMD_ACCESS === 'false' }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true });
  if (!actor || !canApproveWalletRelease(actor)) return forbidden();
  const origin = request.headers.get('origin');
  const bearer = /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
  if ((origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_APP_URL) || (!origin && !bearer)) return forbidden();
  try {
    await sessionBinding(request, actor.id);
  } catch {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  if (!body || (body.delegateId !== null && (typeof body.delegateId !== 'string' || !body.delegateId || body.delegateId.length > 128))
    || typeof body.password !== 'string' || !body.password || body.password.length > 256) {
    return NextResponse.json({ error: 'Choose an approver or GMD only, and enter your current password.' }, { status: 400 });
  }
  if (body.delegateId && process.env.BEMS_SUPER_ADMIN_GMD_ACCESS === 'false') return forbidden();

  const rate = await checkRateLimit('fund-approval-policy:' + actor.id, { windowMs: 60000, maxAttempts: 5 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 });

  const verified = await prisma.employee.findUnique({ where: { id: actor.id } });
  if (!verified || !(await verifyPassword(body.password, verified.passwordHash))) return forbidden();

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('bems-wallet-pool-v1', 0))`;
    const current = await tx.employee.findUnique({ where: { id: actor.id } });
    if (!current || !canApproveWalletRelease(current) || current.status !== 'ACTIVE'
      || current.approvalStatus !== 'APPROVED' || current.passwordHash !== verified.passwordHash) return forbidden();
    const organization = await fundApprovalOrganization(tx);
    if (!organization) return NextResponse.json({ error: 'No active group is configured.' }, { status: 409 });
    if (body.delegateId) {
      const delegate = await tx.employee.findFirst({
        where: { id: body.delegateId, role: { in: ['SUPER_ADMIN', 'SYSTEM_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED', passwordHash: { not: null } },
        select: { id: true },
      });
      if (!delegate) return NextResponse.json({ error: 'Choose an active administrator with an account password.' }, { status: 400 });
    }
    const previous = await getFundApprovalPolicy(tx);
    await setFundApprovalPolicy(tx, organization.id, current.id, body.delegateId);
    await tx.auditEvent.create({
      data: {
        actorId: current.id, actorName: current.legalName, actorRole: current.role,
        groupId: organization.id, subsidiaryId: organization.id, targetType: 'FUND_APPROVAL_POLICY',
        targetId: organization.id, action: 'GMD_FUND_APPROVAL_POLICY_UPDATED', correlationId: randomUUID(),
        metadata: JSON.stringify({ previousDelegateId: previous.delegateId, delegateId: body.delegateId }),
      },
    });
    return NextResponse.json({ success: true, delegateId: body.delegateId });
  });
  if (result.ok) invalidateServerCache();
  return result;
}
