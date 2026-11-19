'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  CreditCard,
  Palette,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  ID_CARD_LEVEL_LIST,
  ID_CARD_LEVELS,
  type IdCardLevel,
} from '@/lib/id-card-levels';
import { IdCardBack, IdCardFront } from '@/components/hr/IdCardLevelRenderer';

type CardTemplateId = 'aurora' | 'ribbon' | 'diagonal' | 'classic';

interface StaffIdCardItem {
  employeeId: string;
  employeeNumber: string;
  legalName: string;
  workEmail: string;
  phone?: string | null;
  role: string;
  jobTitle: string;
  staffGrade?: string | null;
  employmentType: string;
  avatarUrl?: string | null;
  resumptionDate?: string | null;
  departmentName: string;
  departmentCode: string;
  subsidiaryId: string | null;
  subsidiaryName: string;
  subsidiaryCode: string;
  brandColor: string;
  logoUrl: string;
  customColor?: string | null;
  secondaryColor?: string | null;
  cardTemplate?: CardTemplateId | null;
  cardLevel: IdCardLevel;
  levelCode: string;
  levelName: string;
  clearanceLabel: string;
  facilityScope: string;
  systemScope: string;
  customAdminTitle?: string | null;
  systemClearance?: string[];
  cardNumber: string;
  status: 'ACTIVE' | 'NOT_ISSUED' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string;
  isPreviewDates?: boolean;
  issuedByName: string | null;
  revokedReason: string | null;
  qrDataUrl: string;
  verifyUrl: string;
}

interface HrIdCardsPanelProps {
  selectedSubsidiaryId: string;
  activeBrandColor?: string;
}

const CARD_PALETTES = [
  { label: 'BemsSoft Blue', primary: '#2563eb', secondary: '#0ea5e9' },
  { label: 'BEMS Orange', primary: '#ea580c', secondary: '#f59e0b' },
  { label: 'Emerald Mint', primary: '#059669', secondary: '#14b8a6' },
  { label: 'Royal Violet', primary: '#7c3aed', secondary: '#ec4899' },
  { label: 'Midnight Navy', primary: '#0f172a', secondary: '#3b82f6' },
  { label: 'Crimson Gold', primary: '#dc2626', secondary: '#f59e0b' },
  { label: 'Teal Cyan', primary: '#0891b2', secondary: '#6366f1' },
  { label: 'Forest Lime', primary: '#15803d', secondary: '#84cc16' },
];

const ANALOGOUS_ACCENT: Record<string, string> = {
  '#ea580c': '#f59e0b',
  '#2563eb': '#0ea5e9',
  '#0d8a70': '#14b8a6',
  '#059669': '#14b8a6',
  '#7c3aed': '#a855f7',
  '#7158de': '#a855f7',
  '#0f172a': '#334155',
  '#0b1220': '#334155',
  '#dc2626': '#f97316',
  '#be123c': '#f43f5e',
  '#0891b2': '#38bdf8',
  '#db2777': '#f472b6',
  '#4f46e5': '#818cf8',
  '#15803d': '#22c55e',
  '#ca8a04': '#facc15',
};

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function HrIdCardsPanel({
  selectedSubsidiaryId,
  activeBrandColor = '#2563eb',
}: HrIdCardsPanelProps) {
  const [cards, setCards] = useState<StaffIdCardItem[]>([]);
  const [managementSignatureUrl, setManagementSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'NOT_ISSUED' | 'REVOKED'>('ALL');
  const [levelFilter, setLevelFilter] = useState<'ALL' | IdCardLevel>('ALL');
  const [selectedId, setSelectedId] = useState<string>('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [validityMonths, setValidityMonths] = useState<number>(24);
  const [customPrimary, setCustomPrimary] = useState<string | null>(null);
  const [customSecondary, setCustomSecondary] = useState<string | null>(null);
  const [cardLevel, setCardLevel] = useState<IdCardLevel>(4);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const qs = selectedSubsidiaryId ? `?subsidiaryId=${encodeURIComponent(selectedSubsidiaryId)}` : '';
      const res = await fetch(`/api/hr/id-cards${qs}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.cards)) {
        setCards(data.cards);
        setManagementSignatureUrl(data.managementSignatureUrl || null);
        setSelectedId((prev) =>
          prev && data.cards.some((c: StaffIdCardItem) => c.employeeId === prev)
            ? prev
            : data.cards[0]?.employeeId || ''
        );
      } else {
        setNotice({ type: 'err', text: data.error || 'Failed to load staff ID cards.' });
      }
    } catch {
      setNotice({ type: 'err', text: 'Could not reach server to load ID cards.' });
    } finally {
      setLoading(false);
    }
  }, [selectedSubsidiaryId]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (levelFilter !== 'ALL' && c.cardLevel !== levelFilter) return false;
      if (!q) return true;
      return (
        c.legalName.toLowerCase().includes(q) ||
        c.employeeNumber.toLowerCase().includes(q) ||
        c.subsidiaryName.toLowerCase().includes(q) ||
        c.departmentName.toLowerCase().includes(q) ||
        c.cardNumber.toLowerCase().includes(q) ||
        c.levelCode.toLowerCase().includes(q)
      );
    });
  }, [cards, search, statusFilter, levelFilter]);

  const activeCard = useMemo(
    () => cards.find((c) => c.employeeId === selectedId) || filtered[0] || null,
    [cards, filtered, selectedId]
  );

  useEffect(() => {
    if (!activeCard) return;
    setCustomPrimary(activeCard.customColor || null);
    setCustomSecondary(activeCard.secondaryColor || null);
    setCardLevel(activeCard.cardLevel || 4);
  }, [activeCard?.employeeId]);

  const levelSpec = ID_CARD_LEVELS[cardLevel];
  const cardPrimary = customPrimary || activeCard?.brandColor || activeBrandColor || levelSpec.accentDefault;
  const cardSecondary =
    customSecondary || ANALOGOUS_ACCENT[cardPrimary.toLowerCase()] || levelSpec.secondaryDefault;
  const cardGradient = `linear-gradient(135deg, ${cardPrimary} 0%, ${cardSecondary} 100%)`;

  const previewDates = useMemo(() => {
    const base = activeCard?.status === 'ACTIVE' && activeCard.issuedAt ? new Date(activeCard.issuedAt) : new Date();
    const exp =
      activeCard?.status === 'ACTIVE' && activeCard.expiresAt
        ? new Date(activeCard.expiresAt)
        : (() => {
            const d = new Date(base);
            d.setMonth(d.getMonth() + validityMonths);
            return d;
          })();
    return {
      issued: formatDateShort(base.toISOString()),
      expires: formatDateShort(exp.toISOString()),
    };
  }, [activeCard?.employeeId, activeCard?.status, activeCard?.issuedAt, activeCard?.expiresAt, validityMonths]);

  const stats = useMemo(() => {
    const active = cards.filter((c) => c.status === 'ACTIVE').length;
    const pending = cards.filter((c) => c.status === 'NOT_ISSUED').length;
    const revoked = cards.filter((c) => c.status === 'REVOKED' || c.status === 'EXPIRED').length;
    return { total: cards.length, active, pending, revoked };
  }, [cards]);

  const mutateCards = async (action: 'ISSUE_CARD' | 'REVOKE_CARD', employeeIds: string[]) => {
    if (employeeIds.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/hr/id-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          employeeIds,
          validityMonths,
          customColor: customPrimary,
          secondaryColor: customSecondary,
          cardLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update ID card.');
      setNotice({
        type: 'ok',
        text:
          action === 'REVOKE_CARD'
            ? `Revoked ${data.updatedCount} ID card(s).`
            : `Issued/updated ${data.updatedCount} Level ${cardLevel} ID card(s) with System-Grade QR.`,
      });
      setCheckedIds([]);
      await loadCards();
    } catch (err: any) {
      setNotice({ type: 'err', text: err?.message || 'Error updating ID card.' });
    } finally {
      setSaving(false);
    }
  };

  const compressSignatureFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Could not read SVG signature.'));
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read signature image.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image format for signature.'));
        img.onload = () => {
          const maxW = 420;
          const maxH = 140;
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(typeof reader.result === 'string' ? reader.result : '');
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = typeof reader.result === 'string' ? reader.result : '';
      };
      reader.readAsDataURL(file);
    });

  const handleSignatureUpload = async (file: File | null) => {
    if (!file) return;
    setSaving(true);
    setNotice(null);
    try {
      const dataUrl = await compressSignatureFile(file);
      if (!dataUrl) throw new Error('Empty signature image.');
      const res = await fetch('/api/hr/id-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_SIGNATURE', signatureDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save signature.');
      setManagementSignatureUrl(data.managementSignatureUrl || dataUrl);
      setNotice({ type: 'ok', text: 'Management signature uploaded and applied to all ID cards.' });
    } catch (err: any) {
      setNotice({ type: 'err', text: err?.message || 'Could not save signature.' });
    } finally {
      setSaving(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const clearSignature = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/hr/id-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAVE_SIGNATURE', signatureDataUrl: '' }),
      });
      if (res.ok) {
        setManagementSignatureUrl(null);
        setNotice({ type: 'ok', text: 'Reverted to default vector Management signature.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const printCards = (list: StaffIdCardItem[]) => {
    if (list.length === 0) return;
    const win = window.open('', '_blank', 'width=980,height=760');
    if (!win) {
      setNotice({ type: 'err', text: 'Please allow popups to print ID cards.' });
      return;
    }

    const cardsHtml = list
      .map((c) => {
        const lvl = list.length === 1 ? cardLevel : c.cardLevel;
        const spec = ID_CARD_LEVELS[lvl];
        const p = (list.length === 1 ? customPrimary : c.customColor) || c.brandColor || spec.accentDefault;
        const s = (list.length === 1 ? customSecondary : c.secondaryColor) || spec.secondaryDefault;
        const grad = `linear-gradient(135deg, ${p} 0%, ${s} 100%)`;
        const initials = c.legalName
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((x) => x[0]?.toUpperCase())
          .join('');
        const avatarBlock = c.avatarUrl
          ? `<img src="${c.avatarUrl}" alt="${c.legalName}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<span style="font-size:20px;font-weight:800;color:${p};">${initials}</span>`;
        const sigBlock = managementSignatureUrl
          ? `<img src="${managementSignatureUrl}" alt="Signature" style="max-height:22px;width:auto;" />`
          : `<div style="font-style:italic;font-weight:700;font-size:11px;color:#0f172a;">Authorized Mgmt</div>`;

        return `
          <div class="pair">
            <div class="card front" style="border-top:5px solid ${p};">
              <div class="header" style="background:${grad};color:#ffffff;">
                <img src="${c.logoUrl}" class="logo" alt="${c.subsidiaryName}" />
                <div>
                  <div class="sub-name">${c.subsidiaryName}</div>
                  <div class="sub-code">${spec.code} · ${spec.shortTitle.toUpperCase()}</div>
                </div>
              </div>
              <div class="body">
                <div class="avatar-ring" style="background:${grad};padding:3px;border-radius:999px;">
                  <div class="avatar">${avatarBlock}</div>
                </div>
                <div class="name">${c.legalName}</div>
                <div class="title" style="color:${p};">${c.jobTitle}</div>
                <div class="meta">${c.departmentName} · ${c.employeeNumber}</div>
              </div>
              <div class="footer" style="background:${grad};color:#ffffff;">
                <span>ID: ${c.cardNumber}</span>
                <span>${spec.code} CLEARANCE</span>
              </div>
            </div>
            <div class="card back">
              <div class="back-top" style="background:${grad};color:#ffffff;">
                <span>${c.subsidiaryName}</span>
                <span>${spec.code} · SYS-QR</span>
              </div>
              <div class="back-body">
                ${c.qrDataUrl ? `<img src="${c.qrDataUrl}" class="qr" style="border:2px solid ${p}40;" alt="QR" />` : ''}
                <div class="back-info">
                  <div><strong>Card No:</strong> ${c.cardNumber}</div>
                  <div><strong>Issued:</strong> ${formatDateShort(c.issuedAt)}</div>
                  <div><strong>Expires:</strong> ${formatDateShort(c.expiresAt)}</div>
                  <div style="margin-top:6px;">${sigBlock}<div style="font-size:7px;border-top:1px solid #cbd5e1;padding-top:2px;">Management Authority</div></div>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>BEMS HR — 10-Level Staff ID Cards</title>
          <style>
            * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            body { margin: 20px; background: #f8fafc; color: #0f172a; }
            .pair { display: flex; gap: 16px; margin-bottom: 20px; page-break-inside: avoid; }
            .card { width: 54mm; height: 85.6mm; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
            .header { padding: 9px 10px; display: flex; align-items: center; gap: 8px; }
            .logo { width: 28px; height: 28px; object-fit: contain; background: #fff; border-radius: 7px; padding: 2px; }
            .sub-name { font-size: 9.5px; font-weight: 800; line-height: 1.15; color: #ffffff; }
            .sub-code { font-size: 7px; font-weight: 700; color: rgba(255,255,255,0.88); }
            .body { padding: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px; }
            .avatar { width: 64px; height: 64px; border-radius: 999px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #ffffff; }
            .name { font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 4px; }
            .title { font-size: 9px; font-weight: 700; }
            .meta { font-size: 8px; color: #475569; font-weight: 600; }
            .footer { padding: 6px 10px; font-size: 7.5px; font-weight: 800; display: flex; justify-content: space-between; }
            .back-top { padding: 7px 10px; font-size: 8px; font-weight: 800; display: flex; justify-content: space-between; }
            .back-body { padding: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; justify-content: center; }
            .qr { width: 84px; height: 84px; border-radius: 8px; padding: 3px; background: #fff; }
            .back-info { font-size: 7.5px; color: #334155; line-height: 1.4; }
            @media print { body { margin: 0; background: #fff; } }
          </style>
        </head>
        <body>${cardsHtml}<script>window.onload=()=>window.print();</script></body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: activeBrandColor }}
          >
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-widest uppercase" style={{ color: activeBrandColor }}>
              HR CREDENTIALS · 10-LEVEL SYSTEM-GRADE ID CARDS
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">10-Level Staff ID Card Studio &amp; Issuance</h2>
            <p className="text-xs text-slate-500">
              Level-based designs (L1–L10) auto-mapped to company grades, Tech/Dev tracks, Admin profiles &amp; Executive roles with HMAC-SHA256 verification QR.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={validityMonths}
            onChange={(e) => setValidityMonths(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value={12}>12 Months Validity</option>
            <option value={24}>24 Months Validity</option>
            <option value={36}>36 Months Validity</option>
          </select>
          <button
            type="button"
            disabled={checkedIds.length === 0 || saving}
            onClick={() => mutateCards('ISSUE_CARD', checkedIds)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
            style={{ background: activeBrandColor }}
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            Issue Selected ({checkedIds.length})
          </button>
          <button
            type="button"
            disabled={checkedIds.length === 0}
            onClick={() => printCards(cards.filter((c) => checkedIds.includes(c.employeeId)))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Selected
          </button>
          <button
            type="button"
            onClick={() => void loadCards()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            notice.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {[
          { label: 'Eligible Staff', value: stats.total, sub: 'Approved active roster' },
          { label: 'Active ID Cards', value: stats.active, sub: 'Valid & QR-verified' },
          { label: 'Pending Issuance', value: stats.pending, sub: 'Auto-leveled L1–L10' },
          { label: 'Revoked / Expired', value: stats.revoked, sub: 'Disabled credentials' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{s.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Staff Roster */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-[#f8fafc] space-y-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff, ID number, L1–L10, subsidiary..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
            </div>

            {/* Level 1-10 Quick Filter */}
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setLevelFilter('ALL')}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold border ${
                  levelFilter === 'ALL'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                All L1–L10
              </button>
              {ID_CARD_LEVEL_LIST.map((lvl) => (
                <button
                  key={lvl.level}
                  type="button"
                  title={lvl.name}
                  onClick={() => setLevelFilter(lvl.level)}
                  className={`rounded-lg px-2 py-1 text-[10px] font-bold border ${
                    levelFilter === lvl.level
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {lvl.code}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {(['ALL', 'ACTIVE', 'NOT_ISSUED', 'REVOKED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold border ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading staff credentials...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No matching staff records.</div>
            ) : (
              filtered.map((c) => {
                const isSelected = activeCard?.employeeId === c.employeeId;
                const isChecked = checkedIds.includes(c.employeeId);
                const rowColor = c.customColor || c.brandColor;
                const spec = ID_CARD_LEVELS[c.cardLevel];
                return (
                  <div
                    key={c.employeeId}
                    onClick={() => setSelectedId(c.employeeId)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-slate-50 border-l-4' : 'hover:bg-slate-50'
                    }`}
                    style={isSelected ? { borderLeftColor: rowColor } : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleCheck(c.employeeId)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      <span
                        className="h-8 w-8 rounded-full border flex items-center justify-center overflow-hidden bg-slate-50 shrink-0 text-[10px] font-extrabold"
                        style={{ borderColor: rowColor, color: rowColor }}
                      >
                        {c.avatarUrl && !failedAvatars[c.employeeId] ? (
                          <img
                            src={c.avatarUrl}
                            alt={c.legalName}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            onError={() =>
                              setFailedAvatars((prev) => ({ ...prev, [c.employeeId]: true }))
                            }
                          />
                        ) : (
                          c.legalName
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join('')
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">{c.legalName}</div>
                        <div className="text-[10.5px] text-slate-500 truncate">
                          {c.subsidiaryName} · {c.employeeNumber}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold border ${spec.badgeCls}`}>
                        {spec.code}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold ${
                          c.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : c.status === 'REVOKED'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: 10-Level ID Card Studio */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          {!activeCard ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Select a staff member on the left to preview or issue their level-based ID card.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">{activeCard.legalName}</div>
                  <div className="text-xs text-slate-500">
                    Branded for <strong style={{ color: cardPrimary }}>{activeCard.subsidiaryName}</strong> ·{' '}
                    <span className="font-bold text-slate-700">{levelSpec.code} — {levelSpec.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                    {(['portrait', 'landscape'] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOrientation(o)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize ${
                          orientation === o ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => mutateCards('ISSUE_CARD', [activeCard.employeeId])}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                    style={{ background: cardGradient }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {activeCard.status === 'ACTIVE' ? 'Save & Reissue' : 'Issue Card'}
                  </button>
                  {activeCard.status === 'ACTIVE' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => mutateCards('REVOKE_CARD', [activeCard.employeeId])}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => printCards([activeCard])}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Card
                  </button>
                </div>
              </div>

              {/* Level 1-10 Selector, Color Designer & Management Signature */}
              <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3.5 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700">
                      Credential Level (10 Distinct Designs):
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      {levelSpec.clearanceLabel} · {levelSpec.facilityScope}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                    {ID_CARD_LEVEL_LIST.map((lvl) => {
                      const isSel = cardLevel === lvl.level;
                      return (
                        <button
                          key={lvl.level}
                          type="button"
                          title={`${lvl.code}: ${lvl.name}`}
                          onClick={() => setCardLevel(lvl.level)}
                          className={`rounded-lg py-1.5 px-1 text-center border transition ${
                            isSel
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-[10.5px] font-black leading-none">{lvl.code}</div>
                          <div className={`text-[8px] truncate mt-0.5 ${isSel ? 'text-slate-300' : 'text-slate-400'}`}>
                            {lvl.shortTitle.split(' ')[0]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    <Palette className="h-3.5 w-3.5" style={{ color: cardPrimary }} />
                    Multi-Color Designer
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => void handleSignatureUpload(e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Upload className="h-3 w-3" />
                      {managementSignatureUrl ? 'Replace Mgmt Signature' : 'Upload Mgmt Signature'}
                    </button>
                    {managementSignatureUrl && (
                      <button
                        type="button"
                        onClick={() => void clearSignature()}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10.5px] font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3 w-3" /> Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {CARD_PALETTES.map((pal) => {
                    const active =
                      cardPrimary.toLowerCase() === pal.primary.toLowerCase() &&
                      cardSecondary.toLowerCase() === pal.secondary.toLowerCase();
                    return (
                      <button
                        key={pal.label}
                        type="button"
                        title={pal.label}
                        onClick={() => {
                          setCustomPrimary(pal.primary);
                          setCustomSecondary(pal.secondary);
                        }}
                        className={`h-6 w-10 rounded-lg border transition flex items-center justify-center ${
                          active ? 'ring-2 ring-slate-900 ring-offset-1' : 'border-slate-200'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${pal.primary}, ${pal.secondary})` }}
                      />
                    );
                  })}

                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(cardPrimary) ? cardPrimary : '#2563eb'}
                      onChange={(e) => setCustomPrimary(e.target.value)}
                      className="h-4 w-4 border-0 p-0 bg-transparent cursor-pointer"
                    />
                    Primary
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(cardSecondary) ? cardSecondary : '#0ea5e9'}
                      onChange={(e) => setCustomSecondary(e.target.value)}
                      className="h-4 w-4 border-0 p-0 bg-transparent cursor-pointer"
                    />
                    Accent
                  </label>
                  {(customPrimary || customSecondary) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPrimary(null);
                        setCustomSecondary(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      <RotateCcw className="h-3 w-3" /> Subsidiary Default
                    </button>
                  )}
                </div>
              </div>

              {/* Front & Back Live Preview */}
              <div
                className="flex flex-wrap items-center justify-center gap-8 py-6 bg-[#f8fafc] rounded-2xl border border-slate-200 px-4"
                style={{
                  fontFamily:
                    cardLevel === 7 || cardLevel === 9 || cardLevel === 10
                      ? 'var(--font-serif-lux), var(--font-jakarta), Georgia, serif'
                      : cardLevel === 3 || cardLevel === 5 || cardLevel === 8
                      ? 'var(--font-space), var(--font-jakarta), ui-sans-serif, sans-serif'
                      : 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif',
                }}
              >
                <IdCardFront
                  card={activeCard}
                  level={cardLevel}
                  orientation={orientation}
                  primaryColor={cardPrimary}
                  secondaryColor={cardSecondary}
                  avatarFailed={Boolean(failedAvatars[activeCard.employeeId])}
                  onAvatarError={() =>
                    setFailedAvatars((prev) => ({ ...prev, [activeCard.employeeId]: true }))
                  }
                  managementSignatureUrl={managementSignatureUrl}
                  previewIssuedDate={previewDates.issued}
                  previewExpiresDate={previewDates.expires}
                />
                <IdCardBack
                  card={activeCard}
                  level={cardLevel}
                  orientation={orientation}
                  primaryColor={cardPrimary}
                  secondaryColor={cardSecondary}
                  avatarFailed={Boolean(failedAvatars[activeCard.employeeId])}
                  onAvatarError={() =>
                    setFailedAvatars((prev) => ({ ...prev, [activeCard.employeeId]: true }))
                  }
                  managementSignatureUrl={managementSignatureUrl}
                  previewIssuedDate={previewDates.issued}
                  previewExpiresDate={previewDates.expires}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
