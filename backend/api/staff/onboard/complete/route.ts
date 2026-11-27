import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { createEmployeeSession, getSessionCookieOptions, hashPassword, invalidateSessionCache, publicEmployee, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  assertSingleActiveGmd,
  assertSingleActiveSystemAdmin,
  LifecycleAuthorizationError,
} from '@/lib/employee-lifecycle';

export const dynamic = 'force-dynamic';

const ALLOWED_INVITE_ROLES = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN', 'GMD', 'STAFF'] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const legalName = typeof body.legalName === 'string' ? body.legalName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
    const password = typeof body.password === 'string' ? body.password : '';
    const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : null;
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : null;
    const accountName = typeof body.accountName === 'string' ? body.accountName.trim() : null;
    const residentialAddress = typeof body.residentialAddress === 'string' ? body.residentialAddress.trim() : null;
    const cityState = typeof body.cityState === 'string' ? body.cityState.trim() : null;
    const gender = typeof body.gender === 'string' ? body.gender.trim() : null;

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is missing.' }, { status: 400 });
    }

    if (!password || password.length > 256) {
      return NextResponse.json({ error: 'Enter your account password (up to 256 characters).' }, { status: 400 });
    }

    // 1. Verify invitation token
    const invitation = await prisma.adminInvitation.findUnique({
      where: { token },
      include: {
        subsidiary: { select: { id: true, legalName: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation link was not found or has expired.' }, { status: 404 });
    }

    if ((invitation.status === 'COMPLETED' || invitation.status === 'ACCEPTED') && invitation.role !== 'CUSTOM_ADMIN') {
      return NextResponse.json({ error: 'This invitation has already been completed. Please sign in directly.' }, { status: 400 });
    }

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'This invitation has been revoked by an administrator.' }, { status: 403 });
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: 'This invitation has expired after 7 days. Please request a new invite.' }, { status: 410 });
    }

    if (!ALLOWED_INVITE_ROLES.includes(invitation.role as any)) {
      return NextResponse.json(
        { error: 'This invitation specifies a non-executive role and cannot be completed here.' },
        { status: 403 }
      );
    }

    // 2. Check existing accounts on this email (never overwrite a STAFF row when creating an Admin account)
    const accountsForEmail = await prisma.employee.findMany({
      where: { workEmail: { equals: invitation.workEmail, mode: 'insensitive' } },
      select: { id: true, legalName: true, role: true, passwordHash: true, status: true, approvalStatus: true },
    });

    const isCustomAdmin = invitation.role === 'CUSTOM_ADMIN';
    const resolvedLegalName = legalName || accountsForEmail[0]?.legalName || '';
    if (!isCustomAdmin && (!resolvedLegalName || resolvedLegalName.length < 2)) {
      return NextResponse.json({ error: 'Please enter your full legal name.' }, { status: 400 });
    }
    const staffAccount = accountsForEmail.find(account => (account.role === 'STAFF' || account.role === 'CUSTOM_ADMIN') && account.status === 'ACTIVE' && account.approvalStatus === 'APPROVED');
    if (isCustomAdmin) {
      if (!staffAccount || accountsForEmail.length !== 1 || !invitation.customAdminProfileId) {
        throw new LifecycleAuthorizationError('Custom Admin access requires one active staff account and an assigned permission profile. Existing duplicate accounts must be reviewed first.', 409);
      }
      if (!await verifyPassword(password, staffAccount.passwordHash)) {
        throw new LifecycleAuthorizationError('Enter your current staff password to activate delegated access.', 403);
      }
    } else if (password.length < 10) {
      throw new LifecycleAuthorizationError('Password must be at least 10 characters long.', 400);
    }
    const existingGmd = accountsForEmail.find((a) => a.role === 'GMD');
    if (existingGmd && invitation.role !== 'GMD') {
      return NextResponse.json(
        { error: `An active GMD account already exists for ${invitation.workEmail}.` },
        { status: 409 }
      );
    }

    const existing =
      isCustomAdmin ? staffAccount! : invitation.role === 'STAFF'
        ? accountsForEmail.find((a) => a.role === 'STAFF') || null
        : accountsForEmail.find((a) => a.role !== 'STAFF') || null;

    for (const sibling of accountsForEmail) {
      if (existing && sibling.id === existing.id) continue;
      if (sibling.passwordHash && (await verifyPassword(password, sibling.passwordHash))) {
        return NextResponse.json(
          {
            error:
              'Your Admin password must be different from your Staff password so the system can distinguish which portal to open.',
          },
          { status: 400 }
        );
      }
    }

    // 4. Create Employee, Assignment, consume Invitation, and write AuditEvent in a transaction
    const rolePrefix = invitation.role.replace(/_/g, '').slice(0, 3).toUpperCase();
    const employeeNumber = `BEMS-${rolePrefix}-${Date.now().toString().slice(-4)}`;
    const passwordHash = await hashPassword(password);

    const role = invitation.role === 'SUPER_ADMIN' ? 'SYSTEM_ADMIN' : invitation.role;
    if (!isCustomAdmin && existing && existing.role !== role && !(role === 'SYSTEM_ADMIN' && existing.role === 'SUPER_ADMIN')) {
      throw new LifecycleAuthorizationError('This email already has a different administrative role. Review the account before continuing.', 409);
    }
    const employee = await prisma.$transaction(async (tx) => {
      // Re-check invitation status atomically inside transaction
      const consumeResult = await tx.adminInvitation.updateMany({
        where: {
          id: invitation.id,
          status: isCustomAdmin ? { in: ['PENDING', 'COMPLETED', 'ACCEPTED'] } : 'PENDING',
        },
        data: { status: 'COMPLETED' },
      });
      if (consumeResult.count === 0) {
        throw new LifecycleAuthorizationError('This invitation has already been consumed or revoked.', 409);
      }

      if (invitation.role === 'GMD') await assertSingleActiveGmd(existing?.id, tx);
      if (invitation.role === 'SYSTEM_ADMIN' || invitation.role === 'SUPER_ADMIN') await assertSingleActiveSystemAdmin(existing?.id, tx);
      if (isCustomAdmin) {
        const changed = await tx.employee.updateMany({
          where: { id: staffAccount!.id, role: { in: ['STAFF', 'CUSTOM_ADMIN'] }, status: 'ACTIVE', approvalStatus: 'APPROVED', passwordHash: staffAccount!.passwordHash },
          data: { role: 'CUSTOM_ADMIN', customAdminProfileId: invitation.customAdminProfileId, customAdminTitle: invitation.customAdminTitle },
        });
        if (changed.count !== 1) throw new LifecycleAuthorizationError('The staff account changed. Ask for a new invitation.', 409);
        const promoted = await tx.employee.findUniqueOrThrow({ where: { id: staffAccount!.id }, include: { customAdminProfile: true } });
        await tx.authSession.deleteMany({ where: { employeeId: promoted.id } });
        await tx.auditEvent.create({ data: {
          actorId: promoted.id, actorName: promoted.legalName, actorRole: promoted.role,
          groupId: 'BEMS-GROUP', subsidiaryId: invitation.subsidiaryId, targetType: 'EMPLOYEE', targetId: promoted.id,
          action: 'CUSTOM_ADMIN_ACCESS_ACTIVATED', correlationId: invitation.id,
          metadata: JSON.stringify({ invitedById: invitation.invitedById, profileId: invitation.customAdminProfileId }),
        } });
        return promoted;
      }

      const created = existing
        ? await tx.employee.update({
            where: { id: existing.id },
            data: {
              legalName: legalName || undefined,
              phone: phone || undefined,
              role,
              status: 'ACTIVE',
              approvalStatus: 'APPROVED',
              passwordHash,
              jobTitle: invitation.positionName || invitation.customAdminTitle || invitation.role,
              customAdminProfileId: invitation.customAdminProfileId || null,
              customAdminTitle: invitation.customAdminTitle || null,
              ...(bankName ? { bankName } : {}),
              ...(accountNumber ? { accountNumber } : {}),
              ...(accountName ? { accountName } : {}),
              ...(residentialAddress ? { residentialAddress } : {}),
              ...(cityState ? { cityState } : {}),
              ...(gender ? { gender } : {}),
            },
          })
        : await tx.employee.create({
            data: {
              employeeNumber,
              legalName,
              workEmail: invitation.workEmail,
              phone,
              role,
              status: 'ACTIVE',
              approvalStatus: 'APPROVED',
              passwordHash,
              jobTitle: invitation.positionName || invitation.customAdminTitle || invitation.role,
              customAdminProfileId: invitation.customAdminProfileId || null,
              customAdminTitle: invitation.customAdminTitle || null,
              bankName,
              accountNumber,
              accountName: accountName || legalName,
              residentialAddress,
              cityState,
              gender,
            },
          });

      if (!existing) {
        await tx.employeeAssignment.create({
          data: {
            employeeId: created.id,
            subsidiaryId: invitation.subsidiaryId,
            departmentId: invitation.departmentId || null,
            positionName: invitation.positionName || invitation.role,
            isPrimary: true,
            status: 'ACTIVE',
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: created.id,
          actorName: created.legalName,
          actorRole: created.role,
          groupId: 'BEMS-GROUP',
          subsidiaryId: invitation.subsidiaryId,
          targetType: 'EMPLOYEE',
          targetId: created.id,
          action: 'EXECUTIVE_INVITE_COMPLETED',
          metadata: JSON.stringify({
            invitationId: invitation.id,
            invitedById: invitation.invitedById,
            role: created.role,
            workEmail: created.workEmail,
          }),
          correlationId: crypto.randomUUID(),
        },
      });

      return created;
    }, { isolationLevel: 'Serializable' });

    // 5. Establish authenticated session and direct login
    if (isCustomAdmin) invalidateSessionCache();
    const session = await createEmployeeSession(employee.id);
    const res = NextResponse.json({
      success: true,
      user: publicEmployee(employee),
      token: session.token,
      message: `Welcome to BEMS Group, ${employee.legalName}. Your executive profile is active.`,
    });

    res.cookies.set('bems_session', session.token, getSessionCookieOptions(session.expiresAt));

    return res;
  } catch (error) {
    if (error instanceof LifecycleAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      return NextResponse.json({ error: 'The account or executive seat changed while accepting this invitation. Review its availability and try again.' }, { status: 409 });
    }
    console.error('Error in POST /api/staff/onboard/complete:', error);
    return NextResponse.json({ error: 'Could not complete onboarding. Please try again.' }, { status: 500 });
  }
}
