import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { toSystemRequestId } from '@/lib/request-id';
import { resolveAuthorizedOrganizationScope } from '@/lib/organizations';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) return NextResponse.json({ error: 'Sign in to view requests.' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const subsidiaryCode = searchParams.get('subsidiary');
    const statusParam = searchParams.get('status');

    // Build query conditions
    const whereCondition: any = {};
    const canViewApprovals =
      hasAnyRole(actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD']) ||
      (hasAnyRole(actor, ['CUSTOM_ADMIN']) && hasEmployeePermission(actor, 'finance', 'Approvals & payments', 'view_approvals'));
    if (actor.role === 'STAFF' || (actor.role === 'CUSTOM_ADMIN' && !canViewApprovals)) {
      whereCondition.requestedById = actor.id;
    } else if (!canViewApprovals) {
      return NextResponse.json({ error: 'You do not have access to request records.' }, { status: 403 });
    }
    const scopedOrgIds = await resolveAuthorizedOrganizationScope(actor, subsidiaryCode, canViewApprovals ? 'finance' : 'staff');
    whereCondition.subsidiaryId = { in: scopedOrgIds.organizationIds };

    if (statusParam && statusParam !== 'ALL') {
      if (statusParam === 'PENDING') {
        whereCondition.approvalStatus = { in: ['SUBMITTED', 'IN_REVIEW', 'CLARIFICATION_REQUESTED'] };
      } else {
        whereCondition.approvalStatus = statusParam;
      }
    }

    const [requests, organizations, budgets] = await Promise.all([
      prisma.expenditureRequest.findMany({
        where: whereCondition,
        include: {
          subsidiary: true,
          requester: {
            include: {
              assignments: {
                include: {
                  department: true,
                },
              },
            },
          },
          vendor: true,
          approvalSteps: {
            orderBy: { stageIndex: 'asc' },
          },
          attachments: {
            orderBy: { uploadedAt: 'desc' },
          },
          channel: {
            include: {
              messages: {
                where: { visibility: 'GROUP' },
                orderBy: { createdAt: 'desc' },
                take: 5,
              },
            },
          },
        },
        orderBy: [{ amountMinor: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.organization.findMany({
        where: { id: { in: scopedOrgIds.organizationIds } },
        select: { id: true, code: true, legalName: true },
        orderBy: { code: 'asc' },
      }),
      canViewApprovals ? prisma.$queryRaw<Array<{ organizationId: string; parentId: string | null; allocatedMinor: bigint; remainingMinor: bigint }>>`
        SELECT "organizationId", "parentId", "allocatedMinor", "remainingMinor"
        FROM "WalletBudgetEnvelope"
        WHERE "status" = 'ACTIVE'
      ` : Promise.resolve([]),
    ]);

    const now = new Date().getTime();

    const formattedRequests = requests.map((req) => {
      const amountNgn = Number(req.amountMinor) / 100;
      const neededByTime = new Date(req.neededBy).getTime();
      const hoursRemaining = Math.round((neededByTime - now) / (1000 * 60 * 60));
      const isUrgent = hoursRemaining <= 48 && req.approvalStatus !== 'APPROVED' && req.approvalStatus !== 'REJECTED';

      const tierLevel = amountNgn > 2000000 ? 3 : amountNgn > 500000 ? 2 : 1;
      const tierLabel = tierLevel === 3 ? 'Tier 3 (GMD Escalation)' : tierLevel === 2 ? 'Tier 2 (Executive COO)' : 'Tier 1 (HOD Direct)';

      // Department & Requester info
      const assignment = req.requester?.assignments?.[0];
      const departmentName = assignment?.department?.name || 'General Operations';

      // Honest 3-way matching & attachment verification
      const hasVendor = Boolean(req.vendor);
      const poGenerated = hasVendor;
      const quoteAttached = (req.attachments || []).length > 0;
      const scopeVerified = Boolean(req.deliverable && req.deliverable.trim().length > 0);

      // Live Monnify-backed subsidiary budget exposure
      const orgEnvelopes = budgets.filter((b) => b.organizationId === req.subsidiaryId);
      const topLevelEnvelopes = orgEnvelopes.filter((b) => !b.parentId);
      const budgetCap = (topLevelEnvelopes.length > 0 ? topLevelEnvelopes : orgEnvelopes)
        .reduce((acc, b) => acc + Number(b.allocatedMinor) / 100, 0);
      const remainingNow = orgEnvelopes.reduce((acc, b) => acc + Number(b.remainingMinor) / 100, 0);
      const spentSoFar = Math.max(0, budgetCap - remainingNow);

      return {
        id: req.id,
        systemId: toSystemRequestId(req.id),
        requestNumber: req.requestNumber,
        title: req.title,
        amount: amountNgn,
        amountNaira: amountNgn,
        amountMinor: Number(req.amountMinor),
        amountFormatted: `₦${amountNgn.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        currency: req.currency || 'NGN',
        category: req.category,
        justification: req.justification,
        deliverable: req.deliverable,
        neededBy: req.neededBy ? new Date(req.neededBy).toISOString() : new Date().toISOString(),
        hoursRemaining,
        isUrgent,
        tierLevel,
        tierLabel,
        approvalStatus: req.approvalStatus,
        paymentStatus: req.paymentStatus,
        accountabilityStatus: req.accountabilityStatus,
        isRecurring: req.isRecurring,
        recurringInterval: req.recurringInterval,
        createdAt: req.createdAt ? new Date(req.createdAt).toISOString() : new Date().toISOString(),
        subsidiary: {
          id: req.subsidiary?.id || req.subsidiaryId || '',
          code: req.subsidiary?.code || '',
          name: req.subsidiary?.legalName || 'BEMS Group',
        },
        requester: {
          id: req.requester?.id || '',
          name: req.requester?.legalName || 'Requester',
          role: req.requester?.role || 'STAFF',
          employeeNumber: req.requester?.employeeNumber || '',
          department: departmentName,
          bankName: req.requester?.bankName || req.requester?.salaryBankName || null,
          accountNumber: req.requester?.accountNumber || req.requester?.salaryAccountNumber || null,
          accountName: req.requester?.accountName || req.requester?.salaryAccountName || req.requester?.legalName || '',
        },
        vendor: req.vendor
          ? {
              id: req.vendor.id,
              code: req.vendor.code,
              name: req.vendor.name,
              category: req.vendor.category,
              taxId: req.vendor.taxId,
              bankName: req.vendor.bankName,
              accountNumber: req.vendor.accountNumber,
              accountName: req.vendor.accountName,
              rating: req.vendor.rating,
            }
          : null,
        threeWayMatch: {
          poMatched: poGenerated,
          quoteAttached,
          scopeVerified,
          status: hasVendor
            ? (quoteAttached ? '3-WAY MATCHED' : '2-WAY MATCHED')
            : (quoteAttached ? 'EVIDENCE ATTACHED' : 'INTERNAL REQUEST'),
        },
        budgetImpact: {
          totalBudget: budgetCap,
          spentSoFar,
          remainingBefore: Math.max(0, remainingNow),
          remainingAfter: Math.max(0, remainingNow - amountNgn),
          percentOfBudget: budgetCap > 0 ? Math.min(100, Math.round((amountNgn / budgetCap) * 100)) : 0,
        },
        approvalSteps: (req.approvalSteps || []).map((s) => ({
          id: s.id,
          stageIndex: s.stageIndex,
          assignedRole: s.assignedRole,
          approverName: s.approverName,
          status: s.status,
          decidedAt: s.decidedAt ? new Date(s.decidedAt).toISOString() : null,
          decisionReason: s.decisionReason,
        })),
        recentMessages: (req.channel?.messages || []).map((m) => ({
          id: m.id,
          authorName: m.authorName,
          authorRole: m.authorRole,
          body: m.body,
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        })),
        attachments: (req.attachments || []).map((att) => ({
          id: att.id,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          contentType: att.contentType,
          notes: att.notes || null,
          ownerType: att.ownerType || 'REQUEST',
          checksum: att.checksum || null,
          uploadedAt: att.uploadedAt ? new Date(att.uploadedAt).toISOString() : null,
        })),
      };
    });

    const pendingList = formattedRequests.filter(
      (r) => r.approvalStatus === 'SUBMITTED' || r.approvalStatus === 'IN_REVIEW' || r.approvalStatus === 'CLARIFICATION_REQUESTED'
    );
    const totalPendingCount = pendingList.length;
    const totalPendingAmount = pendingList.reduce((acc, r) => acc + r.amount, 0);
    const tier3Count = pendingList.filter((r) => r.tierLevel === 3).length;
    const urgentCount = pendingList.filter((r) => r.isUrgent).length;
    const clarificationCount = pendingList.filter((r) => r.approvalStatus === 'CLARIFICATION_REQUESTED').length;

    const response = NextResponse.json({
      summary: {
        totalPendingCount,
        totalPendingAmount,
        totalPendingFormatted: `₦${totalPendingAmount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        tier3Count,
        urgentCount,
        clarificationCount,
        totalRequestsCount: formattedRequests.length,
      },
      organizations,
      requests: formattedRequests,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return response;
  } catch (error: any) {
    console.error('Error fetching approvals queue:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch approvals' }, { status: 500 });
  }
}
