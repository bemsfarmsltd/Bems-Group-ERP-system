import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureInnovationSchema } from '@/lib/innovation-ensure-schema';
import {
  resolveInnovationContext,
  generateInnovationCode,
  computeRiceScore,
  logInnovationAudit,
} from '@/lib/innovationRouteHelper';

export const dynamic = 'force-dynamic';

function buildTemplateObjects(templateType: string, creatorId: string, creatorName: string) {
  const mode = templateType.toUpperCase();
  if (mode === 'SWOT') {
    return [
      { objectType: 'FRAME', content: 'STRENGTHS', subtitle: 'Internal advantages & capabilities', x: 80, y: 60, width: 320, height: 200, color: '#DCFCE7', clusterTag: 'STRENGTHS' },
      { objectType: 'FRAME', content: 'WEAKNESSES', subtitle: 'Internal gaps & friction points', x: 440, y: 60, width: 320, height: 200, color: '#FEE2E2', clusterTag: 'WEAKNESSES' },
      { objectType: 'FRAME', content: 'OPPORTUNITIES', subtitle: 'Market & technology tailwinds', x: 80, y: 300, width: 320, height: 200, color: '#DBEAFE', clusterTag: 'OPPORTUNITIES' },
      { objectType: 'FRAME', content: 'THREATS', subtitle: 'Competitive & operational risks', x: 440, y: 300, width: 320, height: 200, color: '#FEF3C7', clusterTag: 'THREATS' },
    ].map((o, i) => ({ ...o, zIndex: i + 1, creatorId, creatorName }));
  }
  if (mode === 'LEAN_CANVAS' || mode === 'BUSINESS_MODEL_CANVAS') {
    return [
      { objectType: 'FRAME', content: '1. Problem & Pain Points', subtitle: 'Top 3 user problems', x: 60, y: 60, width: 260, height: 180, color: '#FEE2E2', clusterTag: 'PROBLEM' },
      { objectType: 'FRAME', content: '2. Solution & Features', subtitle: 'Minimum viable capabilities', x: 350, y: 60, width: 260, height: 180, color: '#FEF08A', clusterTag: 'SOLUTION' },
      { objectType: 'FRAME', content: '3. Unique Value Proposition', subtitle: 'Why this wins', x: 640, y: 60, width: 260, height: 180, color: '#DCFCE7', clusterTag: 'VALUE' },
      { objectType: 'FRAME', content: '4. Customer Segments', subtitle: 'Target users & buyers', x: 60, y: 270, width: 400, height: 160, color: '#DBEAFE', clusterTag: 'CUSTOMERS' },
      { objectType: 'FRAME', content: '5. Key Metrics & Revenue Stream', subtitle: 'Measurable outcomes', x: 500, y: 270, width: 400, height: 160, color: '#F3E8FF', clusterTag: 'METRICS' },
    ].map((o, i) => ({ ...o, zIndex: i + 1, creatorId, creatorName }));
  }
  if (mode === 'IMPACT_EFFORT') {
    return [
      { objectType: 'FRAME', content: 'QUICK WINS (High Impact · Low Effort)', subtitle: 'Prioritize immediately', x: 80, y: 60, width: 340, height: 200, color: '#DCFCE7', clusterTag: 'QUICK_WIN' },
      { objectType: 'FRAME', content: 'MAJOR BETS (High Impact · High Effort)', subtitle: 'Requires PRD & MVP pilot', x: 460, y: 60, width: 340, height: 200, color: '#DBEAFE', clusterTag: 'MAJOR_BET' },
      { objectType: 'FRAME', content: 'FILL-INS (Low Impact · Low Effort)', subtitle: 'Backlog polish', x: 80, y: 290, width: 340, height: 180, color: '#FEF9C3', clusterTag: 'FILL_IN' },
      { objectType: 'FRAME', content: 'AVOID / DEFER (Low Impact · High Effort)', subtitle: 'Deprioritize', x: 460, y: 290, width: 340, height: 180, color: '#FEE2E2', clusterTag: 'DEFER' },
    ].map((o, i) => ({ ...o, zIndex: i + 1, creatorId, creatorName }));
  }
  // Default OST / Mind Map starter
  return [
    { objectType: 'FRAME', content: 'Target Product Outcome', subtitle: 'Define measurable goal', x: 300, y: 50, width: 300, height: 110, color: '#DBEAFE', clusterTag: 'OUTCOME' },
    { objectType: 'STICKY', content: 'Opportunity / User Pain Point #1', subtitle: 'Double-click or edit note', x: 140, y: 220, width: 250, height: 145, color: '#FEF08A', clusterTag: 'OPPORTUNITY' },
    { objectType: 'STICKY', content: 'Candidate Solution / Feature Idea #1', subtitle: 'Vote & convert to Idea or Feature', x: 480, y: 220, width: 250, height: 145, color: '#BBF7D0', clusterTag: 'SOLUTION' },
  ].map((o, i) => ({ ...o, zIndex: i + 1, creatorId, creatorName }));
}

export async function GET(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId') || '';
    const productId = searchParams.get('productId') || '';

    if (boardId) {
      const board = await prisma.brainstormBoard.findUnique({
        where: { id: boardId },
        include: {
          objects: { orderBy: { zIndex: 'asc' } },
          connectors: true,
          snapshots: { orderBy: { createdAt: 'desc' }, take: 15 },
        },
      });
      if (!board) return NextResponse.json({ error: 'Brainstorming board not found.' }, { status: 404 });

      // Section 41 & 60: Private board URL is not a permission token
      if (board.visibility === 'PRIVATE' && board.facilitatorId !== ctx.actor.id && !ctx.isExecutive) {
        return NextResponse.json({ error: 'Forbidden: This brainstorming board is private to its facilitator.' }, { status: 403 });
      }
      return NextResponse.json({ board, syncedAt: new Date().toISOString() });
    }

    const where: Record<string, any> = {};
    if (ctx.useSubFilter && ctx.allowedSubIds.length > 0) {
      where.organizationId = { in: ctx.allowedSubIds };
    }
    if (productId) where.productId = productId;

    const boards = await prisma.brainstormBoard.findMany({
      where,
      include: {
        objects: { orderBy: { zIndex: 'asc' } },
        connectors: true,
        snapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const visibleBoards = boards.filter(
      (b) => b.visibility !== 'PRIVATE' || b.facilitatorId === ctx.actor.id || ctx.isExecutive
    );

    return NextResponse.json({ boards: visibleBoards, syncedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load brainstorming boards.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const action = String(body.action || 'CREATE_BOARD').toUpperCase();

    // 1. Add Object to Infinite Canvas (Sticky Note, Text, Shape, Frame, Record Card)
    if (action === 'ADD_OBJECT') {
      const boardId = String(body.boardId || '');
      const board = await prisma.brainstormBoard.findUnique({ where: { id: boardId } });
      if (!board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });

      const obj = await prisma.brainstormCanvasObject.create({
        data: {
          boardId: board.id,
          objectType: body.objectType || 'STICKY',
          content: String(body.content || 'New Sticky Note').trim(),
          subtitle: body.subtitle || null,
          x: Number(body.x ?? 180),
          y: Number(body.y ?? 180),
          width: Number(body.width ?? 240),
          height: Number(body.height ?? 150),
          rotation: Number(body.rotation ?? 0),
          zIndex: Number(body.zIndex ?? 10),
          color: body.color || '#FEF08A',
          clusterTag: body.clusterTag || null,
          creatorId: ctx.actor.id,
          creatorName: ctx.actor.legalName,
          votesCount: 0,
        },
      });

      await prisma.brainstormBoard.update({
        where: { id: board.id },
        data: { version: board.version + 1 },
      });

      return NextResponse.json({ object: obj }, { status: 201 });
    }

    // 2. Add Smart Connector Between Two Canvas Objects
    if (action === 'ADD_CONNECTOR') {
      const boardId = String(body.boardId || '');
      if (!body.sourceObjectId || !body.targetObjectId || body.sourceObjectId === body.targetObjectId) {
        return NextResponse.json({ error: 'Valid source and target canvas objects are required.' }, { status: 400 });
      }
      const conn = await prisma.brainstormConnector.create({
        data: {
          boardId,
          sourceObjectId: String(body.sourceObjectId),
          targetObjectId: String(body.targetObjectId),
          label: body.label || null,
          lineStyle: body.lineStyle || 'CURVED',
          color: body.color || '#2563EB',
        },
      });
      return NextResponse.json({ connector: conn }, { status: 201 });
    }

    // 3. Save Versioned Canvas Snapshot (Section 6 & 59)
    if (action === 'SAVE_SNAPSHOT') {
      const boardId = String(body.boardId || '');
      const board = await prisma.brainstormBoard.findUnique({
        where: { id: boardId },
        include: { objects: true, connectors: true },
      });
      if (!board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });

      const snap = await prisma.brainstormSnapshot.create({
        data: {
          boardId: board.id,
          label: String(body.label || `Snapshot v${board.version} — ${new Date().toLocaleTimeString('en-GB')}`),
          snapshotJson: JSON.stringify({ objects: board.objects, connectors: board.connectors }),
          createdById: ctx.actor.id,
          createdByName: ctx.actor.legalName,
        },
      });
      return NextResponse.json({ snapshot: snap }, { status: 201 });
    }

    // 4. Convert Selected Canvas Object to Linked Idea, Opportunity, or Feature with Intact Provenance (Sections 6, 41, 66)
    if (action === 'CONVERT_OBJECT') {
      const objectId = String(body.objectId || '');
      const targetType = String(body.targetType || 'IDEA').toUpperCase();
      const obj = await prisma.brainstormCanvasObject.findUnique({
        where: { id: objectId },
        include: { board: true },
      });
      if (!obj) return NextResponse.json({ error: 'Canvas object not found.' }, { status: 404 });

      const orgId = obj.board.organizationId;
      const productId = body.productId || obj.board.productId;

      if (targetType === 'OPPORTUNITY') {
        const opportunityCode = await generateInnovationCode('OPP', 'productOpportunity', 'opportunityCode');
        const opp = await prisma.productOpportunity.create({
          data: {
            opportunityCode,
            organizationId: orgId,
            productId,
            sourceCanvasObjId: obj.id,
            title: obj.content.slice(0, 140),
            problemStatement: obj.subtitle || obj.content,
            targetOutcome: 'Converted from Brainstorming Board ' + obj.board.boardCode,
            confidenceScore: 75,
            strategicAlignment: 85,
            stage: 'PROBLEM_IDENTIFIED',
            decision: 'PENDING',
            ownerId: ctx.actor.id,
            ownerName: ctx.actor.legalName,
          },
        });
        const updatedObj = await prisma.brainstormCanvasObject.update({
          where: { id: obj.id },
          data: {
            convertedToType: 'OPPORTUNITY',
            convertedToId: opp.id,
            convertedCode: opp.opportunityCode,
          },
        });
        return NextResponse.json({ object: updatedObj, convertedRecord: opp, convertedType: 'OPPORTUNITY' });
      }

      if (targetType === 'FEATURE') {
        let resolvedProdId = productId;
        if (!resolvedProdId) {
          const firstProd = await prisma.product.findFirst({ where: { organizationId: orgId } });
          resolvedProdId = firstProd?.id || null;
        }
        if (!resolvedProdId) {
          return NextResponse.json({ error: 'Assign a Product to the board before converting directly to a Feature.' }, { status: 400 });
        }
        const featureCode = await generateInnovationCode('FEAT', 'productFeature', 'featureCode');
        const feat = await prisma.productFeature.create({
          data: {
            featureCode,
            organizationId: orgId,
            productId: resolvedProdId,
            sourceCanvasObjId: obj.id,
            title: obj.content.slice(0, 140),
            problemStatement: obj.subtitle || obj.content,
            valueProposition: `Originated from Brainstorming Session ${obj.board.title} (${obj.votesCount} votes)`,
            workflowStage: 'DISCOVERY',
            priority: obj.votesCount >= 5 ? 'HIGH' : 'MEDIUM',
            riceReach: 400,
            riceImpact: 2.0,
            riceConfidence: 80,
            riceEffort: 2.0,
            computedRiceScore: computeRiceScore(400, 2.0, 80, 2.0),
            ownerId: ctx.actor.id,
            ownerName: ctx.actor.legalName,
          },
        });
        const updatedObj = await prisma.brainstormCanvasObject.update({
          where: { id: obj.id },
          data: {
            convertedToType: 'FEATURE',
            convertedToId: feat.id,
            convertedCode: feat.featureCode,
          },
        });
        return NextResponse.json({ object: updatedObj, convertedRecord: feat, convertedType: 'FEATURE' });
      }

      // Default: Convert to Idea (Section 41 — always allowed for staff contributors)
      const ideaNumber = await generateInnovationCode('IDEA', 'productIdea', 'ideaNumber');
      const idea = await prisma.productIdea.create({
        data: {
          ideaNumber,
          organizationId: orgId,
          productId,
          title: obj.content.slice(0, 140),
          description: obj.subtitle ? `${obj.content} — ${obj.subtitle}` : obj.content,
          problemStatement: obj.subtitle || obj.content,
          expectedValue: `Brainstorming canvas note (${obj.votesCount} session votes)`,
          sourceType: 'BRAINSTORM_CANVAS',
          sourceCanvasId: obj.boardId,
          sourceObjectId: obj.id,
          submitterId: ctx.actor.id,
          submitterName: ctx.actor.legalName,
          status: 'SUBMITTED',
          votesCount: Math.max(1, obj.votesCount),
        },
      });
      const updatedObj = await prisma.brainstormCanvasObject.update({
        where: { id: obj.id },
        data: {
          convertedToType: 'IDEA',
          convertedToId: idea.id,
          convertedCode: idea.ideaNumber,
        },
      });

      await logInnovationAudit({
        actor: ctx.actor,
        action: 'CANVAS_OBJECT_CONVERTED',
        targetType: 'BrainstormCanvasObject',
        targetId: obj.id,
        subsidiaryId: orgId,
        metadata: { boardCode: obj.board.boardCode, convertedToType: 'IDEA', ideaNumber: idea.ideaNumber },
      });

      return NextResponse.json({ object: updatedObj, convertedRecord: idea, convertedType: 'IDEA' });
    }

    // 5. Create New Brainstorming Board & Session (with template starter objects)
    let orgId = body.organizationId;
    if (!orgId && body.productId) {
      const prod = await prisma.product.findUnique({ where: { id: String(body.productId) } });
      orgId = prod?.organizationId;
    }
    if (!orgId) {
      orgId =
        ctx.allowedSubIds[0] ||
        (await prisma.organization.findFirst({ where: { status: 'ACTIVE' } }))?.id;
    }

    const boardCode = await generateInnovationCode('BRD', 'brainstormBoard', 'boardCode');
    const templateType = String(body.templateType || 'OST').toUpperCase();

    const board = await prisma.brainstormBoard.create({
      data: {
        boardCode,
        organizationId: String(orgId),
        productId: body.productId || null,
        title: String(body.title || 'Product Brainstorming & Discovery Canvas').trim(),
        description: body.description || null,
        templateType,
        visibility: body.visibility || 'TEAM',
        facilitatorId: ctx.actor.id,
        sessionStatus: body.sessionStatus || 'ACTIVE',
        agenda: body.agenda || '1. Divergent ideation · 2. Theme clustering · 3. Dot voting · 4. Convert top notes to Ideas & Features',
        timeboxMinutes: Number(body.timeboxMinutes ?? 45),
        votingMaxDots: Number(body.votingMaxDots ?? 5),
      },
    });

    const starterObjects = buildTemplateObjects(templateType, ctx.actor.id, ctx.actor.legalName);
    for (const item of starterObjects) {
      await prisma.brainstormCanvasObject.create({
        data: {
          boardId: board.id,
          ...item,
        },
      });
    }

    const fullBoard = await prisma.brainstormBoard.findUnique({
      where: { id: board.id },
      include: { objects: true, connectors: true, snapshots: true },
    });

    await logInnovationAudit({
      actor: ctx.actor,
      action: 'BRAINSTORM_BOARD_CREATED',
      targetType: 'BrainstormBoard',
      targetId: board.id,
      subsidiaryId: board.organizationId,
      metadata: { boardCode: board.boardCode, title: board.title, templateType },
    });

    return NextResponse.json({ board: fullBoard }, { status: 201 });
  } catch (error: any) {
    console.error('[Innovation Canvases POST] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not process canvas action.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureInnovationSchema();
    const ctx = await resolveInnovationContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const action = String(body.action || 'UPDATE_OBJECT').toUpperCase();

    // 1. Move, Resize, Recolor, or Edit Canvas Object (with atomic version increment)
    if (action === 'UPDATE_OBJECT') {
      const objectId = String(body.objectId || body.id || '');
      const existing = await prisma.brainstormCanvasObject.findUnique({ where: { id: objectId } });
      if (!existing) return NextResponse.json({ error: 'Canvas object not found.' }, { status: 404 });

      const updated = await prisma.brainstormCanvasObject.update({
        where: { id: existing.id },
        data: {
          content: body.content !== undefined ? String(body.content) : undefined,
          subtitle: body.subtitle !== undefined ? body.subtitle : undefined,
          x: body.x !== undefined ? Number(body.x) : undefined,
          y: body.y !== undefined ? Number(body.y) : undefined,
          width: body.width !== undefined ? Number(body.width) : undefined,
          height: body.height !== undefined ? Number(body.height) : undefined,
          rotation: body.rotation !== undefined ? Number(body.rotation) : undefined,
          zIndex: body.zIndex !== undefined ? Number(body.zIndex) : undefined,
          color: body.color || undefined,
          clusterTag: body.clusterTag !== undefined ? body.clusterTag : undefined,
          version: existing.version + 1,
        },
      });
      return NextResponse.json({ object: updated });
    }

    // 2. Dot-Vote on Canvas Sticky Note (Attributed vote in voterIdsJson — Section 6 rule)
    if (action === 'VOTE_OBJECT') {
      const objectId = String(body.objectId || '');
      const existing = await prisma.brainstormCanvasObject.findUnique({ where: { id: objectId } });
      if (!existing) return NextResponse.json({ error: 'Canvas object not found.' }, { status: 404 });

      let voters: string[] = [];
      try {
        voters = existing.voterIdsJson ? JSON.parse(existing.voterIdsJson) : [];
      } catch {
        voters = [];
      }
      const hasVoted = voters.includes(ctx.actor.id);
      const nextVoters = hasVoted ? voters.filter((v) => v !== ctx.actor.id) : [...voters, ctx.actor.id];
      const nextCount = Math.max(0, hasVoted ? existing.votesCount - 1 : existing.votesCount + 1);

      const updated = await prisma.brainstormCanvasObject.update({
        where: { id: existing.id },
        data: {
          votesCount: nextCount,
          voterIdsJson: JSON.stringify(nextVoters),
          version: existing.version + 1,
        },
      });
      return NextResponse.json({ object: updated, voted: !hasVoted });
    }

    // 3. Comment on Canvas Object
    if (action === 'COMMENT_OBJECT') {
      const objectId = String(body.objectId || '');
      const existing = await prisma.brainstormCanvasObject.findUnique({ where: { id: objectId } });
      if (!existing) return NextResponse.json({ error: 'Canvas object not found.' }, { status: 404 });

      let comments: any[] = [];
      try {
        comments = existing.commentsJson ? JSON.parse(existing.commentsJson) : [];
      } catch {
        comments = [];
      }
      comments.push({
        id: `c-${Date.now()}`,
        authorId: ctx.actor.id,
        authorName: ctx.actor.legalName,
        text: String(body.comment || '').trim(),
        createdAt: new Date().toISOString(),
      });

      const updated = await prisma.brainstormCanvasObject.update({
        where: { id: existing.id },
        data: {
          commentsJson: JSON.stringify(comments),
          version: existing.version + 1,
        },
      });
      return NextResponse.json({ object: updated });
    }

    // 4. Delete Canvas Object
    if (action === 'DELETE_OBJECT') {
      const objectId = String(body.objectId || '');
      await prisma.brainstormConnector.deleteMany({
        where: { OR: [{ sourceObjectId: objectId }, { targetObjectId: objectId }] },
      });
      await prisma.brainstormCanvasObject.delete({ where: { id: objectId } });
      return NextResponse.json({ deleted: true, objectId });
    }

    // 5. Update Board Facilitation Status / Session Summary (Section 7)
    if (action === 'UPDATE_SESSION' && body.boardId) {
      const board = await prisma.brainstormBoard.update({
        where: { id: String(body.boardId) },
        data: {
          title: body.title || undefined,
          sessionStatus: body.sessionStatus || undefined,
          agenda: body.agenda !== undefined ? body.agenda : undefined,
          sessionSummary: body.sessionSummary !== undefined ? body.sessionSummary : undefined,
          timeboxMinutes: body.timeboxMinutes !== undefined ? Number(body.timeboxMinutes) : undefined,
        },
      });
      return NextResponse.json({ board });
    }

    return NextResponse.json({ error: 'Unsupported canvas PATCH action.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Innovation Canvases PATCH] Error:', error);
    return NextResponse.json({ error: error?.message || 'Could not update canvas object.' }, { status: 500 });
  }
}
