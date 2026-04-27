import { Navigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

const OWNER_ROLES = new Set(['tenant_owner', 'primary_owner', 'managing_partner', 'platform_superadmin']);

interface ProtectedRouteProps {
  children: React.ReactNode;
  ownerOnly?: boolean;
}

export default function ProtectedRoute({ children, ownerOnly }: ProtectedRouteProps) {
  const token = useAppSelector((s) => s.auth.token);
  const role = useAppSelector((s) => s.auth.user?.role);
  const onboardingCompleted = useAppSelector((s) => s.auth.onboardingCompleted);

  if (!token) return <Navigate to="/login" replace />;

  // Logged in but hasn't created a business yet — send to onboarding wizard
  if (role === 'pending_onboarding') return <Navigate to="/onboard" replace />;

  // Has a tenant but onboarding not completed — send back to wizard
  // onboardingCompleted === null means we haven't checked yet (will be resolved on login or Layout mount)
  if (onboardingCompleted === false) return <Navigate to="/onboard" replace />;

  // Owner-only pages redirect non-owners to floor map
  if (ownerOnly && role && !OWNER_ROLES.has(role)) return <Navigate to="/floor-map" replace />;

  return <>{children}</>;
}
