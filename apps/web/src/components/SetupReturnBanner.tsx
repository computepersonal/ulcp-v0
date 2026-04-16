/**
 * Floating banner shown on task pages when the user navigated from /setup.
 * Clicking "Back to setup" marks the task as visited and returns to the checklist.
 */
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import { markSetupTaskDone } from '../lib/setupProgress';

export default function SetupReturnBanner() {
  const navigate = useNavigate();
  const tenantId = useAppSelector((s) => s.auth.user?.tenant_id ?? '');

  const activeTask = localStorage.getItem('setup_active_task');
  const activeTenant = localStorage.getItem('setup_active_tenant');

  // Only show if we're in a setup flow for this tenant
  if (!activeTask || activeTenant !== tenantId) return null;

  const handleReturn = () => {
    markSetupTaskDone(tenantId, activeTask);
    localStorage.removeItem('setup_active_task');
    localStorage.removeItem('setup_active_tenant');
    navigate('/setup');
  };

  return (
    <div className="bg-brand-500 text-white px-4 py-2.5 flex items-center justify-between text-sm">
      <span className="font-medium">Setup in progress</span>
      <button
        onClick={handleReturn}
        className="flex items-center gap-1.5 bg-white text-brand-600 font-semibold px-3 py-1 rounded-lg text-xs hover:bg-brand-50 transition-colors"
      >
        ← Back to setup checklist
      </button>
    </div>
  );
}
