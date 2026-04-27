import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Map,
  ClipboardList,
  BookOpen,
  BarChart3,
  Users,
  ShoppingCart,
  Settings,
  LogOut,
  ChevronRight,
  Package,
  CalendarDays,
  ScrollText,
  Heart
} from 'lucide-react';

import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { clearAuth, setOnboardingStatus } from '../store/authSlice';
import { useSocket } from '../hooks/useSocket';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const OWNER_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'platform_superadmin']);
const MANAGER_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'platform_superadmin', 'branch_manager', 'operations_partner']);
const AUDIT_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'branch_manager', 'platform_superadmin']);

function isOwner(user: { role: string } | null): boolean {
  return !!user && OWNER_ROLES.has(user.role);
}

function isManagerOrAbove(user: { role: string } | null): boolean {
  return !!user && MANAGER_ROLES.has(user.role);
}

function canViewReports(user: { role: string; permissions: string[] } | null): boolean {
  if (!user) return false;
  if (OWNER_ROLES.has(user.role)) return true;
  return user.permissions.includes('reports:view');
}

function canViewAuditLog(user: { role: string } | null): boolean {
  if (!user) return false;
  return AUDIT_ROLES.has(user.role);
}


interface SetupTasks {
  catalogue: boolean;
  tables: boolean;
  staff: boolean;
  qr: boolean;
}

export default function Layout() {
  const [expanded, setExpanded] = useState(false);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [setupTasks, setSetupTasks] = useState<SetupTasks | null>(null);
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const onboardingCompleted = useAppSelector((s) => s.auth.onboardingCompleted);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  useSocket(); // Initialize socket connection

  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  // Fetch tenant name + onboarding state once on mount
  useEffect(() => {
    if (!user?.tenant_id || !token) return;
    // Fetch tenant info
    fetch(`${tenantServiceUrl}/api/v1/tenants/${user.tenant_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; data?: { tenant?: { name?: string } } }) => {
        if (data.success && data.data?.tenant?.name) {
          setBusinessName(data.data.tenant.name);
        }
      })
      .catch(() => undefined);

    // Fetch onboarding state
    fetch(`${tenantServiceUrl}/api/v1/onboarding/${user.tenant_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: {
        success: boolean;
        data?: {
          onboarding_completed: boolean;
          onboarding_step: number;
          setup_tasks: SetupTasks;
        };
      }) => {
        if (data.success && data.data) {
          dispatch(setOnboardingStatus({
            completed: data.data.onboarding_completed,
            step: data.data.onboarding_step,
          }));
          setSetupTasks(data.data.setup_tasks);
        }
      })
      .catch(() => undefined);
  }, [user?.tenant_id, token, tenantServiceUrl, dispatch]);

  const navItems: NavItem[] = [
    // All roles: core ops
    { to: '/floor-map', icon: <Map size={20} />, label: 'Floor Map' },
    { to: '/orders', icon: <ClipboardList size={20} />, label: 'Orders' },
    { to: '/catalogue', icon: <BookOpen size={20} />, label: 'Catalogue' },
    // Manager+ only
    ...(canViewReports(user) ? [{ to: '/reports', icon: <BarChart3 size={20} />, label: 'Reports' }] : []),
    ...(isManagerOrAbove(user) ? [{ to: '/reservations', icon: <CalendarDays size={20} />, label: 'Reservations' }] : []),
    ...(isManagerOrAbove(user) ? [{ to: '/customers', icon: <Heart size={20} />, label: 'Customers' }] : []),
    ...(isManagerOrAbove(user) ? [{ to: '/staff', icon: <Users size={20} />, label: 'Staff' }] : []),
    // Owner only
    ...(isOwner(user) ? [{ to: '/inventory', icon: <Package size={20} />, label: 'Inventory' }] : []),
    ...(isOwner(user) ? [{ to: '/procurement', icon: <ShoppingCart size={20} />, label: 'Procurement' }] : []),
    ...(isOwner(user) ? [{ to: '/settings', icon: <Settings size={20} />, label: 'Settings' }] : []),
    ...(canViewAuditLog(user) ? [{ to: '/activity', icon: <ScrollText size={20} />, label: 'Activity Log' }] : []),
  ];

  const handleLogout = () => {
    dispatch(clearAuth());
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${expanded ? 'w-60' : 'w-16'} transition-all duration-200 bg-white border-r border-gray-200 flex flex-col shrink-0 z-20`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className="h-16 flex items-center border-b border-gray-100 px-4 overflow-hidden">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">U</div>
          {expanded && <span className="ml-3 font-bold text-gray-900 text-sm whitespace-nowrap">ULCP Staff</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 overflow-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 mx-2 rounded-xl mb-1 transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-600 border-l-4 border-brand-500 pl-3'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {expanded && <span className="ml-3 text-sm font-medium whitespace-nowrap">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="border-t border-gray-100 p-4 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
            {expanded && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{user?.name ?? 'Staff'}</div>
                <div className="text-xs text-gray-400 capitalize truncate">{user?.role ?? 'staff'}</div>
              </div>
            )}
            {expanded && (
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors shrink-0" title="Logout">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{businessName ?? user?.name ?? 'Staff Portal'}</span>
            <ChevronRight size={16} className="text-gray-400" />
            <span className="text-sm text-gray-500">Main Branch</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              title="Logout"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
          </div>
        </header>

        {/* Onboarding / setup banner — owner only */}
        {isOwner(user) && onboardingCompleted && setupTasks && !allSetupDone(setupTasks) && (
          <SetupBanner tasks={setupTasks} onGoToSetup={() => navigate('/setup')} />
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function allSetupDone(tasks: SetupTasks): boolean {
  return tasks.catalogue && tasks.tables && tasks.staff && tasks.qr;
}

function countSetupDone(tasks: SetupTasks): number {
  return [tasks.catalogue, tasks.tables, tasks.staff, tasks.qr].filter(Boolean).length;
}

// ─── Setup progress banner ───────────────────────────────────────────────────

function SetupBanner({ tasks, onGoToSetup }: { tasks: SetupTasks; onGoToSetup: () => void }) {
  const done = countSetupDone(tasks);
  const total = 4;
  const pct = Math.round((done / total) * 100);

  const pendingItems: string[] = [];
  if (!tasks.catalogue) pendingItems.push('Add catalogue');
  if (!tasks.tables) pendingItems.push('Set up tables');
  if (!tasks.staff) pendingItems.push('Invite staff');
  if (!tasks.qr) pendingItems.push('Get QR code');

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-bold shrink-0">
          {done}/{total}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-amber-800">
            Setup {pct}% complete
          </span>
          <span className="text-xs text-amber-600 ml-2 hidden sm:inline">
            — {pendingItems.join(', ')}
          </span>
        </div>
        {/* Mini progress bar */}
        <div className="w-24 h-1.5 bg-amber-200 rounded-full overflow-hidden hidden md:block">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        onClick={onGoToSetup}
        className="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        Complete setup →
      </button>
    </div>
  );
}
