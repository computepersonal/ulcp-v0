import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import { ONBOARDING } from '../lib/onboardingLinks';

// The onboarding wizard is a separate app, so leave the router with a full page load
function ToOnboarding() {
  useEffect(() => { window.location.replace(ONBOARDING.home); }, []);
  return null;
}

const OWNER_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'platform_superadmin']);

// Routes accessible even while onboarding is incomplete (e.g. launched from wizard)
const ONBOARDING_PASSTHROUGH = new Set(['/catalogue', '/floor-map', '/staff']);

interface ProtectedRouteProps {
  children: React.ReactNode;
  ownerOnly?: boolean;
}

export default function ProtectedRoute({ children, ownerOnly }: ProtectedRouteProps) {
  const token = useAppSelector((s) => s.auth.token);
  const role = useAppSelector((s) => s.auth.user?.role);
  const onboardingCompleted = useAppSelector((s) => s.auth.onboardingCompleted);
  const { pathname } = useLocation();

  if (!token) return <Navigate to="/login" replace />;

  // Logged in but hasn't created a business yet — send to onboarding wizard
  if (role === 'pending_onboarding') return <ToOnboarding />;

  // Has a tenant but onboarding not completed — send back to wizard (owners only)
  // Allow passthrough routes so links opened from the wizard work correctly
  if (onboardingCompleted === false && role && OWNER_ROLES.has(role) && !ONBOARDING_PASSTHROUGH.has(pathname)) {
    return <ToOnboarding />;
  }

  // Owner-only pages redirect non-owners to floor map
  if (ownerOnly && role && !OWNER_ROLES.has(role)) return <Navigate to="/floor-map" replace />;

  return <>{children}</>;
}
