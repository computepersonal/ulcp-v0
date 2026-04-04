import { Routes, Route, Navigate } from "react-router-dom";
import BidLanding from "./pages/BidLanding";
import BidSubmit from "./pages/BidSubmit";
import BidConfirmed from "./pages/BidConfirmed";
import BidResult from "./pages/BidResult";
import DirectOrderView from "./pages/DirectOrderView";
import DirectOrderDone from "./pages/DirectOrderDone";

export default function App() {
  return (
    <Routes>
      {/* Bid flow */}
      <Route path="/vendor/bid/:token" element={<BidLanding />} />
      <Route path="/vendor/bid/:token/submit" element={<BidSubmit />} />
      <Route path="/vendor/bid/:token/confirmed" element={<BidConfirmed />} />
      <Route path="/vendor/bid/:token/result" element={<BidResult />} />

      {/* Direct order flow */}
      <Route path="/vendor/order/:token" element={<DirectOrderView />} />
      <Route path="/vendor/order/:token/done" element={<DirectOrderDone />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/vendor/bid/invalid" replace />} />
    </Routes>
  );
}
