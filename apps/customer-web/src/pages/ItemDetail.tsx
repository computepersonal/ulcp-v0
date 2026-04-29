import { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../hooks/redux';
import { addItem } from '../store/cartSlice';

interface Variant {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  isAvailable: boolean;
}

interface OptionChoice {
  id: string;
  name: string;
  add_on_price: number;
}

interface OptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  choices: OptionChoice[];
}

interface Review {
  id: string;
  reviewer_name: string;
  rating: number;
  text: string;
  created_at: string;
  is_verified?: boolean;
}

interface ItemData {
  id: string;
  name: string;
  description?: string;
  price: number;
  mrp?: number;
  images?: Array<{ url: string; isPrimary: boolean }>;
  veg_type?: 'veg' | 'vegan' | 'non_veg' | 'egg';
  calories?: number;
  prep_time_mins?: number;
  variants?: Variant[];
  option_groups?: OptionGroup[];
  tenant_id?: string;
  rating?: number;
  rating_count?: number;
  reviews?: Review[];
}

export default function ItemDetail() {
  const { slug } = useParams<{ slug: string; id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const item = (location.state as { item?: ItemData } | null)?.item;

  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    item?.variants?.[0]?.id ?? null
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="font-medium text-gray-700">Item not found</div>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-6 py-2 bg-brand-500 text-white rounded-xl"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const activeVariant = item.variants?.find(v => v.id === selectedVariant);
  const displayPrice = activeVariant ? activeVariant.price : item.price;
  const primaryImage = item.images?.find(i => i.isPrimary)?.url ?? item.images?.[0]?.url;

  const handleAddToCart = () => {
    if (!slug || !item.tenant_id) return;
    dispatch(addItem({
      id: `${item.id}-${Date.now()}`,
      item_id: item.id,
      name: item.name + (activeVariant ? ` (${activeVariant.name})` : ''),
      price: displayPrice,
      quantity,
      variant: activeVariant?.name,
      notes: notes || undefined,
      tenant_id: item.tenant_id,
      slug
    }));
    navigate(`/place/${slug}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Image */}
      <div className="h-72 bg-gradient-to-br from-brand-100 to-brand-200 relative">
        {primaryImage ? (
          <img src={primaryImage} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">🍽</div>
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center text-gray-700"
        >
          ←
        </button>
      </div>

      <div className="flex-1 bg-white rounded-t-2xl -mt-4 relative z-10 p-5">
        {/* Item info */}
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900 flex-1 pr-4">{item.name}</h1>
          {item.veg_type && (
            <div className={`w-5 h-5 border-2 rounded-sm flex-shrink-0 mt-1 relative ${item.veg_type === 'non_veg' ? 'border-red-500' : 'border-green-500'}`}>
              <div className={`absolute inset-1 rounded-full ${item.veg_type === 'non_veg' ? 'bg-red-500' : 'bg-green-500'}`} />
            </div>
          )}
        </div>

        {item.description && (
          <p className="text-gray-500 text-sm mb-3 leading-relaxed">{item.description}</p>
        )}

        <div className="flex gap-4 text-sm text-gray-500 mb-4">
          {item.calories && <span>🔥 {item.calories} cal</span>}
          {item.prep_time_mins && <span>⏱ {item.prep_time_mins} min</span>}
        </div>

        {/* Variants */}
        {item.variants && item.variants.length > 0 && (
          <div className="mb-4">
            <div className="font-semibold text-gray-900 mb-2 text-sm">Size / Variant</div>
            <div className="flex gap-2 flex-wrap">
              {item.variants.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v.id)}
                  disabled={!v.isAvailable}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    selectedVariant === v.id
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-brand-300'
                  } ${!v.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {v.name} — ₹{(v.price / 100).toFixed(0)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Option groups */}
        {item.option_groups?.map(group => (
          <div key={group.id} className="mb-4">
            <div className="font-semibold text-gray-900 mb-2 text-sm">
              {group.name}
              {group.is_required && <span className="text-red-500 ml-1">*</span>}
            </div>
            <div className="space-y-2">
              {group.choices.map(choice => (
                <label key={choice.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type={group.max_select === 1 ? 'radio' : 'checkbox'}
                    name={group.id}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-gray-700 flex-1">{choice.name}</span>
                  {choice.add_on_price > 0 && (
                    <span className="text-sm text-gray-500">+₹{(choice.add_on_price / 100).toFixed(0)}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Reviews */}
        <ReviewsSection
          rating={item.rating}
          ratingCount={item.rating_count}
          reviews={item.reviews ?? []}
          showAll={showAllReviews}
          onToggleShowAll={() => setShowAllReviews(v => !v)}
        />

        {/* Special instructions */}
        <div className="mb-6">
          <div className="font-semibold text-gray-900 mb-2 text-sm">Special Instructions</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g. No onions, extra spicy..."
            rows={2}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-brand-500 resize-none"
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2">
          <button
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
            className="w-7 h-7 bg-white rounded-lg flex items-center justify-center font-bold text-brand-500 shadow-sm"
          >
            −
          </button>
          <span className="font-bold w-6 text-center">{quantity}</span>
          <button
            onClick={() => setQuantity(q => q + 1)}
            className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
          >
            +
          </button>
        </div>
        <button
          onClick={handleAddToCart}
          className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-xl"
        >
          Add to Cart — ₹{((displayPrice * quantity) / 100).toFixed(0)}
        </button>
      </div>
    </div>
  );
}

// ─── Reviews Section ──────────────────────────────────────────────────────────

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  const cls = size === 'md' ? 'text-base' : 'text-xs';
  return (
    <span className={`text-amber-400 ${cls} leading-none`}>
      {'★'.repeat(full)}
      {half ? '⯨' : ''}
      <span className="text-gray-300">{'★'.repeat(empty)}</span>
    </span>
  );
}

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 1) return 'Today';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReviewsSection({ rating, ratingCount, reviews, showAll, onToggleShowAll }: {
  rating?: number;
  ratingCount?: number;
  reviews: Review[];
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const totalCount = ratingCount ?? reviews.length;
  const visible = showAll ? reviews : reviews.slice(0, 3);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-gray-900 text-sm">Reviews</div>
        {typeof rating === 'number' && rating > 0 && (
          <div className="flex items-center gap-1.5">
            <Stars rating={rating} />
            <span className="text-xs text-gray-600 font-medium">{rating.toFixed(1)}</span>
            {totalCount > 0 && <span className="text-xs text-gray-400">({totalCount})</span>}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="bg-gray-50 rounded-xl px-4 py-5 text-center">
          <div className="text-2xl mb-1">💬</div>
          <div className="text-sm text-gray-600 font-medium">No reviews yet</div>
          <div className="text-xs text-gray-400 mt-0.5">Be the first to share your experience</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(r => (
            <div key={r.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center">
                    {r.reviewer_name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 leading-tight">{r.reviewer_name}</div>
                    <div className="text-[11px] text-gray-400">{formatReviewDate(r.created_at)}</div>
                  </div>
                </div>
                {r.is_verified && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    ✓ Verified
                  </span>
                )}
              </div>
              <div className="mb-1"><Stars rating={r.rating} /></div>
              <p className="text-sm text-gray-700 leading-snug">{r.text}</p>
            </div>
          ))}

          {totalCount > 3 && (
            <button
              onClick={onToggleShowAll}
              className="w-full text-center text-sm font-semibold text-brand-600 py-2 hover:bg-brand-50 rounded-lg"
            >
              {showAll ? 'Show less' : `See all ${totalCount} reviews →`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
