import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { parsePermissionsJson } from '@/lib/admin-permissions';

const EXEC_ROLES = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding', 'create_edit_admin_profiles')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const profiles = await prisma.customAdminProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            employees: true,
            invitations: true,
          },
        },
      },
    });

    return NextResponse.json({
      profiles: profiles.map((p) => ({
        ...p,
        permissions: parsePermissionsJson(p.permissionsJson),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load admin profiles.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding', 'create_edit_admin_profiles')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const description = body.description ? String(body.description).trim() : null;
    const permissions = body.permissions && typeof body.permissions === 'object' ? body.permissions : {};

    if (!name) {
      return NextResponse.json({ error: 'Custom admin profile name is required.' }, { status: 400 });
    }

    const existing = await prisma.customAdminProfile.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json({ error: `A custom admin profile named "${name}" already exists.` }, { status: 409 });
    }

    const created = await prisma.customAdminProfile.create({
      data: {
        name,
        description,
        permissionsJson: JSON.stringify(permissions),
        createdById: actor.id,
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        ...created,
        permissions: parsePermissionsJson(created.permissionsJson),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create custom admin profile.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding', 'create_edit_admin_profiles')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Profile id is required.' }, { status: 400 });
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined;
    const permissionsJson =
      body.permissions !== undefined && typeof body.permissions === 'object'
        ? JSON.stringify(body.permissions)
        : undefined;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined;

    const updated = await prisma.customAdminProfile.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(permissionsJson !== undefined ? { permissionsJson } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    if (name) {
      await prisma.employee.updateMany({
        where: { customAdminProfileId: id },
        data: { customAdminTitle: name },
      });
    }

    return NextResponse.json({
      success: true,
      profile: {
        ...updated,
        permissions: parsePermissionsJson(updated.permissionsJson),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update custom admin profile.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES) || !hasEmployeePermission(actor, 'control-center', 'onboarding', 'create_edit_admin_profiles')) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Profile id is required.' }, { status: 400 });
    }

    await prisma.customAdminProfile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete custom admin profile.' }, { status: 500 });
  }
}

