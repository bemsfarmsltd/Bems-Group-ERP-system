'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EmployeeDossierView } from '@/components/control-center/EmployeeDossierView';
import {
  Check,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
  Mail,
  Clock,
  Send,
  Trash2,
  Building2,
  Copy,
  CheckCheck,
  Play,
  Pause,
  Search,
  Users,
  ShieldAlert,
  Plus,
  SlidersHorizontal,
  UserCheck,
  Pencil,
} from 'lucide-react';
import { CustomAdminBuilderModal, type CustomAdminProfilePayload } from '@/components/control-center/CustomAdminBuilderModal';
import { createMonnifyComplianceReadOnlyPermissions } from '@/lib/admin-permissions';

type LeaderAccount = {
  id: string;
  legalName: string;
  employeeNumber: string;
  workEmail: string;
  phone: string | null;
  role: string;
  status: string;
  subsidiaryName: string;
  departmentName: string;
  positionName: string;
  isCurrentUser: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
};

type PendingSignup = {
  id: string;
  employeeNumber: string;
  legalName: string;
  workEmail: string;
  phone: string | null;
  role: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  residentialAddress?: string | null;
  cityState?: string | null;
  jobTitle?: string | null;
  employmentType?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinRelationship?: string | null;
  assignments?: { subsidiaryId: string; departmentId?: string | null; positionName: string }[];
  createdAt: string;
};

type AdminInvitationItem = {
  id: string;
  workEmail: string;
  role: string;
  subsidiaryId: string;
  subsidiary?: { id: string; legalName: string };
  departmentId?: string | null;
  positionName?: string | null;
  token: string;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
};

type Org = { id: string; legalName: string; code: string; type: string };
type Dept = { id: string; name: string; code: string; organizationId: string };

const EXECUTIVE_INVITE_ROLES = [
  { value: 'SYSTEM_ADMIN', label: 'Super Admin' },
  { value: 'GMD', label: 'The Group Managing Director' },
];

const STAFF_APPROVAL_ROLES = [
  { value: 'STAFF', label: 'Staff' },
  { value: 'GMD', label: 'The Group Managing Director' },
  { value: 'SYSTEM_ADMIN', label: 'Super Admin' },
];

const getRoleDisplayName = (r: string) => {
  if (r === 'SYSTEM_ADMIN' || r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'CUSTOM_ADMIN') return 'Custom Admin';
  if (r === 'GMD') return 'The Group Managing Director';
  if (r === 'HR' || r === 'HR_ADMIN') return 'Human Resources';
  if (r === 'STAFF') return 'Staff';
  return r;
};

export function PeopleAccessWorkspaceModule({
  setNotice,
  onNavigate,
  mode = 'hr',
}: {
  setNotice: (message: string) => void;
  onNavigate?: (tab: string) => void;
  mode?: 'control-center' | 'hr';
}) {
  const isControlCenter = mode === 'control-center';
  const [employees, setEmployees] = useState<PendingSignup[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitationItem[]>([]);
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [activeSystemAdmin, setActiveSystemAdmin] = useState<{ id: string; legalName: string } | null>(null);
  const [activeGmd, setActiveGmd] = useState<{ id: string; legalName: string; workEmail: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [resendingId, setResendingId] = useState('');
  const [leadershipAccounts, setLeadershipAccounts] = useState<LeaderAccount[]>([]);
  const [inspectingEmployeeId, setInspectingEmployeeId] = useState<string | null>(null);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'approvals' | 'directory' | 'invitations' | 'profiles'>(
    isControlCenter ? 'directory' : 'approvals'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Custom Admin Profiles & 2-Way Onboarding State
  const [customProfiles, setCustomProfiles] = useState<any[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<any[]>([]);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CustomAdminProfilePayload | null>(null);
  const [onboardMode, setOnboardMode] = useState<'invite' | 'promote'>('invite');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteLookupLoading, setPromoteLookupLoading] = useState(false);
  const [promoteCandidate, setPromoteCandidate] = useState<any | null>(null);
  const [promoteError, setPromoteError] = useState('');
  const [promoteBusy, setPromoteBusy] = useState(false);

  // Row approval configuration state
  const [approvalRoles, setApprovalRoles] = useState<Record<string, string>>({});
  const [approvalOrgs, setApprovalOrgs] = useState<Record<string, string>>({});
  const [approvalDepts, setApprovalDepts] = useState<Record<string, string>>({});

  // Executive Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    workEmail: '',
    role: 'GMD',
    subsidiaryId: '',
    departmentId: '',
    positionName: 'The Group Managing Director',
  });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [approvalRes, inviteRes, orgsRes, leaderRes, profilesRes, staffRes] = await Promise.all([
        fetch('/api/auth/approvals', { credentials: 'include' }).catch(() => null),
        fetch('/api/staff/invite', { credentials: 'include' }).catch(() => null),
        fetch('/api/organizations', { credentials: 'include' }).catch(() => null),
        fetch('/api/admin/leadership', { credentials: 'include' }).catch(() => null),
        fetch('/api/control-center/admin-profiles', { credentials: 'include' }).catch(() => null),
        fetch('/api/control-center/admin-onboarding?list=staff', { credentials: 'include' }).catch(() => null),
      ]);

      let orgList: Org[] = [];
      let deptList: Dept[] = [];

      if (approvalRes && approvalRes.ok) {
        const approvalData = await approvalRes.json();
        setEmployees(approvalData.employees || []);
        if (Array.isArray(approvalData.organizations) && approvalData.organizations.length > 0) {
          orgList = approvalData.organizations;
        }
        if (Array.isArray(approvalData.departments) && approvalData.departments.length > 0) {
          deptList = approvalData.departments;
        }
        setActiveGmd(approvalData.activeGmd ?? null);
        setActiveSystemAdmin(approvalData.activeSystemAdmin ?? null);
      }

      // Resilient fallback: If approval didn't supply organizations, read from /api/organizations
      if (orgList.length === 0 && orgsRes && orgsRes.ok) {
        const orgData = await orgsRes.json();
        const rawOrgs = orgData?.organizations || [];
        orgList = rawOrgs.map((o: any) => ({
          id: o.id,
          legalName: o.name || o.legalName || 'BEMS Subsidiary',
          code: o.code || '',
          type: o.type || 'SUBSIDIARY',
        }));
      }

      setOrganizations(orgList);
      setDepartments(deptList);

      if (inviteRes && inviteRes.ok) {
        const inviteData = await inviteRes.json();
        setInvitations(inviteData.invitations || []);
      }

      if (leaderRes && leaderRes.ok) {
        const leaderData = await leaderRes.json();
        setLeadershipAccounts(leaderData.leaders || []);
      }

      if (profilesRes && profilesRes.ok) {
        const profilesData = await profilesRes.json();
        setCustomProfiles(profilesData.profiles || []);
      }

      if (staffRes && staffRes.ok) {
        const staffData = await staffRes.json();
        setStaffDirectory(staffData.staff || []);
      }

      if (orgList.length > 0) {
        setInviteForm((prev) => ({
          ...prev,
          subsidiaryId: prev.subsidiaryId || orgList[0].id,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load administration records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (employeeId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(employeeId);
    setError('');
    try {
      const role = approvalRoles[employeeId] || 'STAFF';
      const subsidiaryId = approvalOrgs[employeeId] || (organizations[0]?.id || null);
      const departmentId = approvalDepts[employeeId] || null;

      const response = await fetch('/api/auth/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ employeeId, decision, role, subsidiaryId, departmentId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update this signup.');
      setNotice(data.message || (decision === 'APPROVE' ? 'Account approved.' : 'Signup declined.'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this signup.');
    } finally {
      setBusyId('');
    }
  };

  function openAdminOnboarding() {
    setInviteError('');
    setPromoteError('');
    setOnboardMode(activeSystemAdmin ? 'promote' : 'invite');
    setInviteForm(previous => ({
      ...previous, role: activeSystemAdmin ? 'GMD' : 'SYSTEM_ADMIN',
      subsidiaryId: previous.subsidiaryId || (organizations[0]?.id ?? ''),
    }));
    setShowInviteModal(true);
  }

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if ((inviteForm.role === 'GMD' && activeGmd) || (inviteForm.role === 'SYSTEM_ADMIN' && activeSystemAdmin)) {
      setInviteError('That seat is occupied. Use Promote Existing Staff to grant Custom Admin access.');
      return;
    }
    setInviteBusy(true);
    setInviteError('');
    try {
      const response = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(inviteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to dispatch executive invitation.');

      setNotice(data.message || `Official invitation dispatched to ${inviteForm.workEmail}.`);
      setShowInviteModal(false);
      setSelectedProfileId('');
      setInviteForm({
        workEmail: '',
        role: 'SYSTEM_ADMIN',
        subsidiaryId: organizations[0]?.id || '',
        departmentId: '',
        positionName: 'Administrator',
      });
      setActiveTab('invitations');
      await load();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleLookupStaffByEmail = async () => {
    const email = promoteEmail.trim().toLowerCase();
    if (!email) {
      setPromoteError('Enter the existing staff member work email.');
      return;
    }
    setPromoteLookupLoading(true);
    setPromoteError('');
    setPromoteCandidate(null);
    try {
      const res = await fetch(
        `/api/control-center/admin-onboarding?email=${encodeURIComponent(email)}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Staff account not found.');
      setPromoteCandidate(json.employee);
      if (json.employee?.customAdminProfileId) {
        setSelectedProfileId(json.employee.customAdminProfileId);
      }
    } catch (err: any) {
      setPromoteError(err?.message || 'Could not locate staff account.');
    } finally {
      setPromoteLookupLoading(false);
    }
  };

  const handlePromoteStaffSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!promoteCandidate?.workEmail) {
      setPromoteError('Look up an existing staff account first.');
      return;
    }
    if (!selectedProfileId) {
      setPromoteError('Choose a Custom Admin profile.');
      return;
    }
    setPromoteBusy(true);
    setPromoteError('');
    try {
      const res = await fetch('/api/control-center/admin-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'PROMOTE_STAFF',
          workEmail: promoteCandidate.workEmail,
          customAdminProfileId: selectedProfileId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send admin onboarding invitation.');
      setNotice(
        json.message ||
          `Admin onboarding email dispatched to ${promoteCandidate.legalName} (${promoteCandidate.workEmail}).`
      );
      setShowInviteModal(false);
      setPromoteEmail('');
      setPromoteCandidate(null);
      setSelectedProfileId('');
      setActiveTab('invitations');
      await load();
    } catch (err: any) {
      setPromoteError(err?.message || 'Could not promote staff member.');
    } finally {
      setPromoteBusy(false);
    }
  };

  const handleDeleteCustomProfile = async (id: string, profileName: string) => {
    if (!window.confirm(`Delete custom admin profile "${profileName}"?`)) return;
    try {
      const res = await fetch(`/api/control-center/admin-profiles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete profile.');
      setNotice(`Custom admin profile "${profileName}" deleted.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not delete profile.');
    }
  };

  const copyInviteLink = async (token: string, id: string) => {
    if (!token || token === 'undefined') {
      setNotice('Unable to copy link: Token is missing. Click "Resend Email" to generate a fresh link.');
      return;
    }
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://bemserp.work'}/onboard?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setNotice('Onboarding link copied to clipboard!');
      setTimeout(() => setCopiedId(''), 3000);
    } catch {
      setNotice(`Invite Link: ${url}`);
    }
  };

  const revokeInvitation = async (id: string) => {
    if (!window.confirm('Revoke this invitation? The link will no longer be valid.')) return;
    try {
      const res = await fetch(`/api/staff/invite?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invitation.');
      setNotice('Invitation revoked.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not revoke invitation.');
    }
  };

  const resendInvitation = async (id: string) => {
    setResendingId(id);
    try {
      const res = await fetch('/api/staff/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend email.');
      setNotice(data.message || 'Invitation email dispatched successfully.');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not resend email.');
    } finally {
      setResendingId('');
    }
  };

  const handleToggleLeadershipStatus = async (leaderId: string, currentStatus: string, name: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const msg = nextStatus === 'SUSPENDED'
      ? `Are you sure you want to SUSPEND ${name}? Their active sessions will be terminated immediately.`
      : `Reactivate administrative account for ${name}?`;
    if (!window.confirm(msg)) return;
    setBusyId(leaderId);
    try {
      const res = await fetch(`/api/admin/employees/${encodeURIComponent(leaderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update account status.');
      setNotice(data.message);
      await load();
    } catch (err: any) {
      setError(err.message || 'Status update failed.');
    } finally {
      setBusyId('');
    }
  };

  const handleDeleteLeadershipAccount = async (leaderId: string, name: string, role: string) => {
    if (!window.confirm(`⚠️ PERMANENT ACCOUNT DELETION:\nAre you sure you want to permanently delete the ${role} account for "${name}"?\n\nThis cannot be undone.`)) {
      return;
    }
    setBusyId(leaderId);
    try {
      const res = await fetch(`/api/admin/employees/${encodeURIComponent(leaderId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account.');
      setNotice(data.message);
      await load();
    } catch (err: any) {
      setError(err.message || 'Deletion failed.');
    } finally {
      setBusyId('');
    }
  };

  const filteredDepts = inviteForm.subsidiaryId
    ? departments.filter((d) => d.organizationId === inviteForm.subsidiaryId)
    : departments;

  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => inv.status === 'PENDING'),
    [invitations]
  );

  // Search filtering - strictly guarantee only STAFF appear under staff approvals
  const filteredEmployees = useMemo(() => {
    const onlyStaff = employees.filter((e) => (e.role || 'STAFF') === 'STAFF');
    if (!searchQuery.trim()) return onlyStaff;
    const q = searchQuery.toLowerCase();
    return onlyStaff.filter(
      (e) =>
        e.legalName.toLowerCase().includes(q) ||
        e.workEmail.toLowerCase().includes(q) ||
        e.employeeNumber.toLowerCase().includes(q) ||
        (e.jobTitle && e.jobTitle.toLowerCase().includes(q))
    );
  }, [employees, searchQuery]);



  const filteredLeaders = useMemo(() => {
    if (!searchQuery.trim()) return leadershipAccounts;
    const q = searchQuery.toLowerCase();
    return leadershipAccounts.filter(
      (l) =>
        l.legalName.toLowerCase().includes(q) ||
        l.workEmail.toLowerCase().includes(q) ||
        l.role.toLowerCase().includes(q) ||
        l.subsidiaryName.toLowerCase().includes(q)
    );
  }, [leadershipAccounts, searchQuery]);

  const filteredInvites = useMemo(() => {
    if (!searchQuery.trim()) return pendingInvitations;
    const q = searchQuery.toLowerCase();
    return pendingInvitations.filter(
      (i) =>
        i.workEmail.toLowerCase().includes(q) ||
        i.role.toLowerCase().includes(q) ||
        (i.subsidiary?.legalName && i.subsidiary.legalName.toLowerCase().includes(q))
    );
  }, [pendingInvitations, searchQuery]);

  return (
    <div data-ai-domain="hr" style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0, paddingBottom: 24 }}>
      {/* 1. Executive Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--brand-primary, #0d8a70)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            <ShieldCheck size={14} /> SYSTEM ADMINISTRATION &amp; ACCESS
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '2px 0 6px 0', letterSpacing: '-0.02em' }}>
            {isControlCenter ? 'Admin Onboarding & Custom Access' : 'People, Leadership & Access Center'}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            {isControlCenter
              ? 'Onboard new administrators via secure email links, promote existing staff by email, and manage 4-level custom admin profiles.'
              : 'Invite executive leadership roles via secure 7-day email links, and verify self-registered staff members.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={openAdminOnboarding}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--brand-gradient, linear-gradient(135deg, var(--brand-primary, #0d8a70) 0%, var(--brand-primary, #0d8a70) 100%))',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 3px 12px var(--brand-shadow-color, rgba(13, 138, 112, 0.28))',
              transition: 'all 0.15s ease',
            }}
          >
            <Mail size={15} color="#ffffff" />
            <span>Invite Executive / Admin Role</span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 13 }}>
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Top Executive KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* Card 1: Executive Leaders (Crisp BEMS Light Theme) */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
            border: '1.5px solid #fed7aa',
            borderRadius: 14,
            padding: '18px 20px',
            color: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#c2410c', textTransform: 'uppercase' }}>
              Governance Leadership
            </span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ffedd5', display: 'grid', placeItems: 'center', color: '#ea580c' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ margin: '14px 0 6px 0' }}>
            <strong style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: '#0f172a' }}>
              {leadershipAccounts.length}
            </strong>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Super admin &amp; GMD verified accounts</span>
          </div>
        </div>

        {/* Card 2: Staff Approvals Queue (HR Module only, hidden in Control Center) */}
        {!isControlCenter && (
        <div
          onClick={() => setActiveTab('approvals')}
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '18px 20px',
            border: activeTab === 'approvals' ? '1.5px solid var(--brand-primary, #0d8a70)' : '1px solid #e2e8f0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Staff Approvals Queue
            </span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: employees.length > 0 ? 'var(--brand-tint, rgba(13, 138, 112, 0.12))' : '#f0fdf4', display: 'grid', placeItems: 'center', color: employees.length > 0 ? 'var(--brand-primary, #0d8a70)' : '#16a34a' }}>
              <UserRound size={15} />
            </div>
          </div>
          <div style={{ margin: '14px 0 6px 0' }}>
            <strong style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1 }}>
              {employees.length}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {employees.length > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: 4 }}>
                Requires Review
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>
                Queue Clear
              </span>
            )}
            <span style={{ fontSize: 11, color: '#64748b' }}>self-registrations</span>
          </div>
        </div>
        )}

        {/* Card 3: Executive Invitations */}
        <div
          onClick={() => setActiveTab('invitations')}
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '18px 20px',
            border: activeTab === 'invitations' ? '1.5px solid var(--brand-primary, #0d8a70)' : '1px solid #e2e8f0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Dispatched Invitations
            </span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f8fafc', display: 'grid', placeItems: 'center', color: '#64748b' }}>
              <Mail size={15} />
            </div>
          </div>
          <div style={{ margin: '14px 0 6px 0' }}>
            <strong style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1 }}>
              {pendingInvitations.length}
            </strong>
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Active 7-day executive links
          </div>
        </div>

        {/* Card 4: Operating Entities */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: '18px 20px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Subsidiaries Configured
            </span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', display: 'grid', placeItems: 'center', color: '#2563eb' }}>
              <Building2 size={15} />
            </div>
          </div>
          <div style={{ margin: '14px 0 6px 0' }}>
            <strong style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1 }}>
              {organizations.length}
            </strong>
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Divisions ready for assignment
          </div>
        </div>
      </div>

      {/* 3. Segmented Navigation Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!isControlCenter && (
          <button
            type="button"
            onClick={() => setActiveTab('approvals')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'approvals' ? '#0f172a' : '#f1f5f9',
              color: activeTab === 'approvals' ? '#ffffff' : '#475569',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <UserRound size={14} />
            <span>Staff Approval Queue</span>
            <span
              style={{
                background: activeTab === 'approvals' ? 'var(--brand-primary, #0d8a70)' : '#cbd5e1',
                color: activeTab === 'approvals' ? '#ffffff' : '#0f172a',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {employees.length}
            </span>
          </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'directory' ? '#0f172a' : '#f1f5f9',
              color: activeTab === 'directory' ? '#ffffff' : '#475569',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Users size={14} />
            <span>Executive Leadership Directory</span>
            <span
              style={{
                background: activeTab === 'directory' ? 'var(--brand-primary, #0d8a70)' : '#cbd5e1',
                color: activeTab === 'directory' ? '#ffffff' : '#0f172a',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {leadershipAccounts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invitations')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'invitations' ? '#0f172a' : '#f1f5f9',
              color: activeTab === 'invitations' ? '#ffffff' : '#475569',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Mail size={14} />
            <span>Dispatched Invitations</span>
            <span
              style={{
                background: activeTab === 'invitations' ? 'var(--brand-primary, #0d8a70)' : '#cbd5e1',
                color: activeTab === 'invitations' ? '#ffffff' : '#0f172a',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {pendingInvitations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'profiles' ? '#0f172a' : '#f1f5f9',
              color: activeTab === 'profiles' ? '#ffffff' : '#475569',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Custom Admin Profiles</span>
            <span
              style={{
                background: activeTab === 'profiles' ? '#ea580c' : '#cbd5e1',
                color: activeTab === 'profiles' ? '#ffffff' : '#0f172a',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {customProfiles.length}
            </span>
          </button>
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by name, email, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 30px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: 12,
              background: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* 4. Tab 1 Content: Staff Approvals Queue */}
      {activeTab === 'approvals' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredEmployees.length > 0 ? (
            filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '20px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: 'var(--brand-tint, rgba(13, 138, 112, 0.12))',
                        border: '1px solid var(--brand-border, rgba(13, 138, 112, 0.35))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--brand-primary, #0d8a70)',
                        fontWeight: 800,
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {employee.legalName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          {employee.legalName}
                        </h3>
                        <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#334155' }}>
                          {employee.employeeNumber}
                        </span>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          {employee.employmentType || 'FULL_TIME'}
                        </span>
                      </div>
                      <div style={{ color: '#475569', fontSize: 12.5, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span><strong>{employee.jobTitle || 'Staff Member'}</strong></span>
                        <span>·</span>
                        <span>{employee.workEmail}</span>
                        {employee.phone && (
                          <>
                            <span>·</span>
                            <span>{employee.phone}</span>
                          </>
                        )}
                        {employee.cityState && (
                          <>
                            <span>·</span>
                            <span>📍 {employee.cityState}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, color: '#94a3b8', background: '#f8fafc', padding: '4px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                    Registered {new Date(employee.createdAt).toLocaleDateString('en-GB')}
                  </div>
                </div>

                {/* Banking Verification Details (if available) */}
                {employee.bankName && employee.accountNumber && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 12,
                      color: '#334155',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>
                      Disbursement Details:
                    </span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{employee.bankName}</span>
                    <span>Account: <strong style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{employee.accountNumber}</strong></span>
                    <span style={{ color: '#64748b' }}>({employee.accountName || employee.legalName})</span>
                  </div>
                )}

                {/* Placement & Approval Actions Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Assign Entity:</span>
                      <select
                        style={{
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: 12.5,
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 600,
                        }}
                        value={approvalOrgs[employee.id] || (organizations[0]?.id || '')}
                        onChange={(e) => setApprovalOrgs((prev) => ({ ...prev, [employee.id]: e.target.value }))}
                      >
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.legalName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Confirm Role:</span>
                      <select
                        style={{
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: 12.5,
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 600,
                        }}
                        value={approvalRoles[employee.id] || 'STAFF'}
                        onChange={(e) => setApprovalRoles((prev) => ({ ...prev, [employee.id]: e.target.value }))}
                      >
                        {STAFF_APPROVAL_ROLES.map((r) => {
                          const occupied = r.value === 'GMD' ? activeGmd : r.value === 'SYSTEM_ADMIN' ? activeSystemAdmin : null;

                          return (
                            <option key={r.value} value={r.value} disabled={Boolean(occupied)}>
                              {occupied ? `${r.label} (Occupied by ${occupied.legalName})` : r.label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      disabled={busyId === employee.id}
                      onClick={() => void decide(employee.id, 'REJECT')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 6,
                        border: '1px solid #fecaca',
                        background: '#ffffff',
                        color: '#dc2626',
                        fontSize: 12.5,
                        fontWeight: 650,
                        cursor: busyId === employee.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <X size={14} /> Decline
                    </button>

                    <button
                      type="button"
                      disabled={busyId === employee.id}
                      onClick={() => void decide(employee.id, 'APPROVE')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 18px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: busyId === employee.id ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                      }}
                    >
                      <Check size={14} /> Approve &amp; Provision Account
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 14px auto',
                }}
              >
                <Check size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                All Staff Registrations Verified
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, maxWidth: 480, marginInline: 'auto', lineHeight: 1.5 }}>
                There are currently no pending self-service accounts in the review queue. When employees register via the BEMS Staff Portal or mobile app, their profiles appear here for division placement and access clearance.
              </p>
            </div>
          )}
        </section>
      )}

      {/* 5. Tab 2 Content: Executive Leadership Directory */}
      {inspectingEmployeeId ? (
        <EmployeeDossierView employeeId={inspectingEmployeeId} onBack={() => setInspectingEmployeeId(null)} />
      ) : activeTab === 'directory' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredLeaders.length > 0 ? (
            filteredLeaders.map((leader) => (
              <div
                key={leader.id}
                style={{
                  background: '#ffffff',
                  border: leader.status === 'ACTIVE' ? '1px solid #e2e8f0' : '1px solid #fecaca',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 14,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: leader.role === 'GMD' ? 'var(--brand-tint, rgba(13, 138, 112, 0.12))' : '#f8fafc',
                      border: leader.role === 'GMD' ? '1px solid var(--brand-border, rgba(13, 138, 112, 0.35))' : '1px solid #cbd5e1',
                      color: leader.role === 'GMD' ? 'var(--brand-primary, #0d8a70)' : '#334155',
                      fontWeight: 800,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {leader.role.slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15, color: '#0f172a' }}>{leader.legalName}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: leader.role === 'GMD' ? 'var(--brand-primary, #0d8a70)' : '#334155',
                          color: '#ffffff',
                        }}
                      >
                        {getRoleDisplayName(leader.role)}
                      </span>
                      {leader.isCurrentUser && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>
                          Current Session
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
                      {leader.workEmail} · 🏢 {leader.subsidiaryName} ({leader.positionName || 'Executive'})
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                      Created: {new Date(leader.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      Last Login: {leader.lastLoginAt ? new Date(leader.lastLoginAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setInspectingEmployeeId(leader.id)}
                    style={{
                      padding: '6px 11px',
                      borderRadius: 6,
                      border: '1px solid #fed7aa',
                      background: '#fff7ed',
                      color: '#c2410c',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Inspect Dossier →
                  </button>
                  <span
                    style={{
                      background: leader.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                      color: leader.status === 'ACTIVE' ? '#15803d' : '#dc2626',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontWeight: 750,
                      fontSize: 11.5,
                    }}
                  >
                    {leader.status === 'ACTIVE' ? 'Active & Verified' : 'Suspended'}
                  </span>

                  {leader.isCurrentUser ? (
                    <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic', padding: '0 4px' }}>
                      Protected Session
                    </span>
                  ) : (
                    <>
                      {leader.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          disabled={busyId === leader.id}
                          onClick={() => handleToggleLeadershipStatus(leader.id, 'ACTIVE', leader.legalName)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#ffffff',
                            border: '1px solid var(--brand-border, rgba(13, 138, 112, 0.35))',
                            color: 'var(--brand-primary, #0d8a70)',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: 11.5,
                            cursor: 'pointer',
                          }}
                        >
                          <Pause size={12} /> Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === leader.id}
                          onClick={() => handleToggleLeadershipStatus(leader.id, 'SUSPENDED', leader.legalName)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#ffffff',
                            border: '1px solid #86efac',
                            color: '#16a34a',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: 11.5,
                            cursor: 'pointer',
                          }}
                        >
                          <Play size={12} /> Reactivate
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyId === leader.id}
                        onClick={() => handleDeleteLeadershipAccount(leader.id, leader.legalName, leader.role)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: '#ffffff',
                          border: '1px solid #fecaca',
                          color: '#dc2626',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontWeight: 700,
                          fontSize: 11.5,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No executive accounts match your search.</p>
            </div>
          )}
        </section>
      )}

      {/* 6. Tab 3 Content: Dispatched Invitations */}
      {activeTab === 'invitations' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredInvites.length > 0 ? (
            filteredInvites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 14,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--brand-tint, rgba(13, 138, 112, 0.12))',
                      border: '1px solid var(--brand-border, rgba(13, 138, 112, 0.35))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--brand-primary, #0d8a70)',
                      fontWeight: 800,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    @
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14.5 }}>
                      {inv.workEmail}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                      <span style={{ background: 'var(--brand-primary, #0d8a70)', color: '#ffffff', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                        {getRoleDisplayName(inv.role)}
                      </span>
                      <span>·</span>
                      <span>🏢 {inv.subsidiary?.legalName || 'Subsidiary'}</span>
                      {inv.positionName && <span>({inv.positionName})</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11.5, color: '#854d0e', background: '#fefce8', border: '1px solid #fef08a', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={12} />
                    <span>Expires {new Date(inv.expiresAt).toLocaleDateString('en-GB')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void copyInviteLink(inv.token, inv.id)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {copiedId === inv.id ? <CheckCheck size={13} color="#16a34a" /> : <Copy size={13} />}
                    <span>{copiedId === inv.id ? 'Copied Link!' : 'Copy Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void resendInvitation(inv.id)}
                    disabled={resendingId === inv.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fed7aa',
                      color: '#c2410c',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: resendingId === inv.id ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Send size={12} className={resendingId === inv.id ? 'animate-spin' : ''} />
                    <span>{resendingId === inv.id ? 'Sending...' : 'Resend Email'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void revokeInvitation(inv.id)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Revoke</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: '44px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px auto',
                }}
              >
                <Mail size={22} />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Outstanding Executive Invitations
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
                All dispatched invitations have been accepted or no new links are pending.
              </p>
              <button
                type="button"
                onClick={openAdminOnboarding}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--brand-primary, #0d8a70)',
                  color: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Mail size={14} />
                <span>Invite Executive Role</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 6b. Custom Admin Profiles Tab */}
      {activeTab === 'profiles' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Named Custom Admin Profiles ({customProfiles.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                Create flexible, custom-named admin roles scoped by Module → Subsidiary → Left-Bar Category → In-Page Actions.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setEditingProfile({
                    name: 'Monnify Compliance (Read-Only)',
                    description: 'Strict view-only access for Monnify compliance & finance verification. Write operations are globally blocked.',
                    permissions: createMonnifyComplianceReadOnlyPermissions(),
                  });
                  setShowBuilderModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#c2410c',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ShieldCheck size={14} />
                <span>Monnify Read-Only Preset</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingProfile(null);
                  setShowBuilderModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#ea580c',
                  color: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                <span>New Custom Admin Profile</span>
              </button>
            </div>
          </div>

          {customProfiles.length === 0 ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
              <SlidersHorizontal size={24} style={{ color: '#94a3b8', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>No Custom Admin Profiles Yet</div>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '6px 0 16px' }}>
                Create a named profile (e.g. Finance Controller, Abia Projects Lead) and assign it via Fresh Invite or Staff Promotion.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {customProfiles.map((prof) => {
                const perms = prof.permissions || {};
                const enabledMods = Object.keys(perms).filter((k) => perms[k]?.enabled);
                return (
                  <div
                    key={prof.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 14,
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <strong style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>{prof.name}</strong>
                        <span style={{ fontSize: 10.5, fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 999, padding: '2px 8px' }}>
                          {enabledMods.length} modules
                        </span>
                      </div>
                      {prof.description && (
                        <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 0' }}>{prof.description}</p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                        {enabledMods.map((mk) => (
                          <span key={mk} style={{ fontSize: 10.5, fontWeight: 700, background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 6 }}>
                            {mk}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 10, fontSize: 11.5, color: '#64748b' }}>
                      <span>{prof._count?.employees || 0} admins · {prof._count?.invitations || 0} invites</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfile({
                              id: prof.id,
                              name: prof.name,
                              description: prof.description || '',
                              permissions: prof.permissions || {},
                            });
                            setShowBuilderModal(true);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: 11.5, fontWeight: 650, cursor: 'pointer' }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCustomProfile(prof.id, prof.name)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11.5, fontWeight: 650, cursor: 'pointer' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 7. 2-Way Executive / Admin Onboarding Modal */}
      {showInviteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 560,
              padding: '26px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
              boxSizing: 'border-box',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div>
                <div style={{ color: '#ea580c', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  FLEXIBLE ADMIN ONBOARDING
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                  Onboard or Promote Administrator
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 2-Way Mode Switcher */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setOnboardMode('invite');
                  setInviteError('');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 750,
                  cursor: 'pointer',
                  background: onboardMode === 'invite' ? '#ffffff' : 'transparent',
                  color: onboardMode === 'invite' ? '#0f172a' : '#64748b',
                  boxShadow: onboardMode === 'invite' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                1. Fresh Admin Invite
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnboardMode('promote');
                  setPromoteError('');
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 750,
                  cursor: 'pointer',
                  background: onboardMode === 'promote' ? '#ffffff' : 'transparent',
                  color: onboardMode === 'promote' ? '#0f172a' : '#64748b',
                  boxShadow: onboardMode === 'promote' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                2. Promote Existing Staff
              </button>
            </div>

            {onboardMode === 'promote' ? (
              <form onSubmit={handlePromoteStaffSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '11px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 12.5, lineHeight: 1.5 }}>
                  Select an existing staff member, configure their admin profile, and send an onboarding email to their <strong>same work email</strong>. They confirm the invitation using their current staff password and keep the same account.
                </div>

                {promoteError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 12.5 }}>
                    {promoteError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Select Existing Staff Member *
                  </label>
                  <select
                    value={promoteCandidate?.id || ''}
                    onChange={(e) => {
                      const picked = staffDirectory.find((s) => s.id === e.target.value) || null;
                      setPromoteCandidate(picked);
                      setPromoteEmail(picked?.workEmail || '');
                      setPromoteError('');
                    }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', fontWeight: 600, boxSizing: 'border-box' }}
                  >
                    <option value="">-- Choose a staff member ({staffDirectory.length} active) --</option>
                    {staffDirectory.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.legalName} ({s.workEmail}) {s.assignments?.[0]?.subsidiary?.code ? `· ${s.assignments[0].subsidiary.code}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Or Lookup by Work Email
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="email"
                      placeholder="staff@bemsgroup.com"
                      value={promoteEmail}
                      onChange={(e) => setPromoteEmail(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleLookupStaffByEmail()}
                      disabled={promoteLookupLoading}
                      style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #0f172a', background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {promoteLookupLoading ? 'Searching...' : 'Find'}
                    </button>
                  </div>
                </div>

                {promoteCandidate && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 12.5 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{promoteCandidate.legalName}</div>
                    <div style={{ color: '#475569', marginTop: 2 }}>
                      {promoteCandidate.employeeNumber} · Current Role: <strong>{promoteCandidate.role}</strong>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                      Custom Admin Profile
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfile(null);
                        setShowBuilderModal(true);
                      }}
                      style={{ border: 'none', background: 'transparent', color: '#ea580c', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                    >
                      + Create Custom Profile
                    </button>
                  </div>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', fontWeight: 600 }}
                  >
                    <option value="">Full Super Admin (Unrestricted)</option>
                    {customProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 650 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={promoteBusy || !promoteCandidate}
                    style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: promoteBusy || !promoteCandidate ? 'not-allowed' : 'pointer', opacity: promoteBusy || !promoteCandidate ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Send size={14} />
                    <span>{promoteBusy ? 'Sending Email...' : 'Send Admin Onboarding Email →'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ padding: '11px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', marginBottom: 16, fontSize: 12.5, lineHeight: 1.5 }}>
                  Executive invitations are strictly reserved for <strong>Super admin</strong> (with optional Custom Admin Profile) and <strong>The Group Managing Director</strong>.
                </div>

                {inviteError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', marginBottom: 16, fontSize: 13 }}>
                    {inviteError}
                  </div>
                )}

                <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Corporate Work Email Address *
                </label>
                <input
                  required
                  type="email"
                  placeholder="e.g. director@bemsgroup.com"
                  value={inviteForm.workEmail}
                  onChange={(e) => setInviteForm({ ...inviteForm, workEmail: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Executive Role *
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', boxSizing: 'border-box', fontWeight: 600 }}
                  >
                    {EXECUTIVE_INVITE_ROLES.map((r) => {
                      const occupied = r.value === 'GMD' ? activeGmd : r.value === 'SYSTEM_ADMIN' ? activeSystemAdmin : null;

                      return (
                        <option key={r.value} value={r.value} disabled={Boolean(occupied)}>
                          {occupied ? `${r.label} (Occupied by ${occupied.legalName})` : r.label}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Operating Subsidiary *
                  </label>
                  <select
                    required
                    value={inviteForm.subsidiaryId}
                    onChange={(e) => setInviteForm({ ...inviteForm, subsidiaryId: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', boxSizing: 'border-box', fontWeight: 600 }}
                  >
                    {organizations.length === 0 ? (
                      <option value="" disabled>Loading subsidiaries...</option>
                    ) : (
                      organizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.legalName}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {filteredDepts.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Department (Optional)
                  </label>
                  <select
                    value={inviteForm.departmentId}
                    onChange={(e) => setInviteForm({ ...inviteForm, departmentId: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="">Select Department (Optional)</option>
                    {filteredDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}



              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Official Position / Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. The Group Managing Director"
                  value={inviteForm.positionName}
                  onChange={(e) => setInviteForm({ ...inviteForm, positionName: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 650 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteBusy}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--brand-gradient, linear-gradient(135deg, var(--brand-primary, #0d8a70) 0%, var(--brand-primary, #0d8a70) 100%))',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: inviteBusy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    boxShadow: '0 2px 8px var(--brand-shadow-color, rgba(13, 138, 112, 0.25))',
                  }}
                >
                  <Send size={14} />
                  <span>{inviteBusy ? 'Sending Invitation...' : 'Send Invitation Email →'}</span>
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      )}

      {showBuilderModal && (
        <CustomAdminBuilderModal
          subsidiaries={organizations}
          initialProfile={editingProfile}
          onCancel={() => {
            setShowBuilderModal(false);
            setEditingProfile(null);
          }}
          onSaved={(savedProfile) => {
            setShowBuilderModal(false);
            setEditingProfile(null);
            if (savedProfile?.id) setSelectedProfileId(savedProfile.id);
            setNotice(`Custom Admin Profile "${savedProfile?.name || 'Profile'}" saved.`);
            void load();
          }}
        />
      )}
    </div>
  );
}
