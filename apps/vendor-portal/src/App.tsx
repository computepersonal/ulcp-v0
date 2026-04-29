import { Routes, Route, Navigate } from "react-router-dom";
import BidLanding from "./pages/BidLanding";
import BidSubmit from "./pages/BidSubmit";
import BidConfirmed from "./pages/BidConfirmed";
import BidResult from "./pages/BidResult";
import DirectOrderView from "./pages/DirectOrderView";
import DirectOrderDone from "./pages/DirectOrderDone";
import MyInvoices from "./pages/MyInvoices";
import MyCatalog from "./pages/MyCatalog";
import MyProfile from "./pages/MyProfile";

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

      {/* Vendor portal — long-lived session via token */}
      <Route path="/vendor/portal/:token" element={<MyProfile />} />
      <Route path="/vendor/portal/:token/invoices" element={<MyInvoices />} />
      <Route path="/vendor/portal/:token/catalog" element={<MyCatalog />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/vendor/bid/invalid" replace />} />
    </Routes>
  );
}
