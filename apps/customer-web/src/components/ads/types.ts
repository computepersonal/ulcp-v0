export interface ServedAd {
  campaign_id: string;
  creative_id: string;
  type: string;
  tenant_id: string | null;
  format: string;
  headline: string;
  body: string | null;
  cta_text: string | null;
  cta_url: string | null;
  image_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  video_url: string | null;
  skip_after_secs: number;
  advertiser_name: string;
  priority: number;
  explore_headline: string | null;
  explore_distance_m: number | null;
  explore_offer_expiry: string | null;
}

export interface ExploreAd {
  campaign_id: string;
  creative_id: string;
  type: "featured" | "standard";
  priority: number;
  distance_m: number | null;
  advertiser_name: string;
  business_category: string | null;
  headline: string;
  body: string | null;
  cta_text: string;
  cta_url: string;
  image_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  explore_offer_expiry: string | null;
}
