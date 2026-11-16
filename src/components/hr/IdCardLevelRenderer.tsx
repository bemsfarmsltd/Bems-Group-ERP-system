'use client';

import React from 'react';
import { ID_CARD_LEVELS, type IdCardLevel } from '@/lib/id-card-levels';

export interface RenderableIdCard {
  employeeId: string;
  employeeNumber: string;
  legalName: string;
  workEmail: string;
  role: string;
  jobTitle: string;
  staffGrade?: string | null;
  departmentName: string;
  subsidiaryName: string;
  subsidiaryCode: string;
  brandColor: string;
  logoUrl: string;
  avatarUrl?: string | null;
  cardLevel: IdCardLevel;
  customAdminTitle?: string | null;
  systemClearance?: string[];
  cardNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  qrDataUrl?: string;
}

interface RendererProps {
  card: RenderableIdCard;
  level: IdCardLevel;
  orientation: 'portrait' | 'landscape';
  primaryColor: string;
  secondaryColor: string;
  avatarFailed: boolean;
  onAvatarError: () => void;
  managementSignatureUrl?: string | null;
  previewIssuedDate: string;
  previewExpiresDate: string;
}

function getInitials(name: string): string {
  return String(name || 'ST')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function SecurityBarcode({
  code,
  color = '#0f172a',
  vertical = false,
  light = false,
}: {
  code: string;
  color?: string;
  vertical?: boolean;
  light?: boolean;
}) {
  const widths = [2, 1, 3, 1, 2, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 2, 3, 1, 2, 1, 2, 1, 3];
  if (vertical) {
    return (
      <div className="bg-white rounded-md p-1.5 flex flex-col items-center gap-[1.5px] shadow-xs shrink-0">
        {widths.slice(0, 20).map((w, idx) => (
          <span
            key={idx}
            className="block w-5 rounded-[0.5px]"
            style={{ height: w, backgroundColor: idx % 4 === 0 ? color : '#0f172a' }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-0.5 shrink-0">
      <div className="flex items-end gap-[1.5px] h-3.5 overflow-hidden">
        {widths.map((w, idx) => (
          <span
            key={idx}
            className="inline-block h-full rounded-[0.5px]"
            style={{ width: w, backgroundColor: light ? '#ffffff' : idx % 3 === 0 ? color : '#0f172a' }}
          />
        ))}
      </div>
      <span
        className={`text-[6.8px] font-bold tracking-tight whitespace-nowrap ${light ? 'text-white/90' : 'text-slate-700'}`}
        style={{ fontFamily: FONT_MONO_TECH }}
      >
        {code}
      </span>
    </div>
  );
}

function AvatarFrame({
  card,
  avatarFailed,
  onAvatarError,
  sizeClass,
  ringColor,
  roundedClass = 'rounded-full',
  clipHex = false,
  doubleHalo = false,
}: {
  card: RenderableIdCard;
  avatarFailed: boolean;
  onAvatarError: () => void;
  sizeClass: string;
  ringColor: string;
  roundedClass?: string;
  clipHex?: boolean;
  doubleHalo?: boolean;
}) {
  const hexStyle = clipHex
    ? { clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)' }
    : undefined;

  const imgEl =
    card.avatarUrl && !avatarFailed ? (
      <img
        src={card.avatarUrl}
        alt={card.legalName}
        onError={onAvatarError}
        className={`${sizeClass} ${clipHex ? '' : roundedClass} object-cover bg-slate-100 block`}
        style={hexStyle}
      />
    ) : (
      <div
        className={`${sizeClass} ${clipHex ? '' : roundedClass} flex items-center justify-center font-black text-lg bg-slate-100 text-slate-700`}
        style={hexStyle}
      >
        {getInitials(card.legalName)}
      </div>
    );

  if (clipHex) {
    return (
      <div className="p-[3px] shrink-0 shadow-md" style={{ backgroundColor: ringColor, ...hexStyle }}>
        {imgEl}
      </div>
    );
  }

  if (doubleHalo) {
    return (
      <div className={`p-[3px] ${roundedClass} bg-white shadow-md shrink-0`}>
        <div className={`p-[4px] ${roundedClass}`} style={{ backgroundColor: ringColor }}>
          <div className={`p-[2px] ${roundedClass} bg-white`}>{imgEl}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-[3px] ${roundedClass} shrink-0 shadow-md bg-white`}
      style={{ border: `3.5px solid ${ringColor}` }}
    >
      {imgEl}
    </div>
  );
}

function EmvChip({ gold = false }: { gold?: boolean }) {
  return (
    <div
      className="w-8 h-6 rounded-md border flex items-center justify-center shrink-0 shadow-xs"
      style={{
        background: gold
          ? 'linear-gradient(135deg, #fef08a 0%, #f59e0b 52%, #fde68a 100%)'
          : 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 52%, #e2e8f0 100%)',
        borderColor: gold ? '#b45309' : '#94a3b8',
      }}
    >
      <div
        className="w-5 h-3.5 rounded-[2px] border grid grid-cols-2"
        style={{ borderColor: gold ? '#92400e70' : '#64748b70' }}
      >
        <div className="border-r" style={{ borderColor: gold ? '#92400e45' : '#64748b45' }} />
      </div>
    </div>
  );
}

function ManagementSignatureBlock({
  signatureUrl,
  accentColor,
  light = false,
  centered = false,
}: {
  signatureUrl?: string | null;
  accentColor: string;
  light?: boolean;
  centered?: boolean;
}) {
  return (
    <div className={`flex flex-col ${centered ? 'items-center' : 'items-start'} min-w-0`}>
      <div className="h-12 flex items-end">
        {signatureUrl ? (
          <img
            src={signatureUrl}
            alt="Management Signature"
            className="max-h-12 max-w-[165px] w-auto object-contain mix-blend-multiply"
          />
        ) : (
          <svg viewBox="0 0 150 34" className="h-10 w-32" fill="none" aria-label="Authorized Management Signature">
            <path
              d="M6 25 C12 10, 20 6, 22 22 C24 30, 32 10, 40 16 C45 20, 48 24, 54 14 C58 8, 63 24, 70 18 C78 12, 85 22, 95 16 C104 11, 114 21, 128 14 C135 11, 141 15, 145 14"
              stroke={light ? '#ffffff' : '#0f172a'}
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M14 28 C44 26, 92 25, 138 24" stroke={light ? '#fde68a' : accentColor} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
          </svg>
        )}
      </div>
      <div
        className={`text-[6px] font-black uppercase tracking-wider border-t pt-0.5 mt-0.5 whitespace-nowrap ${
          light ? 'text-white/90 border-white/40' : 'text-slate-600 border-slate-300'
        }`}
      >
        Auth. Signature
      </div>
    </div>
  );
}

function SystemQrBlock({
  qrDataUrl,
  level,
  accentColor,
  size = 70,
  lightLabel = false,
}: {
  qrDataUrl?: string;
  level: IdCardLevel;
  accentColor: string;
  size?: number;
  lightLabel?: boolean;
}) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="p-1.5 rounded-xl bg-white shadow-xs" style={{ border: `1.5px solid ${accentColor}40` }}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="System Verification QR" style={{ width: size, height: size }} />
        ) : (
          <div style={{ width: size, height: size }} className="bg-slate-100 rounded flex items-center justify-center text-[8px] font-bold text-slate-400">
            SYS-QR
          </div>
        )}
      </div>
      <span
        className={`mt-1 text-[6.8px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${
          lightLabel ? 'bg-white/20 text-white' : 'bg-white/95'
        }`}
        style={lightLabel ? undefined : { color: accentColor, border: `1px solid ${accentColor}30` }}
      >
        L{level} · HMAC-SHA256
      </span>
    </div>
  );
}

function TermsList({
  subsidiaryName,
  facilityScope,
  light = false,
}: {
  subsidiaryName: string;
  facilityScope: string;
  light?: boolean;
}) {
  return (
    <ul className={`text-[6.8px] leading-[1.35] space-y-0.5 list-disc pl-3 ${light ? 'text-white/90' : 'text-slate-600'}`}>
      <li>Property of {subsidiaryName} (BEMS Group). Non-transferable; wear visibly on duty.</li>
      <li>Valid for {facilityScope}. Internal QR scan required for gated access.</li>
      <li>Report loss to HR/Security immediately. Surrender upon exit or revocation.</li>
    </ul>
  );
}

function SecurityGuilloche({ color, opacity = 0.1 }: { color: string; opacity?: number }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 450" preserveAspectRatio="none" style={{ opacity }}>
      <circle cx="250" cy="360" r="115" fill="none" stroke={color} strokeWidth="1.1" />
      <circle cx="250" cy="360" r="90" fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="4 3" />
      <circle cx="250" cy="360" r="65" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

const FONT_SANS = 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-space), var(--font-jakarta), ui-sans-serif, sans-serif';
const FONT_SERIF_LUX = 'var(--font-serif-lux), Georgia, serif';
const FONT_MONO_TECH = 'var(--font-mono-tech), ui-monospace, monospace';

function getClearanceItemsForLevel(card: RenderableIdCard, level: IdCardLevel): string[] {
  const spec = ID_CARD_LEVELS[level];
  if (level === 10) return ['Full Group Clearance', 'GMD Wallet & AI', 'All Modules'];
  if (level === 9) return ['Executive Clearance', 'Control Center', 'Data Center L9'];
  if (level === 8) {
    if (card.cardLevel === 8 && card.systemClearance && card.systemClearance.length > 0) {
      return card.systemClearance.slice(0, 3);
    }
    return ['Scoped Admin Portal', 'ERP Audit Gates'];
  }
  return [spec.systemScope];
}

export function IdCardFront({
  card,
  level,
  orientation,
  primaryColor,
  secondaryColor,
  avatarFailed,
  onAvatarError,
  previewIssuedDate,
  previewExpiresDate,
}: RendererProps) {
  const spec = ID_CARD_LEVELS[level];
  const isPortrait = orientation === 'portrait';
  const cardDim = isPortrait ? 'w-[292px] h-[460px]' : 'w-[454px] h-[284px]';
  const clearanceItems = getClearanceItemsForLevel(card, level);
  const frontFont =
    level === 7 || level === 9 || level === 10
      ? FONT_SERIF_LUX
      : level === 3 || level === 5 || level === 8
      ? FONT_DISPLAY
      : FONT_SANS;

  // LEVEL 1 — Curved Header + Halftone Dots + Double-Halo Circle Photo + Info Rows + Bottom Wave
  if (level === 1) {
    const teal = primaryColor || '#0d6e6e';
    const mint = secondaryColor || '#0f9b8e';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div
          className="relative px-4 pt-4 pb-14 text-white flex flex-col items-center text-center overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${teal} 0%, ${mint} 100%)`,
            borderBottomLeftRadius: '50% 24%',
            borderBottomRightRadius: '50% 24%',
          }}
        >
          <svg viewBox="0 0 300 130" className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" preserveAspectRatio="none">
            <defs>
              <pattern id="l1dots" width="8" height="8" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="#ffffff" />
              </pattern>
            </defs>
            <path d="M0,0 Q60,65 0,130 Z" fill="url(#l1dots)" />
            <path d="M300,0 Q240,65 300,130 Z" fill="url(#l1dots)" />
          </svg>
          <div className="relative z-10 flex flex-col items-center">
            <img src={card.logoUrl} alt={card.subsidiaryName} className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow-xs" />
            <span className="text-[11px] font-black tracking-widest uppercase mt-1 truncate max-w-[210px]">{card.subsidiaryName}</span>
          </div>
        </div>

        <div className="relative z-10 -mt-14 flex flex-col items-center px-4 text-center">
          <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-[84px] h-[84px]" ringColor={teal} roundedClass="rounded-full" doubleHalo />
          <div className="mt-2 text-[15px] font-black text-slate-900 uppercase tracking-wide leading-tight truncate max-w-full">
            {card.legalName}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mt-0.5 truncate max-w-full">
            {card.jobTitle}
          </div>
        </div>

        <div className="px-6 py-1 space-y-1.5 text-[8.5px]">
          <div className="flex gap-2"><span className="w-16 font-extrabold text-slate-700 uppercase shrink-0">E-MAIL</span><span className="font-medium text-slate-700 truncate">: {card.workEmail}</span></div>
          <div className="flex gap-2"><span className="w-16 font-extrabold text-slate-700 uppercase shrink-0">STAFF ID</span><span className="font-bold text-slate-800 truncate">: {card.employeeNumber}</span></div>
          <div className="flex gap-2"><span className="w-16 font-extrabold text-slate-700 uppercase shrink-0">CLEARANCE</span><span className="font-bold truncate" style={{ color: teal }}>: L1 · {spec.shortTitle}</span></div>
        </div>

        <div className="relative pt-2">
          <div className="px-3 flex justify-between text-[7px] font-bold text-slate-400 tracking-[4px] select-none">
            <span>+++++</span>
            <span>+++++</span>
          </div>
          <div
            className="h-7 w-full flex items-center justify-between px-5 text-white text-[7px] font-mono font-bold"
            style={{
              background: `linear-gradient(90deg, ${teal} 0%, ${mint} 100%)`,
              borderTopLeftRadius: '32% 45%',
              borderTopRightRadius: '32% 45%',
            }}
          >
            <span className="whitespace-nowrap">{card.cardNumber}</span>
            <span className="shrink-0">L1 PASS</span>
          </div>
        </div>
      </div>
    );
  }

  // LEVEL 2 — Sweeping Dual-Arc Corners (legible dark text in center white zone)
  if (level === 2) {
    const navy = primaryColor || '#0f2557';
    const orange = secondaryColor || '#f97316';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <svg viewBox="0 0 300 100" className="absolute top-0 left-0 w-full h-24 pointer-events-none" preserveAspectRatio="none">
          <path d="M0,0 L110,0 C40,20 15,50 0,85 Z" fill={navy} />
          <path d="M115,0 L300,0 L300,82 C255,35 190,12 115,0 Z" fill={navy} />
          <path d="M105,0 L205,0 C250,20 280,45 300,72 L300,88 C255,38 190,12 105,0 Z" fill={orange} />
        </svg>
        <svg viewBox="0 0 300 100" className="absolute bottom-0 left-0 w-full h-24 pointer-events-none" preserveAspectRatio="none">
          <path d="M0,18 C35,55 100,82 190,100 L0,100 Z" fill={navy} />
          <path d="M0,12 C45,58 115,84 195,100 L155,100 C85,84 35,58 0,28 Z" fill={orange} />
          <path d="M210,100 C255,80 280,55 300,25 L300,100 Z" fill={navy} />
        </svg>

        <div className="relative z-10 pt-5 px-4 flex flex-col items-center text-center">
          <img src={card.logoUrl} alt={card.subsidiaryName} className="w-8 h-8 rounded-full object-contain bg-white border border-slate-200 p-0.5 shadow-xs" />
          <div className="text-[11px] font-black text-slate-900 mt-1 truncate max-w-[185px]">{card.subsidiaryName}</div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-5 my-auto">
          <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-[88px] h-[88px]" ringColor={navy} roundedClass="rounded-full" />
          <div className="mt-2.5 text-[15px] font-black text-slate-900 leading-tight truncate max-w-full">{card.legalName}</div>
          <div className="text-[11px] font-semibold text-slate-700 truncate max-w-full">{card.jobTitle}</div>
          <div className="mt-2 space-y-0.5 text-[8.5px] text-slate-700">
            <div className="font-bold">{card.employeeNumber} · L2 FIELD</div>
            <div className="truncate max-w-[215px]">{card.workEmail}</div>
            <div className="truncate max-w-[215px] text-slate-500">{card.departmentName}</div>
          </div>
        </div>

        <div className="relative z-10 pb-5 px-4 flex justify-center">
          <span className="px-3 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[7px] font-mono font-bold text-slate-800 whitespace-nowrap">
            {card.cardNumber} · L2
          </span>
        </div>
      </div>
    );
  }

  // LEVEL 3 — Bold "Staff Card" Typo + Plus Watermark + Diagonal Lower Block with Vertical Barcode
  if (level === 3) {
    const blue = primaryColor || '#0055ff';
    const mint = secondaryColor || '#10b981';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#f4f6f9] shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div className="relative px-4 pt-4 pb-2 flex-1 flex flex-col justify-between">
          <div className="absolute -right-2 top-2 w-24 h-24 opacity-45 pointer-events-none font-black text-[90px] leading-none flex items-center justify-center" style={{ color: mint }}>+</div>
          <div className="relative z-10 flex items-center gap-2">
            <img src={card.logoUrl} alt={card.subsidiaryName} className="w-6 h-6 rounded-md object-contain bg-white border border-slate-200 p-0.5" />
            <span className="text-[10px] font-extrabold text-slate-800 truncate max-w-[170px]">{card.subsidiaryName}</span>
          </div>
          <div className="relative z-10 my-auto space-y-1.5">
            <div className="leading-[0.92]">
              <div className="text-[30px] font-black text-slate-900 tracking-tight">Staff</div>
              <div className="text-[30px] font-black tracking-tight" style={{ color: blue }}>Card</div>
            </div>
            <div className="text-[8.5px] font-bold text-slate-600 leading-snug max-w-[200px]">
              {card.departmentName}
            </div>
            <div className="inline-block px-2 py-0.5 rounded bg-white border border-slate-200 text-[7.5px] font-extrabold text-slate-700">
              {spec.clearanceLabel}
            </div>
          </div>
          <div className="text-[9px] tracking-[4px] font-bold text-slate-400">::::</div>
        </div>

        <div
          className="relative px-4 pt-4 pb-3.5 text-white"
          style={{
            background: `linear-gradient(155deg, ${blue} 0%, ${blue} 85%, ${mint} 100%)`,
            clipPath: 'polygon(0 12%, 100% 0, 100% 100%, 0% 100%)',
          }}
        >
          <div className="flex items-end gap-3 pt-2">
            <SecurityBarcode code={card.cardNumber} color={blue} vertical />
            <div className="flex-1 min-w-0 flex flex-col items-start">
              <div className="bg-white p-1 rounded-t-full rounded-b-xl shadow-md mb-2">
                {card.avatarUrl && !avatarFailed ? (
                  <img src={card.avatarUrl} alt={card.legalName} onError={onAvatarError} className="w-[82px] h-[82px] rounded-t-full rounded-b-lg object-cover block" />
                ) : (
                  <div className="w-[82px] h-[82px] rounded-t-full rounded-b-lg bg-slate-100 flex items-center justify-center font-black text-slate-700">
                    {getInitials(card.legalName)}
                  </div>
                )}
              </div>
              <div className="text-[15px] font-black leading-tight truncate w-full">{card.legalName}</div>
              <div className="text-[9px] font-bold opacity-90 truncate w-full">{card.jobTitle}</div>
              <div className="text-[8px] font-mono opacity-85 mt-0.5">#{card.employeeNumber} · L3</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LEVEL 4 — Geometric Triangle Facets + Soft Grey Circles + Hexagonal Photo + Barcode
  if (level === 4) {
    const dark = primaryColor || '#1e293b';
    const gold = secondaryColor || '#eab308';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#f8fafc] shadow-xl overflow-hidden flex flex-col justify-between p-4 border border-slate-200`}>
        <div className="absolute -right-8 top-14 w-36 h-36 rounded-full bg-slate-200/45 pointer-events-none" />
        <div className="absolute -left-10 bottom-16 w-40 h-40 rounded-full bg-slate-200/45 pointer-events-none" />
        <svg viewBox="0 0 120 120" className="absolute top-0 right-0 w-24 h-24 pointer-events-none">
          <polygon points="40,0 120,0 120,75" fill={dark} />
          <polygon points="20,0 60,0 40,24" fill={gold} />
          <polygon points="95,45 120,25 120,68" fill={gold} />
        </svg>
        <svg viewBox="0 0 120 120" className="absolute bottom-0 left-0 w-24 h-24 pointer-events-none">
          <polygon points="0,50 0,120 75,120" fill={dark} />
          <polygon points="0,35 28,60 0,80" fill={gold} />
          <polygon points="45,95 85,120 55,120" fill={gold} />
        </svg>

        <div className="relative z-10 flex items-center gap-2 pt-1">
          <img src={card.logoUrl} alt={card.subsidiaryName} className="w-7 h-7 rounded-md object-contain bg-white border border-slate-200 p-0.5" />
          <div className="min-w-0">
            <div className="text-[11px] font-black text-slate-900 truncate max-w-[155px]">{card.subsidiaryName}</div>
            <div className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: dark }}>L4 · SPECIALIST</div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center my-auto">
          <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-24 h-24" ringColor={dark} clipHex />
          <div className="mt-2.5 text-[15px] font-black text-slate-900 truncate max-w-full">{card.legalName}</div>
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate max-w-full">{card.jobTitle}</div>
          <div className="text-[8px] text-slate-500 truncate max-w-full mt-0.5">{card.departmentName}</div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-1 pb-1">
          <SecurityBarcode code={card.cardNumber} color={dark} />
          <div className="text-[8px] font-semibold text-slate-500 truncate max-w-[200px]">{card.workEmail}</div>
        </div>
      </div>
    );
  }

  // LEVEL 5 — Split-Level Slate & Curved Bronze/Accent Card
  if (level === 5) {
    const slateTop = '#18181b';
    const bronze = primaryColor || '#927038';
    const parts = card.legalName.trim().split(/\s+/);
    const firstName = parts[0] || card.legalName;
    const restName = parts.slice(1).join(' ');
    return (
      <div className={`${cardDim} relative rounded-[20px] shadow-xl overflow-hidden flex flex-col border border-slate-300`} style={{ backgroundColor: slateTop }}>
        <div className="relative flex-1 p-4 flex items-center justify-between text-white">
          <div className="z-10 max-w-[54%] space-y-2">
            <div className="w-4 h-4" style={{ backgroundColor: bronze, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            <div className="leading-[1.02]">
              <div className="text-[18px] font-light tracking-tight truncate">{firstName}</div>
              <div className="text-[18px] font-black tracking-tight truncate">{restName || spec.shortTitle}</div>
            </div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-widest text-slate-300 leading-snug">{card.jobTitle}</div>
              <div className="w-8 h-[2px] mt-1" style={{ backgroundColor: bronze }} />
            </div>
            <div className="text-[7.5px] font-mono text-amber-300">L5 · DEV // ENG</div>
          </div>
          <div className="z-10 self-end">
            <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-24 h-28" ringColor={bronze} roundedClass="rounded-xl" />
          </div>
        </div>

        <div
          className="relative px-4 py-4 text-white flex items-center justify-between gap-3"
          style={{ background: `linear-gradient(135deg, ${bronze} 0%, ${secondaryColor} 100%)`, borderTopRightRadius: '44px' }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center p-1">
              <img src={card.logoUrl} alt={card.subsidiaryName} className="w-full h-full object-contain rounded-full bg-white" />
            </div>
            <span className="text-[11px] font-black tracking-wider uppercase [writing-mode:vertical-rl] rotate-180">
              {card.subsidiaryCode}
            </span>
          </div>
          <div className="flex-1 min-w-0 space-y-1 text-[8px]">
            <div className="font-black tracking-wider uppercase">EMPLOYEE ID: {card.employeeNumber}</div>
            <div className="w-10 h-[1.5px] bg-white/70" />
            <div className="opacity-90 truncate">{card.departmentName}</div>
            <div className="opacity-90">Issued: {previewIssuedDate}</div>
            <div className="opacity-90">Expires: {previewExpiresDate}</div>
          </div>
        </div>
      </div>
    );
  }

  // LEVEL 6 — Angled Corner Ribbons + Halftone Dot Background + Dotted Box
  if (level === 6) {
    const green = primaryColor || '#15803d';
    const lime = secondaryColor || '#65a30d';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between p-4 border border-slate-200`}>
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 2px, transparent 2px)',
            backgroundSize: '14px 14px',
            maskImage: 'radial-gradient(circle at 20% 25%, black, transparent 65%)',
          }}
        />
        <svg viewBox="0 0 300 80" className="absolute top-0 left-0 w-full h-16 pointer-events-none" preserveAspectRatio="none">
          <polygon points="0,0 135,0 0,65" fill={green} />
          <polygon points="150,0 300,0 300,55" fill={lime} />
        </svg>
        <svg viewBox="0 0 300 50" className="absolute bottom-0 left-0 w-full h-10 pointer-events-none" preserveAspectRatio="none">
          <polygon points="210,50 300,5 300,50" fill={lime} />
          <rect x="0" y="38" width="300" height="12" fill={green} />
        </svg>

        <div className="relative z-10 flex flex-col items-center pt-1">
          <img src={card.logoUrl} alt={card.subsidiaryName} className="w-7 h-7 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shadow-xs" />
          <div className="text-[11px] font-black text-slate-900 mt-1 truncate max-w-[190px]">{card.subsidiaryName}</div>
          <div className="text-[7.5px] font-bold uppercase" style={{ color: green }}>L6 · SQUAD LEAD</div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center my-auto">
          <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-20 h-20" ringColor={lime} roundedClass="rounded-full" />
          <div className="mt-2 text-[15px] font-black truncate max-w-full" style={{ color: green }}>{card.legalName}</div>
          <div className="text-[10px] font-bold text-slate-700 truncate max-w-full">{card.jobTitle}</div>
          <div className="mt-2.5 w-full rounded-lg border-2 border-dotted px-3 py-1.5 text-left text-[8px] space-y-0.5 bg-white/95" style={{ borderColor: green }}>
            <div className="truncate"><strong className="text-slate-600">Email:</strong> {card.workEmail}</div>
            <div className="truncate"><strong className="text-slate-600">Staff ID:</strong> {card.employeeNumber} · L6</div>
          </div>
        </div>

        <div className="relative z-10 pb-3 flex justify-center">
          <SecurityBarcode code={card.cardNumber} color={green} />
        </div>
      </div>
    );
  }

  // LEVEL 7 — Classic Editorial Top Frame + Ornamental Divider + Rich Gradient Bottom Half
  if (level === 7) {
    const brown = primaryColor || '#452715';
    const accent7 = secondaryColor || '#78350f';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col border border-slate-300`}>
        <div className="relative flex-1 p-3.5 flex flex-col items-center justify-center">
          <div className="w-full h-full rounded-t-xl border-t-2 border-x-2 pt-2.5 pb-8 px-3 flex flex-col items-center justify-center text-center" style={{ borderColor: brown }}>
            <img src={card.logoUrl} alt={card.subsidiaryName} className="w-7 h-7 rounded-md object-contain bg-white border border-slate-200 p-0.5 mb-1" />
            <div className="text-[9.5px] font-black tracking-widest uppercase text-slate-800 truncate max-w-full">{card.subsidiaryName}</div>
            <div className="flex items-center gap-1.5 my-1">
              <span className="w-10 h-[1px]" style={{ backgroundColor: brown }} />
              <span className="text-[9px]" style={{ color: brown }}>❖</span>
              <span className="w-10 h-[1px]" style={{ backgroundColor: brown }} />
            </div>
            <div className="text-[12.5px] font-serif font-bold tracking-wide text-slate-900 uppercase leading-tight">
              DEPARTMENT COMMAND
            </div>
            <div className="text-[8px] font-bold tracking-wider text-slate-500 mt-0.5 truncate max-w-full">
              LEVEL 7 · {card.departmentName}
            </div>
          </div>
        </div>

        <div className="relative z-20 -my-12 flex justify-center">
          <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-24 h-24" ringColor={brown} roundedClass="rounded-full" />
        </div>

        <div
          className="pt-14 pb-4 px-4 text-center text-white flex flex-col items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${brown} 0%, ${accent7} 100%)` }}
        >
          <div className="text-[14px] font-serif font-bold tracking-wide uppercase truncate max-w-full">{card.legalName}</div>
          <div className="text-[8.5px] tracking-[0.16em] uppercase opacity-90 mt-0.5 truncate max-w-full">{card.jobTitle}</div>
          <div className="mt-2.5">
            <SecurityBarcode code={card.cardNumber} light />
          </div>
        </div>
      </div>
    );
  }

  // LEVEL 8 — Bold "ADMIN PASS" + 3D Halftone Wave + Cream Lower Block
  if (level === 8) {
    const crimson = primaryColor || '#dc2626';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#fffbf5] shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div
          className="relative px-4 pt-4 pb-3 text-white flex flex-col justify-between overflow-hidden"
          style={{ background: `linear-gradient(155deg, ${crimson} 0%, ${secondaryColor} 100%)` }}
        >
          <div className="flex items-center justify-between text-[8px] font-bold relative z-10">
            <div className="flex items-center gap-1.5 min-w-0">
              <img src={card.logoUrl} alt={card.subsidiaryName} className="w-5 h-5 rounded object-contain bg-white p-0.5" />
              <span className="uppercase tracking-wider truncate">{card.subsidiaryName}</span>
            </div>
            <EmvChip />
          </div>
          <div className="my-2 leading-[0.88] relative z-10">
            <div className="text-[32px] font-black tracking-tighter uppercase">ADMIN</div>
            <div className="text-[32px] font-black tracking-tighter uppercase">PASS</div>
          </div>
          <svg viewBox="0 0 300 45" className="w-full h-7 opacity-40" preserveAspectRatio="none">
            <defs>
              <pattern id="l8wave" width="6" height="6" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="#ffffff" />
              </pattern>
            </defs>
            <path d="M0,20 Q75,0 150,22 T300,15 L300,45 L0,45 Z" fill="url(#l8wave)" />
          </svg>
        </div>

        <div className="px-4 py-3 flex-1 flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass="w-14 h-14" ringColor={crimson} roundedClass="rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black text-slate-900 truncate">{card.legalName}</div>
              <div className="text-[9.5px] font-bold truncate" style={{ color: crimson }}>{card.customAdminTitle || card.jobTitle}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {clearanceItems.slice(0, 2).map((m) => (
                  <span key={m} className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-[7px]">
            <span className="font-mono font-bold text-slate-700 whitespace-nowrap">{card.cardNumber}</span>
            <span className="font-black uppercase shrink-0" style={{ color: crimson }}>L8 · ADMIN</span>
          </div>
        </div>
      </div>
    );
  }

  // LEVEL 9 & LEVEL 10 — Sovereign Executive Spine
  const isGmd = level === 10;
  const spineBg = isGmd
    ? 'linear-gradient(180deg, #fef3c7 0%, #f59e0b 48%, #b45309 100%)'
    : 'linear-gradient(180deg, #e2e8f0 0%, #64748b 50%, #0f172a 100%)';
  const accent = isGmd ? '#b45309' : '#0f172a';
  const borderCol = isGmd ? '#d97706' : '#475569';

  return (
    <div
      className={`${cardDim} relative rounded-[20px] shadow-[0_22px_50px_-14px_rgba(15,23,42,0.22)] overflow-hidden flex border-2`}
      style={{
        borderColor: borderCol,
        background: isGmd
          ? 'linear-gradient(155deg, #fffbeb 0%, #ffffff 50%, #fef3c7 100%)'
          : 'linear-gradient(155deg, #f8fafc 0%, #ffffff 52%, #e2e8f0 100%)',
      }}
    >
      <div className="w-10 shrink-0 flex flex-col items-center justify-between py-4 px-1" style={{ background: spineBg }}>
        <span className={`text-[8px] font-black tracking-[0.22em] uppercase [writing-mode:vertical-rl] rotate-180 ${isGmd ? 'text-amber-950' : 'text-white'}`}>
          {isGmd ? 'L10 · SOVEREIGN MASTER' : 'L9 · EXECUTIVE & DC'}
        </span>
        <span className="w-6 h-6 rounded-full bg-white text-slate-900 font-black text-[9px] flex items-center justify-center shadow">
          L{level}
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col justify-between relative">
        <SecurityGuilloche color={accent} opacity={0.1} />
        <div className="relative z-10 flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <img src={card.logoUrl} alt={card.subsidiaryName} className="w-8 h-8 rounded-lg object-contain border border-slate-300 bg-white p-0.5" />
            <div className="min-w-0">
              <div className="text-[11px] font-black text-slate-900 truncate">{card.subsidiaryName}</div>
              <div className="text-[7.5px] font-black tracking-widest uppercase" style={{ color: accent }}>
                {isGmd ? 'EXECUTIVE SOVEREIGN PASS' : 'PLATINUM EXECUTIVE PASS'}
              </div>
            </div>
          </div>
          <EmvChip gold />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-3">
          <div className={`flex ${isPortrait ? 'flex-col items-center text-center' : 'items-center gap-3.5'}`}>
            <AvatarFrame card={card} avatarFailed={avatarFailed} onAvatarError={onAvatarError} sizeClass={isPortrait ? 'w-24 h-24' : 'w-20 h-20'} ringColor={borderCol} roundedClass="rounded-2xl" />
            <div className="min-w-0 flex-1 mt-2 sm:mt-0 w-full">
              <div className="text-[15px] font-black text-slate-900 leading-tight truncate">{card.legalName}</div>
              <div className="text-[11px] font-bold mt-0.5 truncate" style={{ color: accent }}>{card.jobTitle}</div>
              <div className="text-[9.5px] font-semibold text-slate-500 truncate">{card.departmentName}</div>
              <div className={`mt-1.5 flex flex-wrap gap-1 ${isPortrait ? 'justify-center' : 'justify-start'}`}>
                {clearanceItems.map((c) => (
                  <span key={c} className="text-[7.5px] font-extrabold px-1.5 py-0.5 rounded bg-white/90 text-slate-900 border border-slate-300">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
          <SecurityBarcode code={card.cardNumber} color={accent} />
          <span
            className="text-[7px] font-black uppercase px-2 py-0.5 rounded border whitespace-nowrap shrink-0"
            style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}0d` }}
          >
            {isGmd ? 'ALL-GROUP' : 'DC LEVEL 9'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function IdCardBack({
  card,
  level,
  orientation,
  primaryColor,
  secondaryColor,
  managementSignatureUrl,
  previewIssuedDate,
  previewExpiresDate,
}: RendererProps) {
  const spec = ID_CARD_LEVELS[level];
  const isPortrait = orientation === 'portrait';
  const cardDim = isPortrait ? 'w-[292px] h-[460px]' : 'w-[454px] h-[284px]';
  const clearanceItems = getClearanceItemsForLevel(card, level);

  // L1 BACK — Terms Centered at Top under Curved Header, Centered QR + Dates Below, Signature Centered above Mint Wave
  if (level === 1) {
    const teal = primaryColor || '#0d6e6e';
    const mint = secondaryColor || '#0f9b8e';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div
          className="px-4 pt-3 pb-5 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${teal}, ${mint})`, borderBottomLeftRadius: '44% 38%', borderBottomRightRadius: '44% 38%' }}
        >
          <div className="text-[10px] font-black uppercase tracking-wider truncate">{card.subsidiaryName}</div>
          <div className="text-[7.5px] opacity-90">L1 · {spec.shortTitle}</div>
        </div>

        <div className="px-5 flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
          <div className="w-full rounded-xl bg-slate-50 border border-slate-200 p-2 text-left">
            <div className="text-[7px] font-black uppercase mb-0.5" style={{ color: teal }}>Terms &amp; Conditions</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          </div>
          <SystemQrBlock qrDataUrl={card.qrDataUrl} level={1} accentColor={teal} size={76} />
          <div className="text-[8px] font-bold text-slate-700">
            Issued: <span className="text-slate-900">{previewIssuedDate}</span> · Expires: <span className="text-slate-900">{previewExpiresDate}</span>
          </div>
        </div>

        <div className="px-4 pb-2 flex items-end justify-between gap-2">
          <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={teal} />
          <span className="text-[7px] font-mono font-bold text-slate-600 whitespace-nowrap shrink-0">{card.cardNumber}</span>
        </div>
        <div
          className="h-4 w-full"
          style={{ background: `linear-gradient(90deg, ${teal}, ${mint})`, borderTopLeftRadius: '32% 55%', borderTopRightRadius: '32% 55%' }}
        />
      </div>
    );
  }

  // L2 BACK — Sweeping Dual-Arc Corners matching Image 2 Back (Terms Centered, QR + Dates Centered, Signature Centered above Bottom Arcs)
  if (level === 2) {
    const navy = primaryColor || '#0f2557';
    const orange = secondaryColor || '#f97316';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <svg viewBox="0 0 300 90" className="absolute top-0 left-0 w-full h-20 pointer-events-none" preserveAspectRatio="none">
          <path d="M0,0 L110,0 C40,20 15,45 0,78 Z" fill={navy} />
          <path d="M115,0 L300,0 L300,72 C255,30 190,10 115,0 Z" fill={navy} />
          <path d="M105,0 L205,0 C250,18 280,40 300,64 L300,78 C255,32 190,10 105,0 Z" fill={orange} />
        </svg>
        <svg viewBox="0 0 300 90" className="absolute bottom-0 left-0 w-full h-16 pointer-events-none" preserveAspectRatio="none">
          <path d="M0,25 C45,65 115,82 210,90 L0,90 Z" fill={navy} />
          <path d="M210,90 C255,75 280,55 300,25 L300,90 Z" fill={navy} />
        </svg>

        <div className="relative z-10 pt-4 px-4 flex flex-col items-center">
          <img src={card.logoUrl} alt={card.subsidiaryName} className="w-7 h-7 rounded-full bg-white p-0.5 border border-slate-200" />
          <span className="text-[10px] font-black text-slate-900 mt-0.5 truncate max-w-[180px]">{card.subsidiaryName}</span>
        </div>

        <div className="relative z-10 px-6 flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-[8.5px] font-black uppercase tracking-wider text-slate-900">Terms and Conditions:</div>
          <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          <div className="flex items-center gap-3 pt-1">
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={2} accentColor={navy} size={66} />
            <div className="text-left text-[8px] space-y-0.5">
              <div><span className="text-slate-400 font-bold block text-[6.5px] uppercase">Issued</span><span className="font-black text-slate-800">{previewIssuedDate}</span></div>
              <div><span className="text-slate-400 font-bold block text-[6.5px] uppercase">Expires</span><span className="font-black text-slate-800">{previewExpiresDate}</span></div>
              <div className="font-mono text-[7px] font-bold text-slate-500 pt-0.5">{card.cardNumber}</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pb-6 px-4 flex justify-center">
          <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={orange} centered />
        </div>
      </div>
    );
  }

  // L3 BACK — White Top with Logo & Dates, Blue Diagonal Lower Block with Terms + QR + Light Signature (Image 3 Back)
  if (level === 3) {
    const blue = primaryColor || '#0055ff';
    const mint = secondaryColor || '#10b981';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#f4f6f9] shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <img src={card.logoUrl} alt={card.subsidiaryName} className="w-6 h-6 rounded-md bg-white border border-slate-200 p-0.5" />
              <span className="text-[11px] font-black text-slate-900 truncate max-w-[165px]">{card.subsidiaryName}</span>
            </div>
            <div className="text-[8px] font-bold text-slate-500 mt-1">
              Issued: {previewIssuedDate} · Exp: {previewExpiresDate}
            </div>
          </div>
          <span className="text-3xl font-black opacity-35 leading-none" style={{ color: mint }}>+</span>
        </div>

        <div
          className="flex-1 px-4 pt-11 pb-3 flex flex-col justify-between text-white"
          style={{
            background: `linear-gradient(155deg, ${blue} 0%, ${blue} 85%, ${mint} 100%)`,
            clipPath: 'polygon(0 8%, 100% 0, 100% 100%, 0% 100%)',
          }}
        >
          <div className="space-y-1.5">
            <div className="text-[7.5px] font-black uppercase tracking-wider text-white/95">Terms &amp; Conditions</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} light />
          </div>

          <div className="flex items-center justify-between gap-2 my-auto py-1">
            <div className="space-y-1 text-[7.5px] min-w-0">
              <div className="font-mono font-bold truncate">{card.cardNumber}</div>
              <div className="opacity-90 truncate">{card.workEmail}</div>
              <div className="opacity-90">Clearance: {spec.code}</div>
            </div>
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={3} accentColor={blue} size={68} lightLabel />
          </div>

          <div className="pt-1 border-t border-white/25 flex items-end justify-between">
            <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={mint} light />
            <span className="text-[7.5px] font-black uppercase">L3 · ASSOCIATE</span>
          </div>
        </div>
      </div>
    );
  }

  // L4 BACK — Geometric Corner Triangles + Terms at Top + Centered Logo + Bottom Barcode & QR (Image 4 Back)
  if (level === 4) {
    const dark = primaryColor || '#1e293b';
    const gold = secondaryColor || '#eab308';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#f8fafc] shadow-xl overflow-hidden flex flex-col justify-between p-4 border border-slate-200`}>
        <svg viewBox="0 0 120 120" className="absolute top-0 right-0 w-20 h-20 pointer-events-none">
          <polygon points="40,0 120,0 120,75" fill={dark} />
          <polygon points="20,0 60,0 40,24" fill={gold} />
        </svg>
        <svg viewBox="0 0 120 120" className="absolute bottom-0 left-0 w-20 h-20 pointer-events-none">
          <polygon points="0,50 0,120 75,120" fill={dark} />
          <polygon points="0,35 28,60 0,80" fill={gold} />
        </svg>

        <div className="relative z-10 pr-10 pt-1">
          <div className="text-[8px] font-black uppercase tracking-wider mb-1" style={{ color: dark }}>TERM &amp; CONDITIONS</div>
          <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
        </div>

        <div className="relative z-10 flex items-center justify-center gap-3 my-auto">
          <SystemQrBlock qrDataUrl={card.qrDataUrl} level={4} accentColor={dark} size={70} />
          <div className="text-[8px] space-y-1">
            <div className="flex items-center gap-1.5">
              <img src={card.logoUrl} alt={card.subsidiaryName} className="w-5 h-5 rounded bg-white border border-slate-200 p-0.5" />
              <span className="font-black text-slate-900 truncate max-w-[115px]">{card.subsidiaryName}</span>
            </div>
            <div><span className="text-slate-400 font-bold uppercase text-[6.5px] block">Issued / Expires</span><span className="font-bold text-slate-800">{previewIssuedDate} – {previewExpiresDate}</span></div>
          </div>
        </div>

        <div className="relative z-10 pl-7 pb-1 flex items-end justify-between gap-2">
          <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={dark} />
          <span className="text-[6.5px] font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">{card.cardNumber}</span>
        </div>
      </div>
    );
  }

  // L5 BACK — Slate & Bronze Split matching Image 6
  if (level === 5) {
    const bronze = primaryColor || '#927038';
    return (
      <div className={`${cardDim} relative rounded-[20px] shadow-xl overflow-hidden flex flex-col justify-between border border-slate-300 bg-[#18181b]`}>
        <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between text-white">
          <span className="text-[10px] font-black tracking-wider uppercase truncate">{card.subsidiaryName}</span>
          <span className="text-[8px] font-mono font-bold text-amber-300">L5 · DEV // ENG</span>
        </div>
        <div className="flex-1 px-4 py-3 flex flex-col justify-between bg-white" style={{ borderTopLeftRadius: '36px' }}>
          <div className="flex items-center gap-3">
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={5} accentColor={bronze} size={74} />
            <div className="flex-1 min-w-0 space-y-1 text-[8px]">
              <div className="font-black uppercase text-[7px]" style={{ color: bronze }}>Engineering Gate Scope</div>
              <div className="font-bold text-slate-800">{spec.systemScope}</div>
              <div className="text-slate-500">Issued: {previewIssuedDate}</div>
              <div className="text-slate-500">Expires: {previewExpiresDate}</div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="text-[7px] font-black uppercase mb-0.5" style={{ color: bronze }}>Terms &amp; Conditions</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          </div>
          <div className="pt-1 border-t border-slate-200 flex items-end justify-between gap-2">
            <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={bronze} />
            <span className="text-[7px] font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">{card.cardNumber}</span>
          </div>
        </div>
      </div>
    );
  }

  // L6 BACK — Angled Corner Ribbons + Centered Terms + QR + Barcode (Image 5 Back)
  if (level === 6) {
    const green = primaryColor || '#15803d';
    const lime = secondaryColor || '#65a30d';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between p-4 border border-slate-200`}>
        <svg viewBox="0 0 300 70" className="absolute top-0 left-0 w-full h-14 pointer-events-none" preserveAspectRatio="none">
          <polygon points="0,0 130,0 0,55" fill={green} />
          <polygon points="160,0 300,0 300,50" fill={lime} />
        </svg>
        <svg viewBox="0 0 300 45" className="absolute bottom-0 left-0 w-full h-9 pointer-events-none" preserveAspectRatio="none">
          <polygon points="215,45 300,5 300,45" fill={lime} />
          <rect x="0" y="34" width="300" height="11" fill={green} />
        </svg>

        <div className="relative z-10 flex flex-col items-center pt-1">
          <img src={card.logoUrl} alt={card.subsidiaryName} className="w-6 h-6 rounded bg-white border border-slate-200 p-0.5" />
          <span className="text-[10px] font-black text-slate-900 mt-0.5 truncate max-w-[180px]">{card.subsidiaryName}</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-2 my-auto">
          <div className="rounded-lg border-2 border-dotted p-2 bg-white/95" style={{ borderColor: green }}>
            <div className="text-[7.5px] font-black uppercase text-center mb-0.5" style={{ color: green }}>TERMS &amp; CONDITIONS</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={6} accentColor={green} size={64} />
            <div className="text-[7.5px] space-y-0.5">
              <div className="font-bold text-slate-800">Issued: {previewIssuedDate}</div>
              <div className="font-bold text-slate-800">Expires: {previewExpiresDate}</div>
              <div className="pt-1"><ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={green} /></div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pb-3 flex justify-center">
          <SecurityBarcode code={card.cardNumber} color={green} />
        </div>
      </div>
    );
  }

  // L7 BACK — Editorial Top Frame (Terms + Signature) + Rich Solid Bottom Half (QR + Dates)
  if (level === 7) {
    const brown = primaryColor || '#452715';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-300`}>
        <div className="p-3.5 flex-1 flex flex-col justify-between">
          <div className="w-full h-full rounded-t-xl border-t-2 border-x-2 p-3 flex flex-col justify-between" style={{ borderColor: brown }}>
            <div>
              <div className="text-[9px] font-serif font-bold uppercase text-center text-slate-900">{card.subsidiaryName} · L7 HOD</div>
              <div className="text-[7px] font-black uppercase mt-2 mb-1" style={{ color: brown }}>Terms &amp; Conditions</div>
              <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
            </div>
            <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={brown} />
          </div>
        </div>

        <div
          className="px-4 py-3 text-white flex items-center justify-between gap-3"
          style={{ background: `linear-gradient(135deg, ${brown} 0%, ${secondaryColor} 100%)` }}
        >
          <SystemQrBlock qrDataUrl={card.qrDataUrl} level={7} accentColor={brown} size={68} lightLabel />
          <div className="flex-1 min-w-0 text-[8px] space-y-1">
            <div><span className="opacity-70 uppercase text-[6.5px] block">Issued</span><span className="font-bold">{previewIssuedDate}</span></div>
            <div><span className="opacity-70 uppercase text-[6.5px] block">Expires</span><span className="font-bold">{previewExpiresDate}</span></div>
            <div className="font-mono text-[7.5px] opacity-90 truncate">{card.cardNumber}</div>
          </div>
        </div>
      </div>
    );
  }

  // L8 BACK — Bold Admin Header (Clearance Gates) + Cream Body (QR + Terms + Signature)
  if (level === 8) {
    const crimson = primaryColor || '#dc2626';
    return (
      <div className={`${cardDim} relative rounded-[20px] bg-[#fffbf5] shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200`}>
        <div className="px-4 py-3 text-white space-y-1.5" style={{ background: `linear-gradient(120deg, ${crimson}, ${secondaryColor})` }}>
          <div className="flex items-center justify-between text-[9.5px] font-black">
            <span className="truncate">{card.subsidiaryName}</span>
            <span>L8 · ADMIN AUDIT</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {clearanceItems.map((m) => (
              <span key={m} className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-white/20 text-white">{m}</span>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 flex-1 flex flex-col justify-center gap-2">
          <div className="flex items-center gap-3">
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={8} accentColor={crimson} size={72} />
            <div className="flex-1 text-[8px] space-y-1">
              <div><span className="text-slate-400 font-bold uppercase text-[6.5px] block">Issued</span><span className="font-black text-slate-900">{previewIssuedDate}</span></div>
              <div><span className="text-slate-400 font-bold uppercase text-[6.5px] block">Expires</span><span className="font-black text-slate-900">{previewExpiresDate}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="text-[7px] font-black uppercase mb-0.5" style={{ color: crimson }}>Terms &amp; Conditions</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          </div>
        </div>

        <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-end justify-between gap-2">
          <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={crimson} />
          <span className="text-[7px] font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">{card.cardNumber}</span>
        </div>
      </div>
    );
  }

  // L9 & L10 BACK — Sovereign Vertical Spine Ledger
  const isGmd = level === 10;
  const spineBg = isGmd
    ? 'linear-gradient(180deg, #fef3c7 0%, #f59e0b 48%, #b45309 100%)'
    : 'linear-gradient(180deg, #e2e8f0 0%, #64748b 50%, #0f172a 100%)';
  const accent = isGmd ? '#b45309' : '#0f172a';
  return (
    <div
      className={`${cardDim} relative rounded-[20px] shadow-xl overflow-hidden flex border-2`}
      style={{
        borderColor: isGmd ? '#d97706' : '#475569',
        background: isGmd
          ? 'linear-gradient(155deg, #fffbeb 0%, #ffffff 50%, #fef3c7 100%)'
          : 'linear-gradient(155deg, #f8fafc 0%, #ffffff 52%, #e2e8f0 100%)',
      }}
    >
      <div className="w-8 shrink-0 flex items-center justify-center" style={{ background: spineBg }}>
        <span className={`text-[8px] font-black tracking-[0.2em] uppercase [writing-mode:vertical-rl] rotate-180 ${isGmd ? 'text-amber-950' : 'text-white'}`}>
          {isGmd ? 'SOVEREIGN VERIFICATION' : 'EXECUTIVE VERIFICATION'}
        </span>
      </div>
      <div className="flex-1 p-3.5 flex flex-col justify-between relative min-w-0">
        <SecurityGuilloche color={accent} opacity={0.09} />
        <div className="relative z-10 flex items-center justify-between border-b border-slate-200 pb-1.5 gap-2">
          <span className="text-[10px] font-black text-slate-900 truncate">{card.subsidiaryName}</span>
          <span className="text-[8px] font-black px-2 py-0.5 rounded bg-white border border-slate-300 shrink-0" style={{ color: accent }}>
            L{level} {isGmd ? 'MASTER' : 'EXEC'}
          </span>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center gap-2.5">
          <div className="flex items-center gap-2.5">
            <SystemQrBlock qrDataUrl={card.qrDataUrl} level={level} accentColor={accent} size={isPortrait ? 74 : 64} />
            <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[8px] space-y-1">
              <div><span className="text-[6px] font-black uppercase text-slate-400 block">Issued</span><span className="font-black text-slate-800">{previewIssuedDate}</span></div>
              <div><span className="text-[6px] font-black uppercase text-slate-400 block">Expires</span><span className="font-black text-slate-800">{previewExpiresDate}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/95 p-2">
            <div className="text-[7px] font-black uppercase mb-0.5" style={{ color: accent }}>Terms &amp; Conditions</div>
            <TermsList subsidiaryName={card.subsidiaryName} facilityScope={spec.facilityScope} />
          </div>
        </div>
        <div className="relative z-10 pt-1.5 border-t border-slate-200 flex items-end justify-between gap-2">
          <ManagementSignatureBlock signatureUrl={managementSignatureUrl} accentColor={accent} />
          <div className="text-right shrink-0">
            <div className="text-[6px] font-black uppercase text-slate-400">Serial</div>
            <div className="text-[6.8px] font-mono font-bold text-slate-700 whitespace-nowrap">{card.cardNumber}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
