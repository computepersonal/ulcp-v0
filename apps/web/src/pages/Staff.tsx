import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';
import { ONBOARDING, goToOnboarding } from '../lib/onboardingLinks';
import SetupReturnBanner from '../components/SetupReturnBanner';

function OnboardReturnBanner() {
  if (!localStorage.getItem('onboarding_staff_return')) return null;
  return (
    <div className="bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-between text-sm">
      <span className="font-medium">You came here from onboarding</span>
      <button
        onClick={() => {
          localStorage.removeItem('onboarding_staff_return');
          goToOnboarding();
        }}
        className="flex items-center gap-1.5 bg-white text-indigo-600 font-semibold px-3 py-1 rounded-lg text-xs hover:bg-indigo-50 transition-colors"
      >
        ← Back to onboarding
      </button>
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active?: boolean;
  created_at?: string;
}

interface StaffProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  branch_id: string | null;
  phone: string | null;
  alt_phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  joining_date: string | null;
  department: string | null;
  designation: string | null;
  employment_type: string;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  pan_number: string | null;
  aadhaar_last4: string | null;
  id_proof_url: string | null;
  address_proof_url: string | null;
  notes: string | null;
}

interface StaffInvite {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  branch_id: string | null;
  invited_by: string;
  invite_token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  invite_url?: string;
}

type TabId = 'team' | 'invites' | 'shifts' | 'attendance' | 'leaves' | 'wages';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'waiter', label: 'Waiter' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'head_chef', label: 'Head Chef' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'line_cook', label: 'Line Cook' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'delivery_staff', label: 'Delivery Staff' },
  { value: 'reports_analyst', label: 'Reports Analyst' },
];

const ROLE_COLORS: Record<string, string> = {
  tenant_owner: 'bg-purple-50 text-purple-700 border-purple-200',
  primary_owner: 'bg-purple-50 text-purple-700 border-purple-200',
  branch_manager: 'bg-blue-50 text-blue-700 border-blue-200',
  head_chef: 'bg-orange-50 text-orange-700 border-orange-200',
  sous_chef: 'bg-orange-50 text-orange-700 border-orange-200',
  cashier: 'bg-green-50 text-green-700 border-green-200',
  waiter: 'bg-brand-50 text-brand-700 border-brand-200',
  default: 'bg-gray-50 text-gray-600 border-gray-200',
};

function getRoleColor(role: string): string {
  return ROLE_COLORS[role] ?? ROLE_COLORS.default;
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ');
}

function getInviteStatus(invite: StaffInvite): { label: string; class: string } {
  if (invite.accepted_at) return { label: 'Accepted', class: 'bg-green-50 text-green-700 border-green-200' };
  if (new Date(invite.expires_at) < new Date()) return { label: 'Expired', class: 'bg-red-50 text-red-600 border-red-200' };
  return { label: 'Pending', class: 'bg-amber-50 text-amber-700 border-amber-200' };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Staff() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<TabId>('team');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('waiter');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<{ url: string; email: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Copy link feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // HR data
  const [shiftTemplates, setShiftTemplates] = useState<{ id: string; name: string; start_time: string; end_time: string; break_mins: number; color: string; is_active: boolean }[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<{ id: string; user_id: string; date: string; clock_in: string | null; clock_out: string | null; hours_worked: number | null; status: string; late_by_mins: number }[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string; code: string; annual_quota: number; is_paid: boolean }[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<{ id: string; user_id: string; leave_type: { name: string; code: string }; start_date: string; end_date: string; days: number; reason: string | null; status: string; created_at: string }[]>([]);
  const [wageData, setWageData] = useState<{ id: string; user_id: string; wage_type: string; amount: number; effective_from: string; effective_to: string | null; notes: string | null }[]>([]);

  // Shift/Leave modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [newShift, setNewShift] = useState({ name: '', start_time: '09:00', end_time: '17:00', break_mins: 30, color: '#6366F1' });
  const [showAddWage, setShowAddWage] = useState(false);
  const [wageUser, setWageUser] = useState('');
  const [newWage, setNewWage] = useState({ wage_type: 'monthly' as string, amount: '' });

  // Edit profile slide-over
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<Partial<StaffProfile>>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [, setProfileError] = useState<string | null>(null);

  const identityServiceUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const tenantId = auth.user?.tenant_id;

  // ─── Fetch staff members ────────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await apiFetch(`${identityServiceUrl}/api/v1/auth/users`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { users: StaffMember[] } };
        setStaff(data.data?.users ?? []);
      }
    } catch { /* empty */ } finally {
      setLoadingStaff(false);
    }
  }, [tenantId, auth.token, identityServiceUrl]);

  // ─── Fetch invites ──────────────────────────────────────────────────────
  const loadInvites = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await apiFetch(`${tenantServiceUrl}/api/v1/tenants/${tenantId}/staff`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { invites: StaffInvite[] } };
        setInvites(data.data?.invites ?? []);
      }
    } catch { /* empty */ } finally {
      setLoadingInvites(false);
    }
  }, [tenantId, auth.token, tenantServiceUrl]);

  // ─── Fetch HR data ───────────────────────────────────────────────────
  const hrUrl = `${tenantServiceUrl}/api/v1/tenants/${tenantId}/hr`;
  const authHeaders = { Authorization: `Bearer ${auth.token}` };

  const loadShifts = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await apiFetch(`${hrUrl}/shifts`, { headers: authHeaders });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { shifts: typeof shiftTemplates } };
        setShiftTemplates(data.data?.shifts ?? []);
      }
    } catch { /* empty */ }
  }, [tenantId, hrUrl, auth.token]);

  const loadAttendance = useCallback(async () => {
    if (!tenantId) return;
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const to = today.toISOString();
    try {
      const res = await apiFetch(`${hrUrl}/attendance?date_from=${from}&date_to=${to}`, { headers: authHeaders });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { records: typeof attendanceRecords } };
        setAttendanceRecords(data.data?.records ?? []);
      }
    } catch { /* empty */ }
  }, [tenantId, hrUrl, auth.token]);

  const loadLeaves = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [typesRes, reqsRes] = await Promise.all([
        fetch(`${hrUrl}/leave-types`, { headers: authHeaders }),
        fetch(`${hrUrl}/leave-requests`, { headers: authHeaders }),
      ]);
      if (typesRes.ok) {
        const d = (await typesRes.json()) as { success: boolean; data?: { leave_types: typeof leaveTypes } };
        setLeaveTypes(d.data?.leave_types ?? []);
      }
      if (reqsRes.ok) {
        const d = (await reqsRes.json()) as { success: boolean; data?: { requests: typeof leaveRequests } };
        setLeaveRequests(d.data?.requests ?? []);
      }
    } catch { /* empty */ }
  }, [tenantId, hrUrl, auth.token]);

  useEffect(() => { void loadStaff(); }, [loadStaff]);
  useEffect(() => { void loadInvites(); }, [loadInvites]);

  // Load HR data when switching to those tabs
  useEffect(() => {
    if (tab === 'shifts') void loadShifts();
    if (tab === 'attendance') void loadAttendance();
    if (tab === 'leaves') void loadLeaves();
    if (tab === 'wages' && staff.length > 0 && !wageUser) setWageUser(staff[0].id);
  }, [tab, loadShifts, loadAttendance, loadLeaves, staff, wageUser]);

  // ─── Send invite ────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSubmitting(true);

    try {
      const res = await apiFetch(`${tenantServiceUrl}/api/v1/tenants/${tenantId}/staff/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = (await res.json()) as { success: boolean; data?: { invite: StaffInvite }; error?: string };

      if (data.success && data.data?.invite) {
        const invite = data.data.invite;
        const webUrl = import.meta.env.VITE_WEB_APP_URL ?? 'http://localhost:5173';
        const url = invite.invite_url ?? `${webUrl}${ONBOARDING.invite(invite.invite_token)}`;
        setInviteSuccess({ url, email: inviteEmail });
        void loadInvites(); // refresh list
      } else {
        setInviteError(data.error ?? 'Failed to send invite');
      }
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  // ─── Revoke invite ──────────────────────────────────────────────────────
  const handleRevoke = async (inviteId: string) => {
    try {
      await apiFetch(`${tenantServiceUrl}/api/v1/tenants/${tenantId}/staff/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch { /* empty */ }
  };

  // ─── Copy invite link ──────────────────────────────────────────────────
  const handleCopyLink = async (invite: StaffInvite) => {
    const webUrl = import.meta.env.VITE_WEB_APP_URL ?? 'http://localhost:5173';
    const url = `${webUrl}${ONBOARDING.invite(invite.invite_token)}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Open profile editor ─────────────────────────────────────────────
  const openProfileEditor = async (member: StaffMember) => {
    setEditingUser(member);
    setProfileData({});
    setProfileSaved(false);
    setProfileLoading(true);
    try {
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/staff-profiles/${member.id}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { profile: StaffProfile } };
        if (data.data?.profile) {
          setProfileData(data.data.profile);
        }
      }
      // 404 = no profile yet, that's fine — form will be empty
    } catch { /* empty */ } finally {
      setProfileLoading(false);
    }
  };

  // ─── Save profile ──────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editingUser) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      // Strip empty strings and undefined values before sending
      const cleanData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(profileData)) {
        if (value !== undefined && value !== '' && value !== null) {
          cleanData[key] = value;
        }
      }
      const res = await apiFetch(
        `${tenantServiceUrl}/api/v1/tenants/${tenantId}/staff-profiles/${editingUser.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(cleanData),
        }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (res.ok && data.success) {
        setProfileSaved(true);
        setTimeout(() => {
          setProfileSaved(false);
          setEditingUser(null);
        }, 800);
      } else {
        setProfileError(data.error ?? 'Failed to save profile');
      }
    } catch {
      setProfileError('Something went wrong. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const updateProfileField = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value || undefined }));
  };

  // ─── Close modal and reset ─────────────────────────────────────────────
  const closeInviteModal = () => {
    setShowInvite(false);
    setInviteEmail('');
    setInviteRole('waiter');
    setInviteError(null);
    setInviteSuccess(null);
  };

  const pendingInviteCount = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date()).length;
  const loading = loadingStaff || loadingInvites;

  if (loading) {
    return (
      <div>
        <OnboardReturnBanner />
        <SetupReturnBanner />
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-gray-400 text-sm">Loading staff...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <OnboardReturnBanner />
      <SetupReturnBanner />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Staff</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {staff.length} member{staff.length !== 1 ? 's' : ''}
              {pendingInviteCount > 0 && ` \u00B7 ${pendingInviteCount} pending invite${pendingInviteCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + Invite Staff
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {([
            { id: 'team' as TabId, label: `Team (${staff.length})` },
            { id: 'invites' as TabId, label: `Invites`, badge: pendingInviteCount || undefined },
            { id: 'shifts' as TabId, label: 'Shifts' },
            { id: 'attendance' as TabId, label: 'Attendance' },
            { id: 'leaves' as TabId, label: 'Leaves' },
            { id: 'wages' as TabId, label: 'Wages' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap relative ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Team tab */}
        {tab === 'team' && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium">Staff Member</th>
                  <th className="text-left px-5 py-3 font-medium">Role</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Joined</th>
                  <th className="text-left px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="text-3xl mb-2">&#128101;</div>
                      <div className="text-sm font-medium text-gray-700 mb-1">No staff yet</div>
                      <div className="text-xs text-gray-400">Invite your first team member using the button above.</div>
                    </td>
                  </tr>
                )}
                {staff.map((member, idx) => (
                  <tr key={member.id} className={`${idx > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
                          {member.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{member.name}</div>
                          <div className="text-xs text-gray-400">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${getRoleColor(member.role)}`}>
                        {formatRole(member.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                        member.is_active !== false
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {member.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {member.created_at ? timeAgo(member.created_at) : '\u2014'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { void openProfileEditor(member); }}
                          className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                        >
                          Edit
                        </button>
                        <button className="text-xs text-gray-400 hover:text-gray-600">Permissions</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Invites tab */}
        {tab === 'invites' && (
          <div className="space-y-3">
            {invites.length === 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#9993;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">No invites sent yet</div>
                <div className="text-xs text-gray-400">Click "+ Invite Staff" to send your first invite.</div>
              </div>
            )}
            {invites.map((invite) => {
              const status = getInviteStatus(invite);
              const isPending = !invite.accepted_at && new Date(invite.expires_at) > new Date();
              return (
                <div key={invite.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold shrink-0 mt-0.5">
                        {invite.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{invite.email}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${getRoleColor(invite.role)}`}>
                            {formatRole(invite.role)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.class}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1.5">
                          Sent {timeAgo(invite.created_at)}
                          {isPending && ` \u00B7 Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isPending && (
                        <>
                          <button
                            onClick={() => { void handleCopyLink(invite); }}
                            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                          >
                            {copiedId === invite.id ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button
                            onClick={() => { void handleRevoke(invite.id); }}
                            className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 font-medium transition-colors"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Shifts Tab ──────────────────────────────────────────────── */}
        {tab === 'shifts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Shift Templates</h2>
              <button
                onClick={() => {
                  setEditingShiftId(null);
                  setNewShift({ name: '', start_time: '09:00', end_time: '17:00', break_mins: 30, color: '#6366F1' });
                  setShowShiftModal(true);
                }}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                + Add Shift
              </button>
            </div>
            {shiftTemplates.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#128337;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">No shifts defined</div>
                <div className="text-xs text-gray-400">Create shift templates like "Morning Shift" or "Night Shift" to schedule your team.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shiftTemplates.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm group relative cursor-pointer hover:border-brand-200 transition-colors"
                    onClick={() => {
                      setEditingShiftId(s.id);
                      setNewShift({ name: s.name, start_time: s.start_time, end_time: s.end_time, break_mins: s.break_mins, color: s.color });
                      setShowShiftModal(true);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold text-sm text-gray-900">{s.name}</span>
                      {!s.is_active && <span className="text-xs text-gray-400">(inactive)</span>}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete shift "${s.name}"?`)) return;
                          await apiFetch(`${hrUrl}/shifts/${s.id}`, {
                            method: 'DELETE', headers: authHeaders,
                          });
                          void loadShifts();
                        }}
                        className="ml-auto text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete shift"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.start_time} &ndash; {s.end_time}
                      {s.break_mins > 0 && <span className="ml-2 text-gray-400">({s.break_mins}m break)</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add/Edit Shift Modal */}
            {showShiftModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
                  <h3 className="font-bold text-gray-900 mb-4">{editingShiftId ? 'Edit Shift Template' : 'Add Shift Template'}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                      <input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} placeholder="e.g. Morning Shift" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Start</label>
                        <input type="time" value={newShift.start_time} onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">End</label>
                        <input type="time" value={newShift.end_time} onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Break (mins)</label>
                        <input type="number" value={newShift.break_mins} onChange={(e) => setNewShift({ ...newShift, break_mins: parseInt(e.target.value) || 0 })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Color</label>
                        <input type="color" value={newShift.color} onChange={(e) => setNewShift({ ...newShift, color: e.target.value })} className="w-full h-9 border border-gray-200 rounded-lg cursor-pointer" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setShowShiftModal(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
                    <button
                      onClick={async () => {
                        if (!newShift.name) return;
                        if (editingShiftId) {
                          await apiFetch(`${hrUrl}/shifts/${editingShiftId}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
                            body: JSON.stringify(newShift),
                          });
                        } else {
                          await apiFetch(`${hrUrl}/shifts`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
                            body: JSON.stringify(newShift),
                          });
                        }
                        setShowShiftModal(false);
                        setEditingShiftId(null);
                        setNewShift({ name: '', start_time: '09:00', end_time: '17:00', break_mins: 30, color: '#6366F1' });
                        void loadShifts();
                      }}
                      className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
                    >
                      {editingShiftId ? 'Save Changes' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Attendance Tab ─────────────────────────────────────────── */}
        {tab === 'attendance' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">This Month's Attendance</h2>
            {attendanceRecords.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                <div className="text-3xl mb-2">&#128203;</div>
                <div className="text-sm font-medium text-gray-700 mb-1">No attendance records</div>
                <div className="text-xs text-gray-400">Staff clock-in/out records will appear here.</div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Staff</th>
                      <th className="text-left px-5 py-3 font-medium">Date</th>
                      <th className="text-left px-5 py-3 font-medium">Clock In</th>
                      <th className="text-left px-5 py-3 font-medium">Clock Out</th>
                      <th className="text-left px-5 py-3 font-medium">Hours</th>
                      <th className="text-left px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map((r) => {
                      const member = staff.find((s) => s.id === r.user_id);
                      return (
                        <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{member?.name ?? r.user_id.slice(0, 8)}</td>
                          <td className="px-5 py-3 text-gray-600">{new Date(r.date).toLocaleDateString()}</td>
                          <td className="px-5 py-3 text-gray-600 font-mono text-xs">{r.clock_in ? new Date(r.clock_in).toLocaleTimeString() : '\u2014'}</td>
                          <td className="px-5 py-3 text-gray-600 font-mono text-xs">{r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : '\u2014'}</td>
                          <td className="px-5 py-3 text-gray-600">{r.hours_worked?.toFixed(1) ?? '\u2014'}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${
                              r.status === 'present' ? 'bg-green-50 text-green-700 border-green-200' :
                              r.status === 'half_day' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              r.status === 'on_leave' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {r.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Leaves Tab ─────────────────────────────────────────────── */}
        {tab === 'leaves' && (
          <div className="space-y-6">
            {/* Leave Types */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Leave Types</h2>
              {leaveTypes.length === 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center text-xs text-gray-400">
                  No leave types configured. Add types like Casual Leave, Sick Leave, etc.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {leaveTypes.map((lt) => (
                    <div key={lt.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs shadow-sm">
                      <span className="font-semibold text-gray-900">{lt.name}</span>
                      <span className="text-gray-400 ml-1">({lt.code})</span>
                      <span className="text-gray-500 ml-2">{lt.annual_quota} days/yr</span>
                      {lt.is_paid && <span className="text-green-600 ml-1">&#x2713; Paid</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leave Requests */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Leave Requests</h2>
              </div>
              {leaveRequests.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
                  <div className="text-3xl mb-2">&#128197;</div>
                  <div className="text-sm font-medium text-gray-700 mb-1">No leave requests</div>
                  <div className="text-xs text-gray-400">Staff leave requests will appear here for review.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaveRequests.map((r) => {
                    const member = staff.find((s) => s.id === r.user_id);
                    return (
                      <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm text-gray-900">{member?.name ?? 'Staff'}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {r.leave_type.name} ({r.leave_type.code}) &middot; {r.days} day{r.days !== 1 ? 's' : ''}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(r.start_date).toLocaleDateString()} &ndash; {new Date(r.end_date).toLocaleDateString()}
                            </div>
                            {r.reason && <div className="text-xs text-gray-500 mt-1 italic">"{r.reason}"</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${
                              r.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                              r.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                              r.status === 'cancelled' ? 'bg-gray-50 text-gray-500 border-gray-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {r.status}
                            </span>
                            {r.status === 'pending' && (
                              <div className="flex gap-1">
                                <button
                                  onClick={async () => {
                                    await apiFetch(`${hrUrl}/leave-requests/${r.id}/review`, {
                                      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
                                      body: JSON.stringify({ status: 'approved' }),
                                    });
                                    void loadLeaves();
                                  }}
                                  className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={async () => {
                                    await apiFetch(`${hrUrl}/leave-requests/${r.id}/review`, {
                                      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
                                      body: JSON.stringify({ status: 'rejected' }),
                                    });
                                    void loadLeaves();
                                  }}
                                  className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Wages Tab ──────────────────────────────────────────────── */}
        {tab === 'wages' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-gray-700">Wages</h2>
                {staff.length > 0 && (
                  <select
                    value={wageUser}
                    onChange={(e) => { setWageUser(e.target.value); setWageData([]); }}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-500 bg-white"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({formatRole(s.role)})</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={() => setShowAddWage(true)}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                + Set Wage
              </button>
            </div>

            {/* Load wages for selected user */}
            <WageDisplay
              hrUrl={hrUrl}
              authHeaders={authHeaders}
              userId={wageUser}
              wageData={wageData}
              setWageData={setWageData}
            />

            {/* Add Wage Modal */}
            {showAddWage && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
                  <h3 className="font-bold text-gray-900 mb-4">Set Wage</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Staff Member</label>
                      <select value={wageUser} onChange={(e) => setWageUser(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white">
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                      <select value={newWage.wage_type} onChange={(e) => setNewWage({ ...newWage, wage_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white">
                        <option value="monthly">Monthly</option>
                        <option value="daily">Daily</option>
                        <option value="hourly">Hourly</option>
                        <option value="per_shift">Per Shift</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Amount (in paise)</label>
                      <input type="number" value={newWage.amount} onChange={(e) => setNewWage({ ...newWage, amount: e.target.value })} placeholder="e.g. 2500000 (= ₹25,000)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setShowAddWage(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
                    <button
                      onClick={async () => {
                        if (!wageUser || !newWage.amount) return;
                        await apiFetch(`${hrUrl}/wages`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({
                            user_id: wageUser,
                            wage_type: newWage.wage_type,
                            amount: parseInt(newWage.amount),
                            effective_from: new Date().toISOString(),
                          }),
                        });
                        setShowAddWage(false);
                        setNewWage({ wage_type: 'monthly', amount: '' });
                        setWageData([]); // force reload
                      }}
                      className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Invite Modal ─────────────────────────────────────────────── */}
        {showInvite && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-[420px] shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">
                  {inviteSuccess ? 'Invite Sent!' : 'Invite Staff'}
                </h3>
                <button onClick={closeInviteModal} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>

              {inviteSuccess ? (
                /* ─── Success state ─── */
                <div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                    <p className="text-sm text-green-700 font-medium mb-1">Invite sent to {inviteSuccess.email}</p>
                    <p className="text-xs text-green-600">
                      Share the link below with them. They have 48 hours to accept.
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 mb-4">
                    <label className="text-xs font-medium text-gray-500 block mb-1.5">Invite Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteSuccess.url}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600 bg-white"
                      />
                      <button
                        onClick={() => { void navigator.clipboard.writeText(inviteSuccess.url); }}
                        className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={closeInviteModal}
                      className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => { setInviteSuccess(null); setInviteEmail(''); }}
                      className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Invite Another
                    </button>
                  </div>
                </div>
              ) : (
                /* ─── Invite form ─── */
                <form onSubmit={(e) => { void handleInvite(e); }} className="space-y-4">
                  {inviteError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <p className="text-sm text-red-600">{inviteError}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      placeholder="staff@business.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white transition-colors"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">
                      An invite link will be generated. Share it with the staff member.
                      They'll set their own name and password when they accept.
                      The link expires in <span className="font-medium">48 hours</span>.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeInviteModal}
                      className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteSubmitting || !inviteEmail}
                      className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      {inviteSubmitting ? 'Sending...' : 'Send Invite'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ─── Profile Edit Slide-over ───────────────────────────────── */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="flex-1 bg-black/40" onClick={() => setEditingUser(null)} />
            {/* Panel */}
            <div className="w-[480px] bg-white shadow-xl flex flex-col h-full">
              {/* Header */}
              <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-gray-900">{editingUser.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{editingUser.email} &middot; <span className="capitalize">{formatRole(editingUser.role)}</span></p>
                </div>
                <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>

              {profileLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-gray-400 text-sm">Loading profile...</div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                  {/* Personal Information */}
                  <ProfileSection title="Personal Information">
                    <ProfileField label="Phone" value={profileData.phone ?? ''} onChange={(v) => updateProfileField('phone', v)} placeholder="+91 98765 43210" />
                    <ProfileField label="Alt Phone" value={profileData.alt_phone ?? ''} onChange={(v) => updateProfileField('alt_phone', v)} placeholder="Alternate number" />
                    <ProfileField label="Date of Birth" value={profileData.date_of_birth ? profileData.date_of_birth.slice(0, 10) : ''} onChange={(v) => updateProfileField('date_of_birth', v ? `${v}T00:00:00.000Z` : '')} type="date" />
                    <ProfileSelect label="Gender" value={profileData.gender ?? ''} onChange={(v) => updateProfileField('gender', v)} options={[
                      { value: '', label: 'Select...' },
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                      { value: 'other', label: 'Other' },
                      { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                    ]} />
                  </ProfileSection>

                  {/* Address */}
                  <ProfileSection title="Address">
                    <ProfileField label="Address Line 1" value={profileData.address_line1 ?? ''} onChange={(v) => updateProfileField('address_line1', v)} />
                    <ProfileField label="Address Line 2" value={profileData.address_line2 ?? ''} onChange={(v) => updateProfileField('address_line2', v)} />
                    <div className="grid grid-cols-3 gap-3">
                      <ProfileField label="City" value={profileData.city ?? ''} onChange={(v) => updateProfileField('city', v)} />
                      <ProfileField label="State" value={profileData.state ?? ''} onChange={(v) => updateProfileField('state', v)} />
                      <ProfileField label="Pincode" value={profileData.pincode ?? ''} onChange={(v) => updateProfileField('pincode', v)} />
                    </div>
                  </ProfileSection>

                  {/* Emergency Contact */}
                  <ProfileSection title="Emergency Contact">
                    <ProfileField label="Name" value={profileData.emergency_name ?? ''} onChange={(v) => updateProfileField('emergency_name', v)} />
                    <ProfileField label="Phone" value={profileData.emergency_phone ?? ''} onChange={(v) => updateProfileField('emergency_phone', v)} />
                    <ProfileField label="Relation" value={profileData.emergency_relation ?? ''} onChange={(v) => updateProfileField('emergency_relation', v)} placeholder="e.g. Spouse, Parent" />
                  </ProfileSection>

                  {/* Employment */}
                  <ProfileSection title="Employment">
                    <ProfileField label="Joining Date" value={profileData.joining_date ? profileData.joining_date.slice(0, 10) : ''} onChange={(v) => updateProfileField('joining_date', v ? `${v}T00:00:00.000Z` : '')} type="date" />
                    <ProfileSelect label="Department" value={profileData.department ?? ''} onChange={(v) => updateProfileField('department', v)} options={[
                      { value: '', label: 'Select...' },
                      { value: 'kitchen', label: 'Kitchen' },
                      { value: 'service', label: 'Service' },
                      { value: 'management', label: 'Management' },
                      { value: 'delivery', label: 'Delivery' },
                      { value: 'other', label: 'Other' },
                    ]} />
                    <ProfileField label="Designation" value={profileData.designation ?? ''} onChange={(v) => updateProfileField('designation', v)} placeholder="e.g. Senior Chef" />
                    <ProfileSelect label="Employment Type" value={profileData.employment_type ?? 'full_time'} onChange={(v) => updateProfileField('employment_type', v)} options={[
                      { value: 'full_time', label: 'Full Time' },
                      { value: 'part_time', label: 'Part Time' },
                      { value: 'contract', label: 'Contract' },
                      { value: 'intern', label: 'Intern' },
                    ]} />
                  </ProfileSection>

                  {/* Bank Details */}
                  <ProfileSection title="Bank Details">
                    <ProfileField label="Account Number" value={profileData.bank_account_no ?? ''} onChange={(v) => updateProfileField('bank_account_no', v)} />
                    <ProfileField label="IFSC Code" value={profileData.bank_ifsc ?? ''} onChange={(v) => updateProfileField('bank_ifsc', v)} />
                    <ProfileField label="Bank Name" value={profileData.bank_name ?? ''} onChange={(v) => updateProfileField('bank_name', v)} />
                    <ProfileField label="PAN Number" value={profileData.pan_number ?? ''} onChange={(v) => updateProfileField('pan_number', v)} />
                    <ProfileField label="Aadhaar (last 4)" value={profileData.aadhaar_last4 ?? ''} onChange={(v) => updateProfileField('aadhaar_last4', v)} maxLength={4} />
                  </ProfileSection>

                  {/* Notes */}
                  <ProfileSection title="Internal Notes">
                    <textarea
                      value={profileData.notes ?? ''}
                      onChange={(e) => updateProfileField('notes', e.target.value)}
                      rows={3}
                      placeholder="Any internal notes about this staff member..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors resize-none"
                    />
                  </ProfileSection>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-3">
                  {profileSaved && (
                    <span className="text-xs text-green-600 font-medium">Saved!</span>
                  )}
                  <button
                    onClick={() => { void handleSaveProfile(); }}
                    disabled={profileSaving}
                    className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Profile form helpers ────────────────────────────────────────────────────

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ProfileField({
  label, value, onChange, placeholder, type = 'text', maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 transition-colors"
      />
    </div>
  );
}

function ProfileSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Wage Display ────────────────────────────────────────────────────────────

function WageDisplay({
  hrUrl, authHeaders, userId, wageData, setWageData,
}: {
  hrUrl: string;
  authHeaders: Record<string, string>;
  userId: string;
  wageData: { id: string; user_id: string; wage_type: string; amount: number; effective_from: string; effective_to: string | null; notes: string | null }[];
  setWageData: (d: typeof wageData) => void;
}) {
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await apiFetch(`${hrUrl}/wages/${userId}`, { headers: authHeaders });
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { wages: typeof wageData; current_wage: typeof wageData[0] | null } };
          setWageData(data.data?.wages ?? []);
        }
      } catch { /* empty */ }
    })();
  }, [userId, hrUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) {
    return <div className="text-sm text-gray-400">Select a staff member to view wages.</div>;
  }

  if (wageData.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
        <div className="text-3xl mb-2">&#128176;</div>
        <div className="text-sm font-medium text-gray-700 mb-1">No wage records</div>
        <div className="text-xs text-gray-400">Click "+ Set Wage" to define compensation for this staff member.</div>
      </div>
    );
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount / 100);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
            <th className="text-left px-5 py-3 font-medium">Type</th>
            <th className="text-left px-5 py-3 font-medium">Amount</th>
            <th className="text-left px-5 py-3 font-medium">Effective From</th>
            <th className="text-left px-5 py-3 font-medium">Effective To</th>
            <th className="text-left px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {wageData.map((w) => (
            <tr key={w.id} className="border-t border-gray-50 hover:bg-gray-50">
              <td className="px-5 py-3 capitalize text-gray-700">{w.wage_type.replace(/_/g, ' ')}</td>
              <td className="px-5 py-3 font-semibold text-gray-900 font-mono">{formatAmount(w.amount)}</td>
              <td className="px-5 py-3 text-gray-600 text-xs">{new Date(w.effective_from).toLocaleDateString()}</td>
              <td className="px-5 py-3 text-gray-600 text-xs">{w.effective_to ? new Date(w.effective_to).toLocaleDateString() : '\u2014'}</td>
              <td className="px-5 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  !w.effective_to ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}>
                  {!w.effective_to ? 'Current' : 'Past'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
