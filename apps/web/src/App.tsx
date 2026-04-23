import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './store';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboard from './pages/Onboard';
import Setup from './pages/Setup';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import FloorMap from './pages/FloorMap';
import Orders from './pages/Orders';
import Catalogue from './pages/Catalogue';
import Reports from './pages/Reports';
import Staff from './pages/Staff';
import Procurement from './pages/Procurement';
import Settings from './pages/Settings';
import Reservations from './pages/Reservations';
import ActivityLog from './pages/ActivityLog';
import Customers from './pages/Customers';
import NewOrder from './pages/NewOrder';
import InviteAccept from './pages/InviteAccept';
import ToastContainer from './components/ToastContainer';

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<InviteAccept />} />

      {/* Requires auth (any role) — onboarding wizard */}
      <Route path="/onboard" element={<Onboard />} />

      {/* Setup checklist — after wizard, before full usage */}
      <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />

      {/* Requires auth + active tenant */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/floor-map" element={<FloorMap />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/new-order" element={<NewOrder />} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/procurement" element={<Procurement />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Navigate to="/floor-map" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/floor-map" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </Provider>
  );
}
