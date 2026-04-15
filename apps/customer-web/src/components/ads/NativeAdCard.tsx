import { useEffect, useRef, useState } from "react";
import type { ServedAd } from "./types";

interface Props {
  ad: ServedAd;
  onDismiss?: () => void;
  onImpression?: () => void;
  onClick?: () => void;
}

function fmtDistance(m: number | null): string {
  if (!m) return "";
  return m < 1000 ? `${m}m away` : `${(m / 1000).toFixed(1)}km away`;
}

export function NativeAdCard({ ad, onDismiss, onImpression, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [impressed, setImpressed] = useState(false);

  useEffect(() => {
    if (!ref.current || impressed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            if (!impressed) {
              setImpressed(true);
              onImpression?.();
            }
          }, 1000);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [impressed, onImpression]);

  return (
    <div
      ref={ref}
      className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm"
      style={ad.brand_color ? { borderLeftColor: ad.brand_color, borderLeftWidth: 3 } : undefined}
    >
      {ad.logo_url && (
        <img
          src={ad.logo_url}
          alt={ad.advertiser_name}
          className="w-10 h-10 rounded-lg object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Sponsored
          </span>
          {ad.explore_distance_m && (
            <span className="text-[10px] text-gray-400">{fmtDistance(ad.explore_distance_m)}</span>
          )}
        </div>
        <div className="text-sm font-semibold text-gray-900 truncate">{ad.headline}</div>
        {ad.body && <div className="text-xs text-gray-500 truncate">{ad.body}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onClick}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {ad.cta_text}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
