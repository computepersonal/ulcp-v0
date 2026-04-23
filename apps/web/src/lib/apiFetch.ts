/**
 * Wrapper around fetch that handles 401 responses:
 * - Attempts silent token refresh using the refresh token
 * - If refresh succeeds → retries the original request with the new token
 * - If refresh fails → clears auth + redirects to /login
 */
import { store } from '../store';
import { setAuth, clearAuth } from '../store/authSlice';

const identityUrl = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:3001';

// Mutex to prevent multiple simultaneous refresh requests
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const state = store.getState();
  const refreshToken = state.auth.refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${identityUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      success: boolean;
      data?: { access_token: string; refresh_token: string };
    };

    if (!data.success || !data.data) return null;

    const user = state.auth.user;
    if (user) {
      store.dispatch(setAuth({
        token: data.data.access_token,
        refreshToken: data.data.refresh_token,
        user,
      }));
    }

    return data.data.access_token;
  } catch {
    return null;
  }
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  // Use the latest token from store
  const state = store.getState();
  const currentToken = state.auth.token;

  // Inject current token if Authorization header contains an old token
  const opts = { ...options };
  if (currentToken && opts.headers) {
    const headers = new Headers(opts.headers);
    if (headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${currentToken}`);
      opts.headers = headers;
    }
  }

  const res = await fetch(url, opts);

  if (res.status === 401) {
    const role = state.auth.user?.role;
    const tenantId = state.auth.user?.tenant_id;

    if (role === 'pending_onboarding' || !tenantId) {
      window.location.href = '/setup';
      return res;
    }

    // Try to refresh the token (use mutex to prevent parallel refreshes)
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;

    if (newToken) {
      // Retry the original request with the new token
      const retryOpts = { ...options };
      const retryHeaders = new Headers(retryOpts.headers ?? {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      retryOpts.headers = retryHeaders;
      return fetch(url, retryOpts);
    }

    // Refresh failed — clear auth and redirect to login
    store.dispatch(clearAuth());
    window.location.href = '/login';
  }

  return res;
}
