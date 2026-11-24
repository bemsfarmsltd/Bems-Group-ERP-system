export interface HrLeavePolicyItem {
  type: string;
  label: string;
  defaultDays: number;
  paid: boolean;
  notice: string;
  desc: string;
}

export const LEAVE_POLICIES_SETTING_KEY = 'HR_LEAVE_POLICIES';

export const DEFAULT_LEAVE_POLICIES: HrLeavePolicyItem[] = [
  {
    type: 'ANNUAL',
    label: 'Annual Paid Leave',
    defaultDays: 20,
    paid: true,
    notice: '14 days prior notice',
    desc: 'Standard annual rest & vacation entitlement for confirmed staff.',
  },
  {
    type: 'SICK',
    label: 'Medical / Sick Leave',
    defaultDays: 10,
    paid: true,
    notice: 'Same day + medical note if >2 days',
    desc: 'Paid medical recovery leave backed by clinical documentation.',
  },
  {
    type: 'CASUAL',
    label: 'Casual / Personal Leave',
    defaultDays: 5,
    paid: true,
    notice: '48 hours prior notice',
    desc: 'Short-term personal or family errands deducted from casual pool.',
  },
  {
    type: 'MATERNITY',
    label: 'Maternity Leave',
    defaultDays: 90,
    paid: true,
    notice: '30 days prior notice',
    desc: 'Statutory paid maternity entitlement (12+ weeks).',
  },
  {
    type: 'PATERNITY',
    label: 'Paternity Leave',
    defaultDays: 14,
    paid: true,
    notice: '14 days prior notice',
    desc: 'Paid paternity support leave upon birth or adoption.',
  },
  {
    type: 'COMPASSIONATE',
    label: 'Compassionate / Bereavement',
    defaultDays: 5,
    paid: true,
    notice: 'Immediate',
    desc: 'Emergency family bereavement or critical household event.',
  },
  {
    type: 'STUDY',
    label: 'Study & Exam Leave',
    defaultDays: 7,
    paid: true,
    notice: '14 days prior notice',
    desc: 'Approved professional certification or academic examination leave.',
  },
];

export function sanitizeLeavePolicies(raw: unknown): HrLeavePolicyItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LEAVE_POLICIES;
  const seen = new Set<string>();
  const cleaned: HrLeavePolicyItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const type = String(rec.type || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const label = String(rec.label || '').trim().slice(0, 80);
    if (!type || !label || seen.has(type)) continue;
    seen.add(type);
    const days = Math.max(0, Math.min(365, Math.round(Number(rec.defaultDays ?? 0) || 0)));
    cleaned.push({
      type,
      label,
      defaultDays: days,
      paid: Boolean(rec.paid ?? true),
      notice: String(rec.notice || 'Standard notice').trim().slice(0, 80),
      desc: String(rec.desc || '').trim().slice(0, 240),
    });
  }
  return cleaned.length > 0 ? cleaned : DEFAULT_LEAVE_POLICIES;
}
