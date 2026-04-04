import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'break' | 'off';
  shift_start?: string;
  is_active?: boolean;
  created_at?: string;
}

const DEMO_STAFF: StaffMember[] = [
  { id: '1', name: 'Raj Kumar', email: 'raj@demo.com', role: 'waiter', status: 'active', shift_start: '09:00' },
  { id: '2', name: 'Priya Sharma', email: 'priya@demo.com', role: 'cashier', status: 'active', shift_start: '10:00' },
  { id: '3', name: 'Amit Verma', email: 'amit@demo.com', role: 'waiter', status: 'break', shift_start: '09:00' },
  { id: '4', name: 'Chef Raman', email: 'raman@demo.com', role: 'head_chef', status: 'active', shift_start: '08:00' },
  { id: '5', name: 'Sunita Devi', email: 'sunita@demo.com', role: 'inventory_manager', status: 'off' }
];

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  break: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  off: 'bg-gray-50 text-gray-500 border-gray-200'
};

export default function Staff() {
  const auth = useAppSelector((s) => s.auth);
  const [staff, setStaff] = useState<StaffMember[]>(DEMO_STAFF);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('waiter');

  const identityServiceUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        const res = await fetch(
          `${identityServiceUrl}/api/v1/auth/users`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { users: StaffMember[] } };
          const users = data.data?.users ?? [];
          if (users.length > 0) {
            setStaff(users.map((u) => ({ ...u, status: 'active' as const })));
          }
        }
      } catch {
        // Use demo data
      }
    };
    void load();
  }, [auth, identityServiceUrl]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch(`${tenantServiceUrl}/api/v1/tenants/${auth.user?.tenant_id}/staff/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
    } catch {
      // Handle gracefully
    }
    setShowInvite(false);
    setInviteEmail('');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Staff</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
        >
          + Invite Staff
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
              <th className="text-left px-5 py-3 font-medium">Staff Member</th>
              <th className="text-left px-5 py-3 font-medium">Role</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-left px-5 py-3 font-medium">Shift Start</th>
              <th className="text-left px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member, idx) => (
              <tr key={member.id} className={`${idx > 0 ? 'border-t border-gray-50' : ''} hover:bg-gray-50`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
                      {member.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{member.name}</div>
                      <div className="text-xs text-gray-400">{member.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 capitalize text-gray-600">{member.role.replace(/_/g, ' ')}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium capitalize ${STATUS_BADGES[member.status]}`}>
                    {member.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600 font-mono">{member.shift_start ?? '—'}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-brand-500 hover:text-brand-600 font-medium">Edit</button>
                    <button className="text-xs text-gray-400 hover:text-gray-600">Permissions</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Invite Staff</h3>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={(e) => { void handleInvite(e); }} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="staff@business.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
                >
                  <option value="waiter">Waiter</option>
                  <option value="cashier">Cashier</option>
                  <option value="head_chef">Head Chef</option>
                  <option value="inventory_manager">Inventory Manager</option>
                  <option value="branch_manager">Branch Manager</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl">Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
