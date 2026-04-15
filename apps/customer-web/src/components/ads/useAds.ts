import { useState, useEffect, useRef } from "react";
import type { ServedAd } from "./types";

const ADS_URL = (import.meta.env.VITE_ADS_SERVICE_URL as string | undefined) ?? "http://localhost:3015";

interface AdParams {
  placement: string;
  tenant_id?: string;
  branch_id?: string;
  customer_id?: string;
  lat?: number;
  lng?: number;
  format?: string;
  limit?: number;
  enabled?: boolean;
}

export function useAds(params: AdParams) {
  const [ads, setAds] = useState<ServedAd[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (params.enabled === false) return;

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ placement: params.placement });
        if (params.tenant_id) qs.set("tenant_id", params.tenant_id);
        if (params.branch_id) qs.set("branch_id", params.branch_id);
        if (params.customer_id) qs.set("customer_id", params.customer_id);
        if (params.lat !== undefined) qs.set("lat", String(params.lat));
        if (params.lng !== undefined) qs.set("lng", String(params.lng));
        if (params.format) qs.set("format", params.format);
        if (params.limit) qs.set("limit", String(params.limit));

        const res = await fetch(`${ADS_URL}/api/v1/ads/serve?${qs.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; data?: { ads: ServedAd[] } };
        if (mountedRef.current && data.success && data.data) {
          setAds(data.data.ads);
        }
      } catch {
        // Ads never block rendering — fail silently
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.placement, params.tenant_id, params.enabled]);

  const recordClick = async (ad: ServedAd, impression_id: string) => {
    try {
      const res = await fetch(`${ADS_URL}/api/v1/ads/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: ad.campaign_id,
          creative_id: ad.creative_id,
          impression_id,
          tenant_id: params.tenant_id,
        }),
      });
      const data = await res.json() as { success: boolean; data?: { redirect_url: string } };
      return data.data?.redirect_url ?? ad.cta_url;
    } catch {
      return ad.cta_url;
    }
  };

  return { ads, loading, recordClick };
}
