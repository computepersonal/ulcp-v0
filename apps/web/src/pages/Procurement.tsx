import { useState, useEffect } from 'react';
import { useAppSelector } from '../hooks/redux';

type ProcurementTab = 'market' | 'vendors' | 'bids' | 'orders';

interface MarketItem {
  ingredient_name: string;
  recommended_vendor: string;
  price_per_unit: number;
  unit: string;
}

interface Vendor {
  id: string;
  name: string;
  contact: string;
  rating: number;
  items_count: number;
}

interface BidRequest {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  status: 'open' | 'closed' | 'awarded';
  bid_close_at: string;
  bids_count: number;
}

interface DirectOrder {
  id: string;
  vendor_name: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  status: 'pending' | 'confirmed' | 'dispatched' | 'delivered';
  ordered_at: string;
}

const DEMO_MARKET: MarketItem[] = [
  { ingredient_name: 'Tomatoes', recommended_vendor: 'Fresh Farms', price_per_unit: 250, unit: 'kg' },
  { ingredient_name: 'Chicken', recommended_vendor: 'Meat Masters', price_per_unit: 18000, unit: 'kg' },
  { ingredient_name: 'Basmati Rice', recommended_vendor: 'GrainCo', price_per_unit: 9000, unit: 'kg' }
];

const DEMO_VENDORS: Vendor[] = [
  { id: 'v1', name: 'Fresh Farms', contact: '+91 9876543210', rating: 4.5, items_count: 12 },
  { id: 'v2', name: 'Meat Masters', contact: '+91 9876543211', rating: 4.2, items_count: 8 },
  { id: 'v3', name: 'GrainCo', contact: '+91 9876543212', rating: 4.8, items_count: 5 }
];

const DEMO_BIDS: BidRequest[] = [
  { id: 'b1', ingredient_name: 'Tomatoes', quantity: 50, unit: 'kg', status: 'open', bid_close_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), bids_count: 3 },
  { id: 'b2', ingredient_name: 'Paneer', quantity: 20, unit: 'kg', status: 'awarded', bid_close_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), bids_count: 5 }
];

const DEMO_ORDERS: DirectOrder[] = [
  { id: 'o1', vendor_name: 'Fresh Farms', ingredient_name: 'Tomatoes', quantity: 30, unit: 'kg', status: 'dispatched', ordered_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 'o2', vendor_name: 'GrainCo', ingredient_name: 'Rice', quantity: 100, unit: 'kg', status: 'delivered', ordered_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
];

export default function Procurement() {
  const auth = useAppSelector((s) => s.auth);
  const [tab, setTab] = useState<ProcurementTab>('market');
  const [marketItems, setMarketItems] = useState<MarketItem[]>(DEMO_MARKET);
  const [vendors, setVendors] = useState<Vendor[]>(DEMO_VENDORS);
  const [bidRequests, setBidRequests] = useState<BidRequest[]>(DEMO_BIDS);
  const [directOrders, setDirectOrders] = useState<DirectOrder[]>(DEMO_ORDERS);
  const [selectedIngredient, setSelectedIngredient] = useState<string | null>(null);

  const procurementUrl = import.meta.env.VITE_PROCUREMENT_SERVICE_URL ?? 'http://localhost:3013';

  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        const [marketRes, vendorRes, bidRes, orderRes] = await Promise.all([
          fetch(`${procurementUrl}/api/v1/procurement/${auth.user!.tenant_id}/market`, { headers: { Authorization: `Bearer ${auth.token}` } }),
          fetch(`${procurementUrl}/api/v1/procurement/${auth.user!.tenant_id}/vendors`, { headers: { Authorization: `Bearer ${auth.token}` } }),
          fetch(`${procurementUrl}/api/v1/procurement/${auth.user!.tenant_id}/bid-requests`, { headers: { Authorization: `Bearer ${auth.token}` } }),
          fetch(`${procurementUrl}/api/v1/procurement/${auth.user!.tenant_id}/direct-orders`, { headers: { Authorization: `Bearer ${auth.token}` } })
        ]);
        if (marketRes.ok) {
          const d = (await marketRes.json()) as { success: boolean; data?: MarketItem[] };
          if (d.success && d.data && d.data.length > 0) setMarketItems(d.data);
        }
        if (vendorRes.ok) {
          const d = (await vendorRes.json()) as { success: boolean; data?: Vendor[] };
          if (d.success && d.data && d.data.length > 0) setVendors(d.data);
        }
        if (bidRes.ok) {
          const d = (await bidRes.json()) as { success: boolean; data?: BidRequest[] };
          if (d.success && d.data && d.data.length > 0) setBidRequests(d.data);
        }
        if (orderRes.ok) {
          const d = (await orderRes.json()) as { success: boolean; data?: DirectOrder[] };
          if (d.success && d.data && d.data.length > 0) setDirectOrders(d.data);
        }
      } catch {
        // Use demo data
      }
    };
    void load();
  }, [auth, procurementUrl]);

  const tabs: Array<{ id: ProcurementTab; label: string }> = [
    { id: 'market', label: 'Market View' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'bids', label: 'Bid Requests' },
    { id: 'orders', label: 'Orders' }
  ];

  const STATUS_COLORS: Record<string, string> = {
    open: 'bg-blue-50 text-blue-700',
    closed: 'bg-gray-50 text-gray-500',
    awarded: 'bg-green-50 text-green-700',
    pending: 'bg-yellow-50 text-yellow-700',
    confirmed: 'bg-blue-50 text-blue-700',
    dispatched: 'bg-orange-50 text-orange-700',
    delivered: 'bg-green-50 text-green-700'
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Procurement</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'market' && (
        <div className="flex gap-4">
          <div className="w-64 shrink-0">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Ingredients</h3>
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {marketItems.map((item, idx) => (
                <button
                  key={item.ingredient_name}
                  onClick={() => setSelectedIngredient(item.ingredient_name)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    idx > 0 ? 'border-t border-gray-50' : ''
                  } ${selectedIngredient === item.ingredient_name ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50'}`}
                >
                  <div className="font-medium">{item.ingredient_name}</div>
                  <div className="text-xs text-gray-400">from ₹{(item.price_per_unit / 100).toFixed(0)}/{item.unit}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            {selectedIngredient ? (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">{selectedIngredient} — Vendor Comparison</h3>
                <div className="grid gap-3">
                  {vendors.slice(0, 3).map((v) => (
                    <div key={v.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{v.name}</div>
                        <div className="text-sm text-gray-500">⭐ {v.rating} · {v.items_count} items</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-brand-600 font-mono">₹{(Math.random() * 500 + 200).toFixed(0)}/kg</div>
                        <button className="mt-1 text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1 rounded-lg">Order</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-3">👈</div>
                <div>Select an ingredient to compare vendors</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'vendors' && (
        <div>
          <div className="flex justify-between mb-4">
            <div className="text-sm text-gray-500">{vendors.length} vendors</div>
            <button className="px-4 py-2 bg-brand-500 text-white text-sm font-semibold rounded-xl">+ Add Vendor</button>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium">Vendor</th>
                  <th className="text-left px-5 py-3 font-medium">Contact</th>
                  <th className="text-left px-5 py-3 font-medium">Rating</th>
                  <th className="text-left px-5 py-3 font-medium">Items</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v, idx) => (
                  <tr key={v.id} className={idx > 0 ? 'border-t border-gray-50' : ''}>
                    <td className="px-5 py-3 font-medium text-gray-900">{v.name}</td>
                    <td className="px-5 py-3 text-gray-500">{v.contact}</td>
                    <td className="px-5 py-3 text-yellow-600">⭐ {v.rating}</td>
                    <td className="px-5 py-3 text-gray-600">{v.items_count} items</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bids' && (
        <div className="space-y-3">
          {bidRequests.map((bid) => (
            <div key={bid.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <div className="font-medium text-gray-900">{bid.ingredient_name}</div>
                <div className="text-sm text-gray-500">{bid.quantity} {bid.unit} · {bid.bids_count} bids</div>
                <div className="text-xs text-gray-400 mt-1">
                  Closes: {new Date(bid.bid_close_at).toLocaleDateString()}
                </div>
              </div>
              <span className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize ${STATUS_COLORS[bid.status]}`}>
                {bid.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {directOrders.map((order) => (
            <div key={order.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <div className="font-medium text-gray-900">{order.ingredient_name}</div>
                <div className="text-sm text-gray-500">{order.vendor_name} · {order.quantity} {order.unit}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(order.ordered_at).toLocaleString()}
                </div>
              </div>
              <span className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize ${STATUS_COLORS[order.status]}`}>
                {order.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
