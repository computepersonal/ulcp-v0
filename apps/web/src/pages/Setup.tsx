import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

// ─── Business type helpers ────────────────────────────────────────────────────

const DINE_IN_TYPES = [
  'self_service_cafe', 'seated_food_only', 'seated_full_service',
  'seated_self_order', 'restaurant_plus_delivery',
];

const DELIVERY_TYPES = [
  'home_kitchen', 'cloud_kitchen', 'restaurant_plus_delivery',
  'food_truck', 'catering', 'gated_community',
];

// ─── Types ───────────────────────────────────────────────────────────────────

type SetupTaskId = 'catalogue' | 'tables' | 'staff' | 'qr';

interface SetupTasks {
  catalogue: boolean;
  tables: boolean;
  staff: boolean;
  qr: boolean;
}

interface SetupTask {
  id: SetupTaskId;
  label: string;
  description: string;
  icon: string;
  to: string;
  critical: boolean;
  showFor: 'all' | string[];
}

const ALL_TASKS: SetupTask[] = [
  {
    id: 'catalogue',
    label: 'Add your menu / catalogue',
    description: 'Add items, set prices and photos — this is what customers see when they scan your QR.',
    icon: '📋',
    to: '/catalogue',
    critical: true,
    showFor: 'all',
  },
  {
    id: 'tables',
    label: 'Set up your floor map & tables',
    description: 'Add tables and sections so your staff can manage dine-in orders on the floor map.',
    icon: '🪑',
    to: '/floor-map',
    critical: false,
    showFor: DINE_IN_TYPES,
  },
  {
    id: 'staff',
    label: 'Invite your team',
    description: "Add waiters, chefs, cashiers and managers. They'll get an invite to download the staff app.",
    icon: '👥',
    to: '/staff',
    critical: false,
    showFor: 'all',
  },
  {
    id: 'qr',
    label: 'Get your QR code',
    description: 'Download and print your QR code. Place it on tables, counters, or your entrance.',
    icon: '📱',
    to: '/settings',
    critical: false,
    showFor: 'all',
  },
];

// ─── API response types ──────────────────────────────────────────────────────

interface TenantData {
  name: string;
  business_type: string;
  plan: string;
}

interface TenantResponse {
  success: boolean;
  data?: { tenant: TenantData };
}

interface SetupTasksResponse {
  success: boolean;
  data?: { setup_tasks: SetupTasks };
}

// ─── Setup page ───────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);

  const tenantId = user?.tenant_id ?? '';
  const tenantUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';

  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [tasks, setTasks] = useState<SetupTasks>({ catalogue: false, tables: false, staff: false, qr: false });
  const [loading, setLoading] = useState(true);

  // Fetch tenant details + setup tasks from server
  useEffect(() => {
    if (!tenantId || !token) { setLoading(false); return; }
    void (async () => {
      try {
        const [tenantRes, tasksRes] = await Promise.all([
          fetch(`${tenantUrl}/api/v1/tenants/${tenantId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/setup-tasks`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const tenantData = (await tenantRes.json()) as TenantResponse;
        if (tenantData.success && tenantData.data?.tenant) {
          setTenant(tenantData.data.tenant);
        }

        const tasksData = (await tasksRes.json()) as SetupTasksResponse;
        if (tasksData.success && tasksData.data?.setup_tasks) {
          setTasks(tasksData.data.setup_tasks);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, token, tenantUrl]);

  // Re-fetch setup tasks when page regains focus (user comes back from completing a task)
  useEffect(() => {
    const refresh = async () => {
      if (!tenantId || !token) return;
      try {
        const res = await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/setup-tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as SetupTasksResponse;
        if (data.success && data.data?.setup_tasks) {
          setTasks(data.data.setup_tasks);
        }
      } catch { /* ignore */ }
    };
    const handler = () => void refresh();
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [tenantId, token, tenantUrl]);

  const businessType = tenant?.business_type ?? '';

  // Filter tasks relevant to this business type
  const visibleTasks = ALL_TASKS.filter((t) =>
    t.showFor === 'all' || (t.showFor as string[]).includes(businessType)
  );

  const taskIds = visibleTasks.map((t) => t.id);
  const completedCount = taskIds.filter((id) => tasks[id]).length;
  const allDone = taskIds.every((id) => tasks[id]);
  const progressPct = taskIds.length > 0 ? Math.round((completedCount / taskIds.length) * 100) : 0;

  // Mark task done on server when user navigates to it
  const handleTaskClick = async (task: SetupTask) => {
    // Mark as done on server (fire-and-forget)
    if (!tasks[task.id]) {
      try {
        await fetch(`${tenantUrl}/api/v1/onboarding/${tenantId}/setup-tasks`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ task_id: task.id }),
        });
        setTasks((prev) => ({ ...prev, [task.id]: true }));
      } catch { /* ignore */ }
    }
    navigate(task.to);
  };

  const isDineIn = DINE_IN_TYPES.includes(businessType);
  const isDelivery = DELIVERY_TYPES.includes(businessType);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading your setup checklist...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {allDone ? 'Setup complete!' : `Welcome to ${tenant?.name ?? 'your business'}`}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {allDone
                  ? 'Your business is fully set up. Head to the dashboard.'
                  : 'Complete these steps to start taking orders.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/floor-map')}
              className="text-sm text-brand-500 hover:text-brand-600 font-medium transition-colors whitespace-nowrap ml-4 border border-brand-200 rounded-lg px-3 py-1.5"
            >
              Go to dashboard →
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>{completedCount} of {taskIds.length} steps complete</span>
              <span className="font-medium text-brand-500">{progressPct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Task cards */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {/* Business type context pill */}
        {businessType && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
              {isDineIn && isDelivery ? 'Dine-in + Delivery' : isDineIn ? 'Dine-in' : isDelivery ? 'Delivery' : 'Retail'}
            </span>
            <span className="text-xs text-gray-400">
              Showing {visibleTasks.length} setup tasks for your business
            </span>
          </div>
        )}

        {visibleTasks.map((task) => {
          const done = tasks[task.id];
          return (
            <TaskCard
              key={task.id}
              task={task}
              done={done}
              onClick={() => void handleTaskClick(task)}
            />
          );
        })}

        {/* Go to dashboard CTA */}
        <div className="pt-4">
          {allDone ? (
            <button
              onClick={() => navigate('/floor-map')}
              className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl text-base transition-colors"
            >
              Go to dashboard
            </button>
          ) : (
            <button
              onClick={() => navigate('/floor-map')}
              className="w-full py-3 border border-gray-200 text-gray-500 font-medium rounded-xl hover:border-gray-300 hover:text-gray-700 transition-colors text-sm"
            >
              Skip — go to dashboard anyway
            </button>
          )}
        </div>

        {/* Plan info */}
        {tenant?.plan === 'free' && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mt-2">
            <p className="text-xs font-semibold text-brand-600">Free plan active</p>
            <p className="text-xs text-brand-500 mt-0.5">
              Start with the free plan. Upgrade anytime to unlock inventory, analytics, and more.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({
  task, done, onClick,
}: { task: SetupTask; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
        done
          ? 'border-green-200 bg-green-50'
          : task.critical
          ? 'border-brand-200 bg-white hover:border-brand-400 hover:shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Completion indicator */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          done ? 'bg-green-500' : task.critical ? 'bg-brand-100' : 'bg-gray-100'
        }`}>
          {done ? (
            <span className="text-white text-sm font-bold">✓</span>
          ) : (
            <span className="text-base">{task.icon}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${done ? 'text-green-700 line-through' : 'text-gray-900'}`}>
              {task.label}
            </span>
            {task.critical && !done && (
              <span className="text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full font-medium">
                Required
              </span>
            )}
            {done && (
              <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">
                Done
              </span>
            )}
          </div>
          <p className={`text-xs mt-1 leading-relaxed ${done ? 'text-green-600' : 'text-gray-500'}`}>
            {task.description}
          </p>
        </div>

        {/* Arrow */}
        {!done && (
          <span className="text-gray-300 text-lg flex-shrink-0">→</span>
        )}
      </div>
    </button>
  );
}
