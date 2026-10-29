import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { store } from './store';
import Register from './pages/Register';
import Onboard from './pages/Onboard';
import InviteAccept from './pages/InviteAccept';

// Mounted at /onboarding (see vite.config.ts `base`). Everything outside this app
// (staff login, the POS) is a separate app on the same origin - reached with full
// page loads via lib/posLinks, not router navigation.
export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter basename="/onboarding">
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/invite/:token" element={<InviteAccept />} />
          <Route path="*" element={<Onboard />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
