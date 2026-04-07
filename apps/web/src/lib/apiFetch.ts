/**
 * Wrapper around fetch that auto-clears auth and redirects to /login on 401.
 * Use this for all authenticated API calls in the staff portal.
 */
import { store } from '../store';
import { clearAuth } from '../store/authSlice';

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 401) {
    store.dispatch(clearAuth());
    window.location.href = '/login';
  }

  return res;
}
