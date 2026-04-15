import { useEffect, useRef, useState } from "react";
import type { ExploreAd } from "./types";

interface Props {
  ad: ExploreAd;
  onImpression?: () => void;
  onClick?: () => void;
}

function fmtDistance(m: number | null): string {
  if (!m) return "";
  return m < 1000 ? `${m}m away` : `${(m / 1000).toFixed(1)}km away`;
}

function fmtExpiry(expiry: string | null): string | null {
  if (!expiry) return null;
  const d = new Date(expiry);
  const now = new Date();
  const diffH = Math.ceil((d.getTime() - now.getTime()) / 3600000);
  if (diffH <= 0) return null;
  if (diffH <= 24) return `Today only`;
  return null;
}

export function FeaturedAdCard({ ad, onImpression, onClick }: Props) {
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

  const expiry = fmtExpiry(ad.explore_offer_expiry);

  return (
    <div
      ref={ref}
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100"
      style={ad.brand_color ? { borderLeftColor: ad.brand_color, borderLeftWidth: 4 } : undefined}
    >
      <div className="relative">
        {ad.image_url ? (
          <img
            src={ad.image_url}
            alt={ad.advertiser_name}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full aspect-video flex items-center justify-center"
            style={{ background: ad.brand_color ?? "#6366F1" }}
          >
            <span className="text-white text-2xl font-bold">{ad.advertiser_name[0]}</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Featured
          </span>
        </div>
        {ad.distance_m !== null && (
          <div className="absolute top-3 right-3">
            <span className="bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
              {fmtDistance(ad.distance_m)}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-gray-900 text-base">{ad.advertiser_name}</div>
            <div className="text-sm text-gray-600 mt-0.5">{ad.headline}</div>
            {(expiry ?? ad.business_category) && (
              <div className="text-xs text-gray-400 mt-1">
                {expiry && <span className="text-amber-600 font-medium">{expiry}</span>}
                {expiry && ad.business_category && " • "}
                {ad.business_category}
              </div>
            )}
          </div>
          {ad.logo_url && (
            <img
              src={ad.logo_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          )}
        </div>
        <button
          onClick={onClick}
          className="mt-3 w-full py-2 rounded-xl font-semibold text-sm text-white transition-colors"
          style={{ background: ad.brand_color ?? "#6366F1" }}
        >
          {ad.cta_text}
        </button>
      </div>
    </div>
  );
}

export function StandardAdCard({ ad, onImpression, onClick }: Props) {
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
      className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm"
      style={ad.brand_color ? { borderLeftColor: ad.brand_color, borderLeftWidth: 3 } : undefined}
    >
      {ad.logo_url ? (
        <img src={ad.logo_url} alt={ad.advertiser_name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
          style={{ background: ad.brand_color ?? "#6366F1" }}
        >
          {ad.advertiser_name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-900 truncate">{ad.advertiser_name}</span>
          {ad.distance_m !== null && (
            <span className="text-xs text-gray-400 shrink-0">{fmtDistance(ad.distance_m)}</span>
          )}
        </div>
        <div className="text-xs text-gray-600 truncate">{ad.headline}</div>
        {ad.explore_offer_expiry && fmtExpiry(ad.explore_offer_expiry) && (
          <div className="text-xs text-amber-600 font-medium">{fmtExpiry(ad.explore_offer_expiry)}</div>
        )}
      </div>
      <button
        onClick={onClick}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0"
        style={
          ad.brand_color
            ? { borderColor: ad.brand_color, color: ad.brand_color }
            : { borderColor: "#6366F1", color: "#6366F1" }
        }
      >
        {ad.cta_text}
      </button>
    </div>
  );
}
