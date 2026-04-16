/**
 * Wrapper around fetch that handles 401 responses intelligently:
 * - If user has no tenant yet (pending_onboarding) → redirect to /setup
 * - If user had a valid session that expired → clear auth + redirect to /login
 */
import { store } from '../store';
import { clearAuth } from '../store/authSlice';

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 401) {
    const state = store.getState();
    const role = state.auth.user?.role;
    const tenantId = state.auth.user?.tenant_id;

    if (role === 'pending_onboarding' || !tenantId) {
      // User hasn't finished setup — don't log them out, send to setup
      window.location.href = '/setup';
    } else {
      // Genuine expired/invalid session — clear and re-login
      store.dispatch(clearAuth());
      window.location.href = '/login';
    }
  }

  return res;
}
