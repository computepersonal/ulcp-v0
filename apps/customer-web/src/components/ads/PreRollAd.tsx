import { useEffect, useState } from "react";
import type { ServedAd } from "./types";

interface Props {
  ad: ServedAd;
  onSkip: () => void;
  onComplete: () => void;
}

export function PreRollAd({ ad, onSkip, onComplete }: Props) {
  const skipAfter = ad.skip_after_secs ?? 5;
  const [elapsed, setElapsed] = useState(0);
  const canSkip = elapsed >= skipAfter;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= skipAfter + 5) {
          clearInterval(interval);
          onComplete();
          return e + 1;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [skipAfter, onComplete]);

  const progress = Math.min((elapsed / (skipAfter + 5)) * 100, 100);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Ad content */}
      {ad.image_url ? (
        <img src={ad.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
      ) : (
        <div className="absolute inset-0" style={{ background: ad.brand_color ?? "#1a1a2e" }} />
      )}

      <div className="relative z-10 text-center px-8">
        {ad.logo_url && (
          <img src={ad.logo_url} alt={ad.advertiser_name} className="w-16 h-16 rounded-xl mx-auto mb-4 object-cover" />
        )}
        <div className="text-white text-2xl font-bold mb-2">{ad.headline}</div>
        {ad.body && <div className="text-white/80 text-sm mb-4">{ad.body}</div>}
        <a
          href={ad.cta_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block px-6 py-2.5 rounded-full font-semibold text-sm text-white border border-white/60 hover:bg-white/10 transition-colors"
        >
          {ad.cta_text}
        </a>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-white transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Skip button */}
      <div className="absolute top-4 right-4">
        {canSkip ? (
          <button
            onClick={onSkip}
            className="px-4 py-2 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
          >
            Skip Ad →
          </button>
        ) : (
          <span className="px-4 py-2 rounded-full bg-black/30 text-white/60 text-sm">
            Skip in {skipAfter - elapsed}s
          </span>
        )}
      </div>

      {/* Ad label */}
      <div className="absolute top-4 left-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 bg-black/30 px-2 py-1 rounded">
          Ad
        </span>
      </div>
    </div>
  );
}
