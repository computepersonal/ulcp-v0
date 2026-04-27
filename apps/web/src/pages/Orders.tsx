import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import { apiFetch } from '../lib/apiFetch';
import { useSocket } from '../hooks/useSocket';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served';
type PaymentMethod = 'cash' | 'upi' | 'card';

interface KotItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  variant_name?: string;
  station?: string;
}

interface Kot {
  id: string;
  kot_number: string;
  status: string;
  items: KotItem[];
}

interface OrderDetail {
  id: string;
  order_number: string;
  branch_id?: string;
  table_id?: string;
  table_name?: string;
  type: string;
  status: OrderStatus;
  subtotal: number;
  tax_amount: number;
  gst_amount: number;
  discount_amount: number;
  total: number;
  payment_status?: string; // pending | paid | failed | refunded
  payment_method?: string; // cash | upi | card | online
  created_at: string;
  kots: Kot[];
  status_history?: Array<{ status: string; created_at: string }>;
}

interface TableBillOrder {
  order_id: string;
  order_number: string;
  total: number;
  items_count: number;
}

interface TableBill {
  orders: TableBillOrder[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  items: Array<{ name?: string; quantity?: number; price?: number }>;
}

interface OrderData {
  id: string;
  order_number: string;
  branch_id?: string;
  table_id?: string;
  table_name?: string;
  type?: string;
  item_count: number;
  total: number;
  status: OrderStatus;
  payment_status?: string;
  created_at: string;
  kots?: Kot[];
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'served'];
const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served'
};
const STATUS_NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'served',
  served: null
};
const STATUS_NEXT_LABEL: Record<OrderStatus, string> = {
  pending: 'Accept',
  confirmed: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: 'Mark Served',
  served: ''
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'border-l-yellow-500',
  confirmed: 'border-l-blue-500',
  preparing: 'border-l-orange-500',
  ready: 'border-l-green-500',
  served: 'border-l-emerald-600'
};
const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-orange-50 text-orange-700 border-orange-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  served: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'upi', label: 'UPI', icon: '📱' },
  { value: 'card', label: 'Card', icon: '💳' },
];

function getElapsed(since: string): string {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return `${mins}m ago`;
}

function fmt(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

export default function Orders() {
  const navigate = useNavigate();
  const auth = useAppSelector((s) => s.auth);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Checkout state
  const [checkoutOrder, setCheckoutOrder] = useState<OrderDetail | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  // Consolidated table bill — populated when the checkout order is at a table
  // with multiple unpaid orders. Lets staff settle the entire tab in one payment.
  const [tableBill, setTableBill] = useState<TableBill | null>(null);
  const [billMode, setBillMode] = useState<'single' | 'table'>('single');
  // When a table tab is opened in pay_now mode (all orders pre-paid), this holds
  // the list of orders to close together. Modal switches to a "close all" UI.
  const [tableCloseOrders, setTableCloseOrders] = useState<OrderData[]>([]);

  // Tenant's dine-in billing mode — drives label copy, not grouping (we group in both).
  const [tenantBillingMode, setTenantBillingMode] = useState<'pay_later' | 'pay_now'>('pay_later');

  const orderServiceUrl = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:3004';
  const tenantServiceUrl = import.meta.env.VITE_TENANT_SERVICE_URL ?? 'http://localhost:3002';
  const socket = useSocket();

  // Real-time socket listeners
  useEffect(() => {
    if (!socket) return;

    const onOrderNew = (data: { order?: OrderData }) => {
      if (!data.order) return;
      setOrders(prev => {
        if (prev.find(o => o.id === data.order!.id)) return prev;
        return [data.order!, ...prev];
      });
    };

    const onStatusChanged = (data: { order_id?: string; status?: string }) => {
      if (!data.order_id || !data.status) return;
      if (['cancelled', 'completed'].includes(data.status)) {
        setOrders(prev => prev.filter(o => o.id !== data.order_id));
        setSelectedOrder(prev => prev?.id === data.order_id ? null : prev);
        setCheckoutOrder(prev => prev?.id === data.order_id ? null : prev);
      } else if (['pending', 'confirmed', 'preparing', 'ready'].includes(data.status)) {
        setOrders(prev => prev.map(o =>
          o.id === data.order_id ? { ...o, status: data.status as OrderStatus } : o
        ));
      }
    };

    socket.on('order:new', onOrderNew);
    socket.on('order:status:changed', onStatusChanged);
    return () => {
      socket.off('order:new', onOrderNew);
      socket.off('order:status:changed', onStatusChanged);
    };
  }, [socket]);

  // Initial load
  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const load = async () => {
      try {
        const res = await apiFetch(
          `${orderServiceUrl}/api/v1/orders/${auth.user!.tenant_id}?status=pending,confirmed,preparing,ready,served`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setFetchError(`API error ${res.status}: ${body.error ?? res.statusText}`);
          return;
        }
        const data = (await res.json()) as { success: boolean; data?: { orders: OrderData[] } };
        setFetchError(null);
        setOrders(data.data?.orders ?? []);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Network error');
      }
    };
    void load();
  }, [auth, orderServiceUrl]);

  // Fetch tenant's dine-in billing mode (drives served-order grouping)
  useEffect(() => {
    if (!auth.user?.tenant_id) return;
    const loadMode = async () => {
      try {
        const res = await apiFetch(
          `${tenantServiceUrl}/api/v1/tenants/${auth.user!.tenant_id}`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { success: boolean; data?: { dine_in_billing_mode?: string } };
        const mode = data.data?.dine_in_billing_mode;
        if (mode === 'pay_now' || mode === 'pay_later') setTenantBillingMode(mode);
      } catch { /* keep default */ }
    };
    void loadMode();
  }, [auth, tenantServiceUrl]);

  const openOrder = async (order: OrderData) => {
    if (!auth.user?.tenant_id) return;
    setLoadingDetail(true);
    try {
      const res = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/${order.id}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { order: OrderDetail } };
        if (data.success && data.data?.order) {
          setSelectedOrder(data.data.order);
          setLoadingDetail(false);
          return;
        }
      }
    } catch { /* fall through */ }
    setSelectedOrder({
      id: order.id,
      order_number: order.order_number,
      type: order.type ?? 'dine_in',
      status: order.status,
      subtotal: order.total,
      tax_amount: 0,
      gst_amount: 0,
      discount_amount: 0,
      total: order.total,
      created_at: order.created_at,
      kots: order.kots ?? [],
    });
    setLoadingDetail(false);
  };

  const advanceOrder = async (orderId: string, nextStatus: OrderStatus) => {
    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;
    try {
      await apiFetch(`${orderServiceUrl}/api/v1/orders/${tenantId}/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch { /* optimistic update anyway */ }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(prev => prev ? { ...prev, status: nextStatus } : prev);
    }
  };

  // Closes a prepaid standalone order after staff verifies handover. No payment
  // step — it's already paid; just flips status to completed and triggers commission.
  const completeOrder = async (orderId: string) => {
    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;
    try {
      await apiFetch(`${orderServiceUrl}/api/v1/orders/${tenantId}/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ status: 'completed' })
      });
    } catch { /* fall through — list refresh on next event will catch it */ }
    setOrders(prev => prev.filter(o => o.id !== orderId));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null);
    }
  };

  const fetchTableBill = async (tenantId: string, branchId: string, tableId: string) => {
    try {
      const res = await apiFetch(
        `${orderServiceUrl}/api/v1/orders/table-bill/${tenantId}/${branchId}/${tableId}`,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { success: boolean; data?: TableBill };
      return data.data ?? null;
    } catch {
      return null;
    }
  };

  // Open checkout for a whole table tab (consolidated). Decides between:
  //   - pay-later flow: at least one order is unpaid → fetch table bill, settle together
  //   - pay-now flow:   all orders already paid → close them all in one click
  const openTableTab = async (tableOrders: OrderData[]) => {
    if (tableOrders.length === 0) return;
    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;
    const first = tableOrders[0];
    if (!first.branch_id || !first.table_id) return;

    setCheckoutSuccess(false);
    setSelectedPayment('cash');
    setTableBill(null);
    setBillMode('single');
    setTableCloseOrders([]);

    // Anchor the modal on the first order — header reads from this.
    setCheckoutOrder({
      id: first.id,
      order_number: first.order_number,
      branch_id: first.branch_id,
      table_id: first.table_id,
      table_name: first.table_name,
      type: first.type ?? 'dine_in',
      status: first.status,
      subtotal: first.total,
      tax_amount: 0,
      gst_amount: 0,
      discount_amount: 0,
      total: first.total,
      payment_status: first.payment_status,
      created_at: first.created_at,
      kots: first.kots ?? [],
    });

    const bill = await fetchTableBill(tenantId, first.branch_id, first.table_id);
    if (bill && bill.orders.length > 0) {
      setTableBill(bill);
      setBillMode('table');
    } else {
      // No unpaid orders left — pay-now case: just close them all together.
      setTableCloseOrders(tableOrders);
    }
  };

  // Close all orders on the table at once (pay-now table tab).
  const closeTableTab = async () => {
    const tenantId = auth.user?.tenant_id;
    if (!tenantId || tableCloseOrders.length === 0) return;
    setCheckoutLoading(true);
    try {
      await Promise.all(
        tableCloseOrders.map((o) =>
          apiFetch(`${orderServiceUrl}/api/v1/orders/${tenantId}/${o.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ status: 'completed' }),
          })
        )
      );
      const closedIds = new Set(tableCloseOrders.map(o => o.id));
      setOrders(prev => prev.filter(o => !closedIds.has(o.id)));
      setSelectedOrder(prev => prev && closedIds.has(prev.id) ? null : prev);
      setCheckoutOrder(null);
      setTableCloseOrders([]);
    } catch {
      /* leave modal open so staff can retry */
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openCheckout = async (order: OrderData | OrderDetail) => {
    setCheckoutSuccess(false);
    setSelectedPayment('cash');
    setTableBill(null);
    setBillMode('single');
    setTableCloseOrders([]);

    const tenantId = auth.user?.tenant_id;
    if (!tenantId) return;

    let detail: OrderDetail | null = null;
    if ('subtotal' in order && order.subtotal !== undefined) {
      detail = order as OrderDetail;
    } else {
      try {
        const res = await apiFetch(
          `${orderServiceUrl}/api/v1/orders/${tenantId}/${order.id}`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; data?: { order: OrderDetail } };
          if (data.data?.order) detail = data.data.order;
        }
      } catch { /* fall through */ }
      if (!detail) {
        detail = {
          id: order.id, order_number: order.order_number, type: order.type ?? 'dine_in',
          status: order.status, subtotal: order.total, tax_amount: 0, gst_amount: 0,
          discount_amount: 0, total: order.total, created_at: order.created_at, kots: [],
          payment_status: (order as OrderDetail).payment_status,
          payment_method: (order as OrderDetail).payment_method,
          branch_id: (order as OrderDetail).branch_id,
          table_id: (order as OrderDetail).table_id,
          table_name: (order as OrderDetail).table_name,
        };
      }
    }

    setCheckoutOrder(detail);

    // If this order is at a table and not yet paid, see if there are other unpaid
    // orders on the same table — offer a single consolidated payment.
    if (detail.table_id && detail.branch_id && detail.payment_status !== 'paid') {
      const bill = await fetchTableBill(tenantId, detail.branch_id, detail.table_id);
      if (bill && bill.orders.length > 1) {
        setTableBill(bill);
        setBillMode('table'); // default to consolidated when multiple unpaid orders exist
      }
    }
  };

  // Already-paid served orders: staff explicitly closes out the order. This
  // triggers commission recording + table-free and removes the card from the kanban.
  const completePaidOrder = async () => {
    if (!checkoutOrder || !auth.user?.tenant_id) return;
    setCheckoutLoading(true);
    try {
      await apiFetch(
        `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/${checkoutOrder.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ status: 'completed' })
        }
      );
      setOrders(prev => prev.filter(o => o.id !== checkoutOrder.id));
      setSelectedOrder(prev => prev?.id === checkoutOrder.id ? null : prev);
      setCheckoutOrder(null);
    } catch {
      /* leave modal open so staff can retry */
    } finally {
      setCheckoutLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!checkoutOrder || !auth.user?.tenant_id) return;
    setCheckoutLoading(true);
    try {
      // Two paths:
      //  - 'table' mode → settle every unpaid order on the table in one payment
      //  - 'single' mode → settle just the open order
      const settledIds = billMode === 'table' && tableBill
        ? tableBill.orders.map(o => o.order_id)
        : [checkoutOrder.id];

      if (billMode === 'table' && tableBill && checkoutOrder.branch_id && checkoutOrder.table_id) {
        await apiFetch(
          `${orderServiceUrl}/api/v1/orders/table-bill/${auth.user.tenant_id}/${checkoutOrder.branch_id}/${checkoutOrder.table_id}/pay`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ payment_method: selectedPayment })
          }
        );
      } else {
        await apiFetch(
          `${orderServiceUrl}/api/v1/orders/${auth.user.tenant_id}/${checkoutOrder.id}/payment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ payment_method: selectedPayment })
          }
        );
      }

      setCheckoutSuccess(true);
      setTimeout(() => {
        setOrders(prev => prev.filter(o => !settledIds.includes(o.id)));
        setSelectedOrder(prev => prev && settledIds.includes(prev.id) ? null : prev);
        setCheckoutOrder(null);
        setTableBill(null);
        setBillMode('single');
        setCheckoutSuccess(false);
      }, 1500);
    } catch {
      // show error? for now just close
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Served orders at the same table collapse into one "table tab" card —
  // pay_later: settle the whole tab in one payment; pay_now: close all together.
  const servedTableGroups = useMemo(() => {
    const map = new Map<string, OrderData[]>();
    orders.forEach((o) => {
      if (o.status !== 'served' || !o.table_id) return;
      const list = map.get(o.table_id) ?? [];
      list.push(o);
      map.set(o.table_id, list);
    });
    return map;
  }, [orders]);

  // No tenant yet — show setup nudge instead of hitting the API and getting a 401
  if (!auth.user?.tenant_id) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Finish setting up first</h2>
        <p className="text-gray-500 text-sm max-w-xs mb-6">
          Complete your business setup before you can receive and manage orders.
        </p>
        <button
          onClick={() => navigate('/setup')}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-colors"
        >
          Go to setup checklist →
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex gap-4">
      {/* Kanban */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Active Orders</h1>
          <button
            onClick={() => navigate('/new-order')}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + New Order
          </button>
        </div>
        {fetchError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            {fetchError}
          </div>
        )}
        <div className="grid grid-cols-5 gap-4">
          {STATUS_ORDER.map((status) => {
            // Hide table-bound served orders from the kanban — they're rendered
            // as one consolidated table-tab card below (works for both billing modes).
            const columnOrders = orders.filter(o => {
              if (o.status !== status) return false;
              if (status === 'served' && o.table_id) return false;
              return true;
            });
            const tableGroups = status === 'served' ? Array.from(servedTableGroups.entries()) : [];
            const columnCount = columnOrders.length + tableGroups.length;
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-gray-700">{STATUS_LABELS[status]}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {columnCount}
                  </span>
                </div>
                <div className="space-y-3">
                  {/* Consolidated table tabs — served orders grouped per table */}
                  {tableGroups.map(([tableId, tableOrders]) => {
                    const total = tableOrders.reduce((sum, o) => sum + o.total, 0);
                    const items = tableOrders.reduce((sum, o) => sum + o.item_count, 0);
                    const oldest = tableOrders.reduce(
                      (oldest, o) => o.created_at < oldest ? o.created_at : oldest,
                      tableOrders[0].created_at
                    );
                    const tableName = tableOrders[0].table_name ?? 'Table';
                    return (
                      <div
                        key={`tab-${tableId}`}
                        onClick={() => { void openTableTab(tableOrders); }}
                        className="bg-emerald-50 border border-l-4 border-l-emerald-600 border-emerald-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-gray-900 text-sm">{tableName}</div>
                          <span className="text-xs font-semibold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                            {tableOrders.length} {tableOrders.length === 1 ? 'order' : 'orders'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Open tab</div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500">{items} items</span>
                          <span className="text-sm font-bold font-mono text-gray-900">{fmt(total)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">since {getElapsed(oldest)}</div>
                        <button
                          onClick={(e) => { e.stopPropagation(); void openTableTab(tableOrders); }}
                          className="mt-3 w-full py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {tenantBillingMode === 'pay_now' ? '✓ Close Table' : '💳 Bill Table'}
                        </button>
                      </div>
                    );
                  })}
                  {columnOrders.map(order => {
                    const isStandalone = !order.table_id;
                    const isPrepaid = order.payment_status === 'paid';
                    const showHandover = order.status === 'served' && isPrepaid;
                    return (
                      <div
                        key={order.id}
                        onClick={() => { void openOrder(order); }}
                        className={`bg-white border border-l-4 ${STATUS_COLORS[order.status]} border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${selectedOrder?.id === order.id ? 'ring-2 ring-brand-500' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-gray-900 text-sm">{order.order_number}</div>
                          {order.table_name ? (
                            <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{order.table_name}</span>
                          ) : isStandalone ? (
                            <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Takeaway</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-500 capitalize mt-0.5 flex items-center gap-1.5">
                          <span>{order.type?.replace(/_/g, ' ')}</span>
                          {isPrepaid && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">✓ PAID</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-400">{order.item_count} items</span>
                          <span className="text-xs font-medium font-mono text-gray-700">{fmt(order.total)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{getElapsed(order.created_at)}</div>

                        {/* Action buttons */}
                        {showHandover ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void completeOrder(order.id); }}
                            className="mt-3 w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ✓ Verify &amp; Hand Over
                          </button>
                        ) : order.status === 'served' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void openCheckout(order); }}
                            className="mt-3 w-full py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            💳 Bill &amp; Checkout
                          </button>
                        ) : STATUS_NEXT[order.status] ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); void advanceOrder(order.id, STATUS_NEXT[order.status]!); }}
                            className="mt-3 w-full py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            {STATUS_NEXT_LABEL[order.status]}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {columnCount === 0 && (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-400">
                      No {STATUS_LABELS[status].toLowerCase()} orders
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order detail panel */}
      {(selectedOrder || loadingDetail) && !checkoutOrder && (
        <div className="w-80 bg-white border border-gray-200 rounded-2xl p-5 shrink-0 h-fit max-h-[calc(100vh-6rem)] overflow-y-auto">
          {loadingDetail ? (
            <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
          ) : selectedOrder ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selectedOrder.order_number}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_BADGE[selectedOrder.status]}`}>
                    {STATUS_LABELS[selectedOrder.status]}
                  </span>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="text-xs text-gray-500 mb-4 space-y-1">
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="capitalize font-medium text-gray-700">{selectedOrder.type.replace(/_/g, ' ')}</span>
                </div>
                {selectedOrder.table_name && (
                  <div className="flex justify-between">
                    <span>Table</span>
                    <span className="font-semibold text-brand-600">{selectedOrder.table_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Placed</span>
                  <span className="font-medium text-gray-700">{getElapsed(selectedOrder.created_at)}</span>
                </div>
              </div>

              {/* KOTs */}
              {selectedOrder.kots.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {selectedOrder.kots.map(kot => (
                    <div key={kot.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">{kot.kot_number}</span>
                        <span className="text-xs text-gray-400 capitalize">{kot.status}</span>
                      </div>
                      <div className="space-y-1">
                        {(kot.items ?? []).map(item => (
                          <div key={item.id} className="flex justify-between text-xs text-gray-600">
                            <span>{item.quantity}× {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl mb-4">
                  No KOTs yet
                </div>
              )}

              {/* Bill summary */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono">{fmt(selectedOrder.subtotal)}</span>
                </div>
                {(selectedOrder.tax_amount ?? selectedOrder.gst_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span className="font-mono">{fmt(selectedOrder.tax_amount ?? selectedOrder.gst_amount)}</span>
                  </div>
                )}
                {selectedOrder.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-mono">-{fmt(selectedOrder.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-sm pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="font-mono">{fmt(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-col gap-2">
                {selectedOrder.status === 'ready' ? (
                  <button
                    onClick={() => { void openCheckout(selectedOrder); }}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    💳 Bill & Checkout
                  </button>
                ) : STATUS_NEXT[selectedOrder.status] ? (
                  <button
                    onClick={() => { void advanceOrder(selectedOrder.id, STATUS_NEXT[selectedOrder.status]!); }}
                    className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {STATUS_NEXT_LABEL[selectedOrder.status]}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Checkout modal ────────────────────────────────────────────────── */}
      {checkoutOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {checkoutSuccess ? (
              <div className="p-10 text-center">
                <div className="text-5xl mb-3">✅</div>
                <div className="text-lg font-bold text-gray-900">Payment Received</div>
                <div className="text-sm text-gray-500 mt-1">{checkoutOrder.order_number} — completed</div>
              </div>
            ) : tableCloseOrders.length > 0 ? (
              /* Pay-now table tab — all orders pre-paid, just close them all */
              <>
                <div className="bg-green-50 border-b border-green-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">Table {checkoutOrder.table_name ?? ''} · Close Tab</div>
                    <div className="text-xs text-green-600 font-medium">
                      {tableCloseOrders.length} order{tableCloseOrders.length === 1 ? '' : 's'} · all paid
                    </div>
                  </div>
                  <button onClick={() => { setCheckoutOrder(null); setTableCloseOrders([]); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div className="space-y-2">
                    {tableCloseOrders.map((o) => (
                      <div key={o.id} className="flex justify-between items-center text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <div>
                          <div className="font-semibold text-gray-800">{o.order_number}</div>
                          <div className="text-xs text-gray-500">{o.item_count} items</div>
                        </div>
                        <span className="font-mono text-gray-700">{fmt(o.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between font-bold text-gray-900 text-base">
                      <span>Total Collected</span>
                      <span className="font-mono">{fmt(tableCloseOrders.reduce((sum, o) => sum + o.total, 0))}</span>
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-1">✅</div>
                    <div className="font-semibold text-green-800">All Orders Paid</div>
                    <div className="text-sm text-green-600 mt-0.5">Close the table to free it for the next guest.</div>
                  </div>
                  <button
                    onClick={() => { void closeTableTab(); }}
                    disabled={checkoutLoading}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
                  >
                    {checkoutLoading ? 'Closing...' : `Close All ${tableCloseOrders.length} Orders & Free Table`}
                  </button>
                  <button
                    onClick={() => { setCheckoutOrder(null); setTableCloseOrders([]); }}
                    disabled={checkoutLoading}
                    className="w-full py-2.5 text-gray-500 hover:text-gray-700 font-medium rounded-xl text-sm transition-colors"
                  >
                    Not yet
                  </button>
                </div>
              </>
            ) : checkoutOrder.payment_status === 'paid' ? (
              /* Already paid — show receipt summary */
              <>
                <div className="bg-green-50 border-b border-green-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">{checkoutOrder.order_number}</div>
                    <div className="text-xs text-green-600 font-medium">Already Paid</div>
                  </div>
                  <button onClick={() => setCheckoutOrder(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
                <div className="px-6 py-5 space-y-5">
                  {/* Items */}
                  <div className="space-y-1">
                    {checkoutOrder.kots.flatMap(k => k.items ?? []).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-700">
                        <span>{item.quantity}× {item.name}</span>
                        <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between font-bold text-gray-900 text-base">
                      <span>Total</span>
                      <span className="font-mono">{fmt(checkoutOrder.total)}</span>
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-1">✅</div>
                    <div className="font-semibold text-green-800">Payment Complete</div>
                    <div className="text-sm text-green-600 mt-0.5">
                      Paid via {checkoutOrder.payment_method ? checkoutOrder.payment_method.toUpperCase() : 'N/A'}
                    </div>
                  </div>
                  <button
                    onClick={() => { void completePaidOrder(); }}
                    disabled={checkoutLoading}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
                  >
                    {checkoutLoading ? 'Closing...' : 'Mark Complete & Close Order'}
                  </button>
                  <button
                    onClick={() => setCheckoutOrder(null)}
                    disabled={checkoutLoading}
                    className="w-full py-2.5 text-gray-500 hover:text-gray-700 font-medium rounded-xl text-sm transition-colors"
                  >
                    Not yet
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    {billMode === 'table' && tableBill && checkoutOrder.table_name ? (
                      <>
                        <div className="font-bold text-gray-900">Table {checkoutOrder.table_name} · Full Bill</div>
                        <div className="text-xs text-gray-500">{tableBill.orders.length} orders · settle together</div>
                      </>
                    ) : (
                      <>
                        <div className="font-bold text-gray-900">{checkoutOrder.order_number}</div>
                        <div className="text-xs text-gray-500 capitalize">{checkoutOrder.type.replace(/_/g, ' ')}</div>
                      </>
                    )}
                  </div>
                  <button onClick={() => { setCheckoutOrder(null); setTableBill(null); setBillMode('single'); setTableCloseOrders([]); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Bill mode toggle — only shown when multiple orders exist on this table */}
                  {tableBill && tableBill.orders.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                      <button
                        onClick={() => setBillMode('table')}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                          billMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Bill table ({tableBill.orders.length})
                      </button>
                      <button
                        onClick={() => setBillMode('single')}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                          billMode === 'single' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Just this order
                      </button>
                    </div>
                  )}

                  {/* Order list (table mode) or items (single mode) */}
                  {billMode === 'table' && tableBill ? (
                    <div className="space-y-2">
                      {tableBill.orders.map((o) => (
                        <div key={o.order_id} className="flex justify-between items-center text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                          <div>
                            <div className="font-semibold text-gray-800">{o.order_number}</div>
                            <div className="text-xs text-gray-500">{o.items_count} items</div>
                          </div>
                          <span className="font-mono text-gray-700">{fmt(o.total)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {checkoutOrder.kots.flatMap(k => k.items ?? []).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm text-gray-700">
                          <span>{item.quantity}× {item.name}</span>
                          <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bill summary */}
                  <div className="border-t border-gray-100 pt-3 space-y-1 text-sm text-gray-600">
                    {billMode === 'table' && tableBill ? (
                      <>
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span className="font-mono">{fmt(tableBill.subtotal)}</span>
                        </div>
                        {tableBill.tax_amount > 0 && (
                          <div className="flex justify-between">
                            <span>GST</span>
                            <span className="font-mono">{fmt(tableBill.tax_amount)}</span>
                          </div>
                        )}
                        {tableBill.discount_amount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount</span>
                            <span className="font-mono">-{fmt(tableBill.discount_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
                          <span>Total</span>
                          <span className="font-mono">{fmt(tableBill.total)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span className="font-mono">{fmt(checkoutOrder.subtotal)}</span>
                        </div>
                        {(checkoutOrder.tax_amount ?? checkoutOrder.gst_amount) > 0 && (
                          <div className="flex justify-between">
                            <span>GST</span>
                            <span className="font-mono">{fmt(checkoutOrder.tax_amount ?? checkoutOrder.gst_amount)}</span>
                          </div>
                        )}
                        {checkoutOrder.discount_amount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount</span>
                            <span className="font-mono">-{fmt(checkoutOrder.discount_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
                          <span>Total</span>
                          <span className="font-mono">{fmt(checkoutOrder.total)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Payment method */}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment Method</div>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHODS.map(pm => (
                        <button
                          key={pm.value}
                          onClick={() => setSelectedPayment(pm.value)}
                          className={`py-3 rounded-xl border-2 text-center transition-colors ${
                            selectedPayment === pm.value
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-xl">{pm.icon}</div>
                          <div className="text-xs font-medium mt-1">{pm.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confirm button */}
                  <button
                    onClick={() => { void confirmPayment(); }}
                    disabled={checkoutLoading}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
                  >
                    {checkoutLoading
                      ? 'Processing...'
                      : `Confirm ${PAYMENT_METHODS.find(p => p.value === selectedPayment)?.label} Payment · ${fmt(billMode === 'table' && tableBill ? tableBill.total : checkoutOrder.total)}`
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
