import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useAppDispatch } from '../hooks/redux';
import { addNotification } from '../store/uiSlice';

type DateRange = 'today' | 'yesterday' | 'week' | 'month';

const MOCK_REVENUE_DATA = [
  { time: '9am', revenue: 15000 },
  { time: '10am', revenue: 28000 },
  { time: '11am', revenue: 42000 },
  { time: '12pm', revenue: 78000 },
  { time: '1pm', revenue: 95000 },
  { time: '2pm', revenue: 67000 },
  { time: '3pm', revenue: 45000 },
  { time: '4pm', revenue: 38000 },
  { time: '5pm', revenue: 52000 },
  { time: '6pm', revenue: 88000 },
  { time: '7pm', revenue: 112000 },
  { time: '8pm', revenue: 98000 }
];

const TOP_ITEMS = [
  { name: 'Butter Chicken', orders: 24, revenue: 76800 },
  { name: 'Dal Makhani', orders: 18, revenue: 43200 },
  { name: 'Paneer Tikka', orders: 15, revenue: 42000 },
  { name: 'Mango Lassi', orders: 32, revenue: 38400 },
  { name: 'Naan', orders: 45, revenue: 22500 }
];

export default function Reports() {
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const dispatch = useAppDispatch();

  const metrics = {
    revenue: 584000,
    orders: 47,
    avgOrder: 12425,
    upi: 68,
    card: 22,
    cash: 10
  };

  const handleExport = (type: 'pdf' | 'excel') => {
    dispatch(addNotification({ message: `${type.toUpperCase()} export coming soon`, type: 'info' }));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('pdf')}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-gray-300 flex items-center gap-1"
          >
            📄 PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-gray-300 flex items-center gap-1"
          >
            📊 Excel
          </button>
        </div>
      </div>

      {/* Date tabs */}
      <div className="flex gap-2 mb-6">
        {(['today', 'yesterday', 'week', 'month'] as DateRange[]).map((d) => (
          <button
            key={d}
            onClick={() => setDateRange(d)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              dateRange === d ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Revenue" value={`₹${(metrics.revenue / 100).toFixed(0)}`} change="+12%" positive />
        <MetricCard label="Orders" value={String(metrics.orders)} change="+8%" positive />
        <MetricCard label="Avg Order" value={`₹${(metrics.avgOrder / 100).toFixed(0)}`} change="+3%" positive />
        <MetricCard label="Payment Split" value="UPI 68%" change="" />
      </div>

      {/* Revenue chart */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={MOCK_REVENUE_DATA}>
            <XAxis dataKey="time" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `₹${v / 100}`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [`₹${(Number(value) / 100).toFixed(0)}`, 'Revenue']}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#6366F1"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#6366F1' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top items */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Top Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase">
              <th className="text-left pb-3 font-medium">Item</th>
              <th className="text-right pb-3 font-medium">Orders</th>
              <th className="text-right pb-3 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {TOP_ITEMS.map((item, idx) => (
              <tr key={item.name} className={idx > 0 ? 'border-t border-gray-50' : ''}>
                <td className="py-2.5 font-medium text-gray-700">{item.name}</td>
                <td className="py-2.5 text-right text-gray-600">{item.orders}</td>
                <td className="py-2.5 text-right font-medium font-mono text-brand-600">₹{(item.revenue / 100).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change, positive }: { label: string; value: string; change: string; positive?: boolean }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="font-bold text-gray-900 text-xl font-mono">{value}</div>
      {change && (
        <div className={`text-xs font-medium mt-1 ${positive ? 'text-green-600' : 'text-red-500'}`}>
          {change} vs yesterday
        </div>
      )}
    </div>
  );
}
