'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ThumbsUp,
  ArrowRightCircle,
  Camera,
  Clock,
  Sparkles,
  Trash2,
  Link2,
  Layers,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { resolveApiUrl } from '@/lib/api-client';

export interface CanvasBoardRecord {
  id: string;
  boardCode: string;
  organizationId: string;
  productId?: string | null;
  productName?: string;
  title: string;
  description?: string | null;
  templateType: string;
  visibility: string;
  facilitatorId?: string | null;
  facilitatorName?: string;
  sessionStatus: string;
  agenda?: string | null;
  timeboxMinutes: number;
  votingMaxDots: number;
  sessionSummary?: string | null;
  version: number;
  objects: Array<{
    id: string;
    boardId: string;
    objectType: string;
    content: string;
    subtitle?: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex?: number;
    color: string;
    clusterTag?: string | null;
    creatorId: string;
    creatorName?: string | null;
    votesCount: number;
    convertedToType?: string | null;
    convertedCode?: string | null;
  }>;
  connectors: Array<{
    id: string;
    sourceObjectId: string;
    targetObjectId: string;
    label?: string | null;
    color: string;
  }>;
  snapshots?: Array<{
    id: string;
    label: string;
    createdByName?: string | null;
    createdAt: string;
  }>;
}

interface Props {
  boards: CanvasBoardRecord[];
  products: Array<{ id: string; name: string; productCode: string }>;
  brandColor?: string;
  isStaffMode?: boolean;
  onRefresh: () => void;
  onNotice?: (msg: string) => void;
}

const STICKY_COLORS = [
  { label: 'Canary Yellow', hex: '#FEF08A', border: '#FACC15' },
  { label: 'Mint Emerald', hex: '#BBF7D0', border: '#4ADE80' },
  { label: 'Warm Apricot', hex: '#FED7AA', border: '#FB923C' },
  { label: 'Sky Blue', hex: '#DBEAFE', border: '#60A5FA' },
  { label: 'Lavender', hex: '#F3E8FF', border: '#C084FC' },
  { label: 'Coral Rose', hex: '#FEE2E2', border: '#F87171' },
];

export function BrainstormingCanvasPanel({
  boards,
  products,
  brandColor = '#ea580c',
  isStaffMode = false,
  onRefresh,
  onNotice,
}: Props) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>(boards[0]?.id || '');
  const activeBoard = boards.find((b) => b.id === selectedBoardId) || boards[0] || null;

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [draggingObjId, setDraggingObjId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [localCoords, setLocalCoords] = useState<Record<string, { x: number; y: number }>>({});

  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);

  // New Sticky / Object Form
  const [newContent, setNewContent] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newType, setNewType] = useState<'STICKY' | 'FRAME' | 'TEXT'>('STICKY');
  const [newColor, setNewColor] = useState('#FEF08A');
  const [newCluster, setNewCluster] = useState('SOLUTION');
  const [busy, setBusy] = useState(false);

  // New Board Modal
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [boardTitle, setBoardTitle] = useState('');
  const [boardTemplate, setBoardTemplate] = useState('OST');
  const [boardProductId, setBoardProductId] = useState(products[0]?.id || '');

  // Workshop Timebox Countdown
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState((activeBoard?.timeboxMinutes || 45) * 60);

  useEffect(() => {
    if (boards.length > 0 && !boards.some((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [timerRunning]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleAddObject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoard || !newContent.trim()) return;
    setBusy(true);
    try {
      const count = activeBoard.objects.length;
      const col = count % 3;
      const row = Math.floor(count / 3);
      const res = await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'ADD_OBJECT',
          boardId: activeBoard.id,
          objectType: newType,
          content: newContent.trim(),
          subtitle: newSubtitle.trim() || null,
          color: newColor,
          clusterTag: newCluster,
          x: 110 + col * 290,
          y: 160 + row * 190,
          width: newType === 'FRAME' ? 320 : 255,
          height: newType === 'FRAME' ? 140 : 155,
        }),
      });
      if (res.ok) {
        setNewContent('');
        setNewSubtitle('');
        onNotice?.('Added object to collaborative canvas.');
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVoteObject = async (objectId: string) => {
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'VOTE_OBJECT', objectId }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleConvertObject = async (objectId: string, targetType: 'IDEA' | 'OPPORTUNITY' | 'FEATURE') => {
    setBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'CONVERT_OBJECT',
          objectId,
          targetType,
          productId: activeBoard?.productId || products[0]?.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const code = data?.object?.convertedCode || targetType;
        onNotice?.(`Converted canvas note to ${targetType} (${code}) with full provenance link.`);
        onRefresh();
      } else {
        onNotice?.(data?.error || 'Could not convert object.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteObject = async (objectId: string) => {
    try {
      await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'DELETE_OBJECT', objectId }),
      });
      if (selectedObjId === objectId) setSelectedObjId(null);
      onRefresh();
    } catch {}
  };

  const handleSaveSnapshot = async () => {
    if (!activeBoard) return;
    setBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'SAVE_SNAPSHOT',
          boardId: activeBoard.id,
          label: `Workshop Checkpoint v${activeBoard.version}`,
        }),
      });
      if (res.ok) {
        onNotice?.('Saved versioned canvas snapshot.');
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'CREATE_BOARD',
          title: boardTitle.trim(),
          templateType: boardTemplate,
          productId: boardProductId || null,
          visibility: 'TEAM',
        }),
      });
      const data = await res.json();
      if (res.ok && data.board) {
        setShowNewBoardModal(false);
        setBoardTitle('');
        setSelectedBoardId(data.board.id);
        onNotice?.(`Created brainstorming board ${data.board.boardCode} (${boardTemplate} template).`);
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateConnector = async (targetId: string) => {
    if (!activeBoard || !connectorSourceId || connectorSourceId === targetId) {
      setConnectorSourceId(null);
      return;
    }
    try {
      await fetch(resolveApiUrl('/api/innovation/canvases'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'ADD_CONNECTOR',
          boardId: activeBoard.id,
          sourceObjectId: connectorSourceId,
          targetObjectId: targetId,
          label: 'Linked flow',
        }),
      });
      setConnectorSourceId(null);
      onNotice?.('Connected canvas objects.');
      onRefresh();
    } catch {
      setConnectorSourceId(null);
    }
  };

  const handleObjectMouseDown = (e: React.MouseEvent, obj: CanvasBoardRecord['objects'][0]) => {
    e.stopPropagation();
    if (connectorSourceId) {
      void handleCreateConnector(obj.id);
      return;
    }
    setSelectedObjId(obj.id);
    setDraggingObjId(obj.id);
    const curr = localCoords[obj.id] || { x: obj.x, y: obj.y };
    setDragOffset({
      x: e.clientX / zoom - curr.x,
      y: e.clientY / zoom - curr.y,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (draggingObjId) {
      const nextX = Math.max(16, Math.round(e.clientX / zoom - dragOffset.x));
      const nextY = Math.max(16, Math.round(e.clientY / zoom - dragOffset.y));
      setLocalCoords((prev) => ({
        ...prev,
        [draggingObjId]: { x: nextX, y: nextY },
      }));
      return;
    }
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleCanvasMouseUp = async () => {
    if (draggingObjId) {
      const movedId = draggingObjId;
      const coords = localCoords[movedId];
      setDraggingObjId(null);
      if (coords) {
        await fetch(resolveApiUrl('/api/innovation/canvases'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'UPDATE_OBJECT',
            objectId: movedId,
            x: coords.x,
            y: coords.y,
          }),
        }).catch(() => {});
        onRefresh();
      }
    }
    setIsPanning(false);
  };

  const getObjectCoords = (obj: CanvasBoardRecord['objects'][0]) => {
    return localCoords[obj.id] || { x: obj.x, y: obj.y };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Facilitation & Board Selector Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={16} color={brandColor} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>ACTIVE BOARD:</span>
          </div>
          <select
            value={activeBoard?.id || ''}
            onChange={(e) => {
              setSelectedBoardId(e.target.value);
              setLocalCoords({});
            }}
            style={{
              padding: '7px 12px',
              borderRadius: 9,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            {boards.length === 0 ? (
              <option value="">No board yet — launch a template →</option>
            ) : (
              boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.boardCode} · {b.title} ({b.templateType})
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => setShowNewBoardModal(true)}
            style={{
              padding: '7px 12px',
              borderRadius: 9,
              border: `1px solid ${brandColor}44`,
              background: `${brandColor}14`,
              color: brandColor,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Plus size={14} /> New Canvas / Template
          </button>
        </div>

        {/* Facilitation Timebox & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 8,
              background: timerRunning ? '#ecfdf5' : '#f8fafc',
              border: `1px solid ${timerRunning ? '#a7f3d0' : '#e2e8f0'}`,
              fontSize: 12,
              fontWeight: 800,
              color: timerRunning ? '#047857' : '#334155',
            }}
          >
            <Clock size={13} />
            <span>Timebox: {formatTimer(secondsLeft)}</span>
            <button
              type="button"
              onClick={() => setTimerRunning((r) => !r)}
              style={{
                border: 'none',
                background: timerRunning ? '#059669' : '#0f172a',
                color: '#ffffff',
                borderRadius: 5,
                padding: '2px 7px',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {timerRunning ? 'Pause' : 'Start'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={busy}
            style={{
              padding: '6px 11px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Camera size={13} /> Save Snapshot (v{activeBoard?.version || 1})
          </button>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f8fafc', padding: 3, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.55, Math.round((z - 0.15) * 100) / 100))}
              style={{ border: 'none', background: 'transparent', padding: '4px 6px', cursor: 'pointer' }}
              title="Zoom Out"
            >
              <ZoomOut size={14} color="#475569" />
            </button>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', minWidth: 42, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.75, Math.round((z + 0.15) * 100) / 100))}
              style={{ border: 'none', background: 'transparent', padding: '4px 6px', cursor: 'pointer' }}
              title="Zoom In"
            >
              <ZoomIn size={14} color="#475569" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              style={{ border: 'none', background: 'transparent', padding: '4px 6px', cursor: 'pointer' }}
              title="Reset Viewport"
            >
              <Maximize2 size={13} color="#475569" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Sticky / Frame Creator Bar */}
      <form
        onSubmit={handleAddObject}
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as any)}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: 12,
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          <option value="STICKY">Sticky Note</option>
          <option value="FRAME">Section Frame</option>
          <option value="TEXT">Text / Diagram Card</option>
        </select>

        <select
          value={newCluster}
          onChange={(e) => setNewCluster(e.target.value)}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: 12,
            fontWeight: 700,
            color: '#334155',
          }}
        >
          <option value="OUTCOME">Outcome / Goal</option>
          <option value="OPPORTUNITY">Opportunity / Pain Point</option>
          <option value="SOLUTION">Candidate Solution</option>
          <option value="ASSUMPTION">Risk / Assumption</option>
        </select>

        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Write sticky note headline, user problem, or feature concept..."
          style={{
            flex: '1 1 240px',
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 12.5,
            color: '#0f172a',
          }}
        />

        <input
          type="text"
          value={newSubtitle}
          onChange={(e) => setNewSubtitle(e.target.value)}
          placeholder="Supporting evidence / details (optional)..."
          style={{
            flex: '1 1 180px',
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 12,
            color: '#475569',
          }}
        />

        {/* Color Swatches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {STICKY_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setNewColor(c.hex)}
              title={c.label}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: c.hex,
                border: newColor === c.hex ? '2.5px solid #0f172a' : `1px solid ${c.border}`,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={busy || !newContent.trim() || !activeBoard}
          style={{
            padding: '8px 14px',
            borderRadius: 9,
            border: 'none',
            background: brandColor,
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            opacity: !activeBoard ? 0.55 : 1,
          }}
        >
          <Plus size={14} /> Add to Canvas
        </button>
      </form>

      {connectorSourceId && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>🔗 Connector Mode Active: Click any target card on the canvas to link from the selected note.</span>
          <button
            type="button"
            onClick={() => setConnectorSourceId(null)}
            style={{ border: 'none', background: '#1d4ed8', color: '#ffffff', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel Link
          </button>
        </div>
      )}

      {/* Infinite Collaborative Whiteboard Canvas Viewport */}
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsPanning(true);
            setSelectedObjId(null);
            panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          }
        }}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        style={{
          position: 'relative',
          height: 580,
          borderRadius: 16,
          border: '1px solid #cbd5e1',
          background: '#f8fafc',
          backgroundImage: 'radial-gradient(#cbd5e1 1.15px, transparent 1.15px)',
          backgroundSize: '22px 22px',
          overflow: 'hidden',
          cursor: draggingObjId ? 'grabbing' : isPanning ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        {/* Top-left Live Presence & Agenda HUD */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 30,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '8px 12px',
            maxWidth: 460,
            boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: '#10b981',
                display: 'inline-block',
              }}
            />
            <strong style={{ fontSize: 12, color: '#0f172a' }}>
              {activeBoard?.title || 'Brainstorming Canvas'}
            </strong>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 5,
                background: '#fff7ed',
                color: '#ea580c',
                border: '1px solid #fed7aa',
              }}
            >
              {activeBoard?.sessionStatus || 'ACTIVE'}
            </span>
          </div>
          {activeBoard?.agenda && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              {activeBoard.agenda}
            </div>
          )}
        </div>

        {/* Transformed Canvas Layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Smart Connectors SVG Layer */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 2400,
              height: 1600,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <defs>
              <marker id="canvas-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
              </marker>
            </defs>
            {(activeBoard?.connectors || []).map((conn) => {
              const src = activeBoard?.objects.find((o) => o.id === conn.sourceObjectId);
              const dst = activeBoard?.objects.find((o) => o.id === conn.targetObjectId);
              if (!src || !dst) return null;
              const sCoord = getObjectCoords(src);
              const dCoord = getObjectCoords(dst);
              const x1 = sCoord.x + (src.width || 240) / 2;
              const y1 = sCoord.y + (src.height || 140);
              const x2 = dCoord.x + (dst.width || 240) / 2;
              const y2 = dCoord.y;
              const midY = (y1 + y2) / 2;
              const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              return (
                <g key={conn.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={conn.color || '#475569'}
                    strokeWidth={2.2}
                    strokeDasharray="5,3"
                    markerEnd="url(#canvas-arrow)"
                  />
                  {conn.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={midY - 6}
                      textAnchor="middle"
                      fill="#334155"
                      fontSize="10.5"
                      fontWeight="700"
                    >
                      {conn.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Canvas Objects (Sticky Notes, Frames, Cards) */}
          {(activeBoard?.objects || []).map((obj) => {
            const coords = getObjectCoords(obj);
            const isSelected = selectedObjId === obj.id;
            const isFrame = obj.objectType === 'FRAME';

            return (
              <div
                key={obj.id}
                onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                style={{
                  position: 'absolute',
                  left: coords.x,
                  top: coords.y,
                  width: obj.width || 255,
                  minHeight: obj.height || 150,
                  background: obj.color || '#FEF08A',
                  border: isSelected
                    ? '2.5px solid #ea580c'
                    : isFrame
                    ? '2px dashed #64748b'
                    : '1px solid rgba(15, 23, 42, 0.14)',
                  borderRadius: isFrame ? 14 : 12,
                  padding: '12px 14px',
                  boxShadow: isSelected
                    ? '0 14px 28px rgba(234, 88, 12, 0.18)'
                    : '0 6px 16px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                  zIndex: isSelected ? 25 : obj.zIndex || 5,
                  cursor: 'grab',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.75)',
                        color: '#0f172a',
                      }}
                    >
                      {obj.clusterTag || obj.objectType}
                    </span>

                    {obj.convertedCode && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                        title={`Provenance link: converted to ${obj.convertedToType} ${obj.convertedCode}`}
                      >
                        <CheckCircle2 size={10} />
                        {obj.convertedCode}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: isFrame ? 13.5 : 12.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
                    {obj.content}
                  </div>
                  {obj.subtitle && (
                    <div style={{ fontSize: 11, color: '#334155', marginTop: 4, lineHeight: 1.4 }}>
                      {obj.subtitle}
                    </div>
                  )}
                </div>

                {/* Card Footer: Creator, Vote Button, Connect & Convert Actions */}
                <div
                  style={{
                    borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                    paddingTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>
                      {obj.creatorName || 'Contributor'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleVoteObject(obj.id);
                        }}
                        style={{
                          border: '1px solid rgba(15,23,42,0.15)',
                          background: '#ffffff',
                          borderRadius: 6,
                          padding: '2px 7px',
                          fontSize: 11,
                          fontWeight: 800,
                          color: '#0f172a',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Cast dot vote on this canvas object"
                      >
                        <ThumbsUp size={11} color="#ea580c" />
                        <span>{obj.votesCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnectorSourceId(obj.id);
                        }}
                        style={{
                          border: '1px solid rgba(15,23,42,0.15)',
                          background: '#ffffff',
                          borderRadius: 6,
                          padding: '3px 6px',
                          cursor: 'pointer',
                        }}
                        title="Draw connector line from this card to another card"
                      >
                        <Link2 size={11} color="#2563eb" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteObject(obj.id);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: '2px 4px',
                          cursor: 'pointer',
                        }}
                        title="Remove card"
                      >
                        <Trash2 size={11} color="#64748b" />
                      </button>
                    </div>
                  </div>

                  {/* 1-Click Conversion Bar (Section 6 & 41: Convert Note -> Idea / Opportunity / Feature) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConvertObject(obj.id, 'IDEA');
                      }}
                      style={{
                        border: '1px solid #cbd5e1',
                        background: 'rgba(255,255,255,0.9)',
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: '#0f172a',
                        cursor: 'pointer',
                      }}
                    >
                      → Idea
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConvertObject(obj.id, 'OPPORTUNITY');
                      }}
                      style={{
                        border: '1px solid #cbd5e1',
                        background: 'rgba(255,255,255,0.9)',
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: '#1d4ed8',
                        cursor: 'pointer',
                      }}
                    >
                      → Opportunity
                    </button>
                    {!isStaffMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleConvertObject(obj.id, 'FEATURE');
                        }}
                        style={{
                          border: '1px solid #fed7aa',
                          background: '#fff7ed',
                          borderRadius: 5,
                          padding: '2px 6px',
                          fontSize: 9.5,
                          fontWeight: 800,
                          color: '#ea580c',
                          cursor: 'pointer',
                        }}
                      >
                        → Feature
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create New Board / Workshop Template Modal */}
      {showNewBoardModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <form
            onSubmit={handleCreateBoard}
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: 22,
              boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Create Collaborative Brainstorming Board
            </h3>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Workshop / Board Title
              </label>
              <input
                type="text"
                required
                value={boardTitle}
                onChange={(e) => setBoardTitle(e.target.value)}
                placeholder="e.g., Q1 2027 Product Discovery & Feature Ideation"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Canvas Framework Template (Section 6)
              </label>
              <select
                value={boardTemplate}
                onChange={(e) => setBoardTemplate(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, background: '#f8fafc' }}
              >
                <option value="OST">Opportunity Solution Tree (Outcome → Opportunities → Solutions)</option>
                <option value="SWOT">SWOT Strategy Matrix (Strengths, Weaknesses, Opportunities, Threats)</option>
                <option value="LEAN_CANVAS">Lean Business Model Canvas (Problem, Solution, Value, Segments, Metrics)</option>
                <option value="IMPACT_EFFORT">Impact vs. Effort Prioritization Quadrant</option>
                <option value="MIND_MAP">Freeform Mind Map & Journey Ideation</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Linked Product
              </label>
              <select
                value={boardProductId}
                onChange={(e) => setBoardProductId(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, background: '#f8fafc' }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.productCode} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setShowNewBoardModal(false)}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#ea580c', color: '#ffffff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Create Board
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
