import { Provider } from 'react-redux';
import { useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store, type RootState } from './store';
import { SocialProvider } from './context/SocialContext';
import { JukeboxProvider } from './context/JukeboxContext';
import Home from './pages/Home';
import Catalogue from './pages/Catalogue';
import ItemDetail from './pages/ItemDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderTracking from './pages/OrderTracking';
import Explore from './pages/Explore';
import MyRewards from './pages/MyRewards';
import OrderHistory from './pages/OrderHistory';

function GuestLanding() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">📷</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan a QR code</h1>
      <p className="text-gray-500 text-sm max-w-xs">
        Point your camera at a QR code at any restaurant or shop to browse their menu and place orders.
      </p>
      <div className="mt-6 text-xs text-gray-400">Already have a place link? Open it directly in your browser.</div>
    </div>
  );
}

// Inner component that reads auth token from Redux and passes it to SocialProvider
function AppWithProviders() {
  const authToken = useSelector((s: RootState) => s.auth.token);

  return (
    <SocialProvider authToken={authToken}>
      <JukeboxProvider>
        <BrowserRouter>
          <Routes>
            {/* Home — shows saved places if logged in, scan prompt if guest */}
            <Route path="/" element={
              authToken
                ? <Home />
                : <GuestLanding />
            } />
            {/* Place/catalogue — public, no login required to browse */}
            <Route path="/place/:slug" element={<Catalogue />} />
            <Route path="/place/:slug/item/:id" element={<ItemDetail />} />
            <Route path="/place/:slug/cart" element={<Cart />} />
            <Route path="/place/:slug/checkout" element={<Checkout />} />
            <Route path="/place/:slug/order/:id" element={<OrderTracking />} />
            <Route path="/place/:slug/rewards" element={<MyRewards />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/place/:slug/orders" element={<OrderHistory />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </JukeboxProvider>
    </SocialProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppWithProviders />
    </Provider>
  );
}
