import { Navigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = useAppSelector((s) => s.auth.token);
  const role = useAppSelector((s) => s.auth.user?.role);

  if (!token) return <Navigate to="/login" replace />;

  // Logged in but hasn't created a business yet — send to onboarding wizard
  if (role === 'pending_onboarding') return <Navigate to="/onboard" replace />;

  return <>{children}</>;
}
