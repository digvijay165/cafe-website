import { Navigate, useLocation } from 'react-router-dom';
import { useSite } from '../state';
import { Loading } from './ui';

// Sends signed-out visitors to the login page and brings them back afterwards.
export default function RequireUser({ children, staff = false }) {
  const { user } = useSite();
  const location = useLocation();
  if (user === undefined) return <div className="container py-5"><Loading /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (staff && user.role !== 'staff') return <Navigate to="/" replace />;
  return children;
}
