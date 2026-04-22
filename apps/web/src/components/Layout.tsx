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
import { clearAuth } from '../store/authSlice';
import { useSocket } from '../hooks/useSocket';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const OWNER_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'platform_superadmin']);
const AUDIT_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'branch_manager', 'platform_superadmin']);

function canViewReports(user: { role: string; permissions: string[] } | null): boolean {
  if (!user) return false;
  if (OWNER_ROLES.has(user.role)) return true;
  return user.permissions.includes('reports:view');
}

function canViewAuditLog(user: { role: string } | null): boolean {
  if (!user) return false;
  return AUDIT_ROLES.has(user.role);
}

const BASE_NAV_ITEMS: NavItem[] = [
  { to: '/floor-map', icon: <Map size={20} />, label: 'Floor Map' },
  { to: '/orders', icon: <ClipboardList size={20} />, label: 'Orders' },
  { to: '/catalogue', icon: <BookOpen size={20} />, label: 'Catalogue' },
  { to: '/reservations', icon: <CalendarDays size={20} />, label: 'Reservations' },
  { to: '/customers', icon: <Heart size={20} />, label: 'Customers' },
  { to: '/staff', icon: <Users size={20} />, label: 'Staff' },
  { to: '/procurement', icon: <ShoppingCart size={20} />, label: 'Procurement' },
  { to: '/settings', icon: <Settings size={20} />, label: 'Settings' }
];

export default function Layout() {
  const [expanded, setExpanded] = useState(false);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  useSocket(); // Initialize socket connection

  // Fetch tenant name once on mount (or when tenant changes)
  useEffect(() => {
    if (!user?.tenant_id || !token) return;
    const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
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
  }, [user?.tenant_id, token]);

  const navItems: NavItem[] = [
    ...BASE_NAV_ITEMS.slice(0, 3), // floor-map, orders, catalogue
    ...(canViewReports(user) ? [{ to: '/reports', icon: <BarChart3 size={20} />, label: 'Reports' }] : []),
    ...BASE_NAV_ITEMS.slice(3), // reservations, staff, procurement, settings
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
            <Package size={20} className="text-gray-400" />
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

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
