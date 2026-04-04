import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface FloatingCartProps {
  count: number;
  total: number;
  slug: string;
}

export default function FloatingCart({ count, total, slug }: FloatingCartProps) {
  const navigate = useNavigate();
  const [bounce, setBounce] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 600);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 z-40">
      <button
        onClick={() => navigate(`/place/${slug}/cart`)}
        className={`w-full h-13 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl flex items-center justify-between px-4 py-3 shadow-lg transition-all ${bounce ? 'animate-bounce' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            {count}
          </span>
          <span className="text-sm font-medium">{count} {count === 1 ? 'item' : 'items'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">₹{(total / 100).toFixed(0)}</span>
          <span className="text-brand-100">→ View Cart</span>
        </div>
      </button>
    </div>
  );
}
