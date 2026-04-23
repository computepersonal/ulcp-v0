import { useEffect, useRef, useState } from "react";
import type { ServedAd } from "./types";

interface Props {
  ad: ServedAd;
  onImpression?: () => void;
  onClick?: () => void;
}

export function HomeAdBanner({ ad, onImpression, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [impressed, setImpressed] = useState(false);

  useEffect(() => {
    if (!ref.current || impressed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => { setImpressed(true); onImpression?.(); }, 1000);
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
      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"
      style={ad.brand_color ? { borderColor: ad.brand_color } : undefined}
    >
      <div className="flex items-center gap-3">
        {ad.logo_url ? (
          <img src={ad.logo_url} alt={ad.advertiser_name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: ad.brand_color ?? "#6366F1" }}
          >
            {ad.advertiser_name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sponsored</span>
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {ad.advertiser_name}
            {ad.body && (
              <span className="font-normal text-gray-500"> · {ad.body}</span>
            )}
          </div>
          <div className="text-xs text-gray-600 truncate">{ad.headline}</div>
        </div>
        <button
          onClick={onClick}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0 transition-colors"
          style={{ background: ad.brand_color ?? "#6366F1" }}
        >
          {ad.cta_text ?? 'Learn More'}
        </button>
      </div>
    </div>
  );
}
