import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

const EXEC_ROLES = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];

/**
 * GET /api/control-center/admin-onboarding
 * - ?list=staff -> Returns active STAFF accounts for the searchable staff selector.
 * - ?email=...  -> Looks up a single employee by work email.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const listMode = request.nextUrl.searchParams.get('list');
    if (listMode === 'staff') {
      const staff = await prisma.employee.findMany({
        where: { role: 'STAFF', status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: {
          id: true,
          employeeNumber: true,
          legalName: true,
          workEmail: true,
          phone: true,
          role: true,
          jobTitle: true,
          assignments: {
            where: { status: 'ACTIVE' },
            take: 1,
            include: {
              subsidiary: { select: { id: true, legalName: true, code: true } },
              department: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });
      return NextResponse.json({ staff });
    }

    const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'email or list=staff query parameter is required.' }, { status: 400 });
    }

    const employee = await prisma.employee.findFirst({
      where: { workEmail: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        employeeNumber: true,
        legalName: true,
        workEmail: true,
        phone: true,
        role: true,
        status: true,
        jobTitle: true,
        customAdminProfileId: true,
        customAdminTitle: true,
        assignments: {
          where: { status: 'ACTIVE' },
          include: {
            subsidiary: { select: { id: true, legalName: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: `No existing staff account found for "${email}".` }, { status: 404 });
    }

    return NextResponse.json({ employee });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load staff onboarding data.' }, { status: 500 });
  }
}

/**
 * POST /api/control-center/admin-onboarding
 * Unified 2-way Admin Onboarding:
 * 1. mode: 'PROMOTE_STAFF' -> Select existing staff + configure access -> sends invite email to their SAME workEmail.
 *    When they click the link and submit their info on /onboard, they become an admin with that configuration.
 * 2. mode: 'INVITE_NEW'    -> Enter fresh email + configure access -> sends invite email to the new email.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const body = await request.json();
    const mode = String(body.mode || '').toUpperCase();
    const workEmail = String(body.workEmail || '').trim().toLowerCase();

    if (!workEmail) {
      return NextResponse.json({ error: 'Work email is required.' }, { status: 400 });
    }

    let profileId: string | null = body.customAdminProfileId ? String(body.customAdminProfileId) : null;
    let profileTitle: string | null = null;

    if (profileId) {
      const foundProfile = await prisma.customAdminProfile.findUnique({ where: { id: profileId } });
      if (!foundProfile) {
        return NextResponse.json({ error: 'Selected custom admin profile was not found.' }, { status: 404 });
      }
      profileTitle = foundProfile.name;
    } else if (body.inlineProfile && typeof body.inlineProfile === 'object') {
      const inlineName = String(body.inlineProfile.name || '').trim();
      if (!inlineName) {
        return NextResponse.json({ error: 'Custom admin profile name is required.' }, { status: 400 });
      }
      const existingProfile = await prisma.customAdminProfile.findFirst({
        where: { name: { equals: inlineName, mode: 'insensitive' } },
      });
      if (existingProfile) {
        profileId = existingProfile.id;
        profileTitle = existingProfile.name;
      } else {
        const createdProfile = await prisma.customAdminProfile.create({
          data: {
            name: inlineName,
            description: body.inlineProfile.description ? String(body.inlineProfile.description).trim() : null,
            permissionsJson: JSON.stringify(body.inlineProfile.permissions || {}),
            createdById: actor.id,
          },
        });
        profileId = createdProfile.id;
        profileTitle = createdProfile.name;
      }
    }

    const rootOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    let subsidiaryId = String(body.subsidiaryId || rootOrg?.id || '');
    let departmentId = body.departmentId ? String(body.departmentId) : null;
    let normalizedRole = 'SYSTEM_ADMIN';
    let recipientName = '';

    if (mode === 'PROMOTE_STAFF') {
      const existing = await prisma.employee.findFirst({
        where: { workEmail: { equals: workEmail, mode: 'insensitive' } },
        include: {
          assignments: { where: { status: 'ACTIVE' }, take: 1 },
        },
      });
      if (!existing) {
        return NextResponse.json(
          { error: `No existing staff account found with email "${workEmail}".` },
          { status: 404 }
        );
      }
      if (existing.role === 'GMD') {
        return NextResponse.json(
          { error: 'The active Group Managing Director (GMD) cannot be downgraded into a custom admin profile.' },
          { status: 400 }
        );
      }
      normalizedRole = profileId ? 'CUSTOM_ADMIN' : 'SYSTEM_ADMIN';
      recipientName = existing.legalName;
      if (!subsidiaryId && existing.assignments?.[0]?.subsidiaryId) {
        subsidiaryId = existing.assignments[0].subsidiaryId;
      }
      if (!departmentId && existing.assignments?.[0]?.departmentId) {
        departmentId = existing.assignments[0].departmentId;
      }
    } else if (mode === 'INVITE_NEW') {
      const role = String(body.role || (profileId ? 'CUSTOM_ADMIN' : 'SYSTEM_ADMIN')).toUpperCase();
      if (!['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN', 'GMD'].includes(role)) {
        return NextResponse.json(
          { error: 'Admin invitations are strictly limited to SYSTEM_ADMIN, CUSTOM_ADMIN, or GMD.' },
          { status: 400 }
        );
      }
      if (role === 'GMD') {
        normalizedRole = 'GMD';
      } else if (role === 'CUSTOM_ADMIN' || profileId) {
        normalizedRole = 'CUSTOM_ADMIN';
        if (!profileId) {
          return NextResponse.json(
            { error: 'A Custom Admin profile is required for CUSTOM_ADMIN invitations.' },
            { status: 400 }
          );
        }
      } else {
        normalizedRole = 'SYSTEM_ADMIN';
      }
      const existingEmployee = await prisma.employee.findFirst({
        where: { workEmail: { equals: workEmail, mode: 'insensitive' } },
      });
      if (existingEmployee) {
        return NextResponse.json(
          {
            error: `An account with "${workEmail}" already exists (${existingEmployee.legalName}). Select them under "Existing Staff" instead.`,
          },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid mode. Use PROMOTE_STAFF or INVITE_NEW.' }, { status: 400 });
    }

    if (!subsidiaryId) {
      return NextResponse.json({ error: 'A subsidiary / group organization is required.' }, { status: 400 });
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const positionName = String(
      body.positionName || profileTitle || (normalizedRole === 'GMD' ? 'Group Managing Director' : 'Administrator')
    ).trim();

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.adminInvitation.updateMany({
        where: { workEmail, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      return tx.adminInvitation.create({
        data: {
          workEmail,
          role: normalizedRole,
          subsidiaryId,
          departmentId,
          positionName,
          customAdminProfileId: normalizedRole === 'GMD' ? null : profileId,
          customAdminTitle: normalizedRole === 'GMD' ? null : profileTitle,
          token,
          invitedById: actor.id,
          status: 'PENDING',
          expiresAt,
        },
        include: {
          subsidiary: { select: { id: true, legalName: true } },
        },
      });
    });

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://bemserp.work';
    const onboardUrl = `${origin}/onboard?token=${encodeURIComponent(token)}`;
    const roleLabel = profileTitle || (normalizedRole === 'GMD' ? 'Group Managing Director (GMD)' : 'Administrator');

    const emailResult = await sendEmail({
      to: workEmail,
      subject: `BEMS ERP Admin Onboarding Invitation — ${roleLabel}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: #ea580c; text-transform: uppercase;">BEMS ERP · CONTROL CENTER</div>
            <h2 style="margin: 8px 0 12px; color: #0f172a; font-size: 20px;">${recipientName ? `Hello ${recipientName},` : 'Admin Access Invitation'}</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              <strong>${actor.legalName}</strong> has invited you to complete your BEMS ERP Admin onboarding as <strong>${roleLabel}</strong>${invitation.subsidiary?.legalName ? ` for <strong>${invitation.subsidiary.legalName}</strong>` : ''}.
            </p>
            <p style="color: #475569; font-size: 13px; line-height: 1.6;">
              Click the button below to confirm your information and activate your configured admin access:
            </p>
            <div style="margin: 24px 0;">
              <a href="${onboardUrl}" style="display: inline-block; background: #ea580c; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 22px; border-radius: 10px;">
                Complete Admin Onboarding →
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 11.5px; margin: 0;">
              This link expires in 7 days. If the button does not work, copy this URL: ${onboardUrl}
            </p>
          </div>
        </div>
      `,
      text: `You have been invited by ${actor.legalName} to complete your BEMS ERP Admin onboarding as ${roleLabel}. Open this link to enter your information and activate access: ${onboardUrl}`,
      eventType: 'ADMIN_ONBOARDING_INVITE',
    });

    if (rootOrg) {
      await prisma.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.legalName,
          actorRole: actor.role,
          groupId: rootOrg.id,
          targetType: 'ADMIN_INVITATION',
          targetId: invitation.id,
          action: mode === 'PROMOTE_STAFF' ? 'STAFF_ADMIN_INVITE_SENT' : 'ADMIN_INVITATION_CREATED',
          metadata: JSON.stringify({
            workEmail,
            role: normalizedRole,
            customAdminProfileId: profileId,
            customAdminTitle: profileTitle,
            emailSuccess: emailResult.success,
          }),
          correlationId: `adm-inv-${Date.now()}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      mode,
      invitation,
      emailSent: emailResult.success && !emailResult.simulated,
      message:
        emailResult.success && !emailResult.simulated
          ? `Admin onboarding email sent to ${workEmail}. Once they complete their information, configured admin access activates.`
          : `Admin onboarding link created for ${workEmail}. Copy or resend from Dispatched Invitations.`,
      inviteLink: `/onboard?token=${token}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Admin onboarding action failed.' }, { status: 500 });
  }
}
