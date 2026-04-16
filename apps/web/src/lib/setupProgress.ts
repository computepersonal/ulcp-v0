/**
 * Tracks onboarding setup task completion in localStorage.
 * Key: setup_${tenantId}  →  { catalogue: bool, tables: bool, staff: bool, qr: bool }
 */

export type SetupTaskId = 'catalogue' | 'tables' | 'staff' | 'qr';

export interface SetupProgress {
  catalogue: boolean;
  tables: boolean;
  staff: boolean;
  qr: boolean;
}

const defaultProgress = (): SetupProgress => ({
  catalogue: false,
  tables: false,
  staff: false,
  qr: false,
});

export function getSetupProgress(tenantId: string): SetupProgress {
  if (!tenantId) return defaultProgress();
  try {
    const raw = localStorage.getItem(`setup_${tenantId}`);
    return raw ? { ...defaultProgress(), ...(JSON.parse(raw) as Partial<SetupProgress>) } : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function markSetupTaskDone(tenantId: string, taskId: string): void {
  if (!tenantId) return;
  const progress = getSetupProgress(tenantId);
  (progress as unknown as Record<string, boolean>)[taskId] = true;
  localStorage.setItem(`setup_${tenantId}`, JSON.stringify(progress));
}

export function isSetupComplete(tenantId: string, taskIds: SetupTaskId[]): boolean {
  const progress = getSetupProgress(tenantId);
  return taskIds.every((id) => progress[id]);
}

/** Call this when the user navigates from setup to a task page. */
export function startSetupTask(tenantId: string, taskId: SetupTaskId): void {
  localStorage.setItem('setup_active_task', taskId);
  localStorage.setItem('setup_active_tenant', tenantId);
}

/** Returns true if all provided taskIds are marked done. */
export function allTasksDone(progress: SetupProgress, taskIds: SetupTaskId[]): boolean {
  return taskIds.every((id) => progress[id]);
}
