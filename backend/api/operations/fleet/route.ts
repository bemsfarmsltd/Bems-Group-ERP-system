import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logOpsAudit, requireCustomAdminOpsAction, resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const where: Record<string, any> =
      ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    if (ctx.isStaff) where.driverId = ctx.actor.id;

    const vehicles = await prisma.opsFleetVehicle.findMany({
      where,
      orderBy: { plateNumber: 'asc' },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
      take: 100,
    });

    return NextResponse.json({
      vehicles: vehicles.map((v) => ({
        ...v,
        logs: v.logs.map((l) => ({ ...l, fuelCostMinor: l.fuelCostMinor.toString() })),
      })),
    });
  } catch (error) {
    console.error('Ops fleet GET error:', error);
    return NextResponse.json({ error: 'Could not load fleet vehicles.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_resources', 'manage_assets_fleet');
    if (denied) return denied;

    const body = await request.json();

    if (body?.vehicleId) {
      const vehicleId = String(body.vehicleId).trim();
      const tripPurpose = String(body?.tripPurpose || '').trim();
      if (!tripPurpose) return NextResponse.json({ error: 'tripPurpose is required.' }, { status: 400 });

      const vehicle = await prisma.opsFleetVehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) return NextResponse.json({ error: 'Vehicle not found.' }, { status: 404 });
      if (ctx.useSubFilter && !ctx.allowedSubIds.includes(vehicle.organizationId)) {
        return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
      }

      const endKm = body?.endKm !== undefined && body?.endKm !== '' ? Number(body.endKm) : null;
      const log = await prisma.opsFleetLog.create({
        data: {
          vehicleId: vehicle.id,
          workOrderId: body?.workOrderId || null,
          driverId: body?.driverId || vehicle.driverId || ctx.actor.id,
          tripPurpose,
          startKm: Number(body?.startKm ?? vehicle.odometerKm),
          endKm,
          fuelCostMinor: BigInt(Math.max(0, Math.floor(Number(body?.fuelCostMinor || 0)))),
        },
      });
      if (endKm !== null && endKm > vehicle.odometerKm) {
        await prisma.opsFleetVehicle.update({ where: { id: vehicle.id }, data: { odometerKm: endKm } });
      }
      return NextResponse.json({ log: { ...log, fuelCostMinor: log.fuelCostMinor.toString() } }, { status: 201 });
    }

    const organizationId = String(body?.organizationId || '').trim();
    const plateNumber = String(body?.plateNumber || '').trim().toUpperCase();
    const model = String(body?.model || '').trim();
    if (!organizationId || !plateNumber || !model) {
      return NextResponse.json({ error: 'organizationId, plateNumber, and model are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const vehicle = await prisma.opsFleetVehicle.create({
      data: {
        organizationId,
        siteId: body?.siteId || null,
        plateNumber,
        model,
        driverId: body?.driverId || null,
        odometerKm: Math.max(0, Math.floor(Number(body?.odometerKm || 0))),
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_VEHICLE_REGISTERED',
      targetType: 'OPS_VEHICLE',
      targetId: vehicle.id,
      subsidiaryId: vehicle.organizationId,
      metadata: { plateNumber: vehicle.plateNumber, model: vehicle.model },
    });

    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    console.error('Ops fleet POST error:', error);
    return NextResponse.json({ error: 'Could not process fleet request.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_resources', 'manage_assets_fleet');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    const existing = id ? await prisma.opsFleetVehicle.findUnique({ where: { id } }) : null;
    if (!existing) return NextResponse.json({ error: 'Vehicle not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const updated = await prisma.opsFleetVehicle.update({
      where: { id },
      data: {
        status: body?.status ? String(body.status).toUpperCase() : existing.status,
        driverId: body?.driverId !== undefined ? body.driverId || null : existing.driverId,
      },
    });
    return NextResponse.json({ vehicle: updated });
  } catch (error) {
    console.error('Ops fleet PATCH error:', error);
    return NextResponse.json({ error: 'Could not update vehicle.' }, { status: 500 });
  }
}
