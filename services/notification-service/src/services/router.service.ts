// Business types that support WhatsApp
const WHATSAPP_BUSINESS_TYPES = new Set([
  "home_kitchen",
  "cloud_kitchen",
  "food_truck",
  "gated_community",
  "catering",
  "kirana",
  "boutique",
  "nursery",
  "pharmacy",
  "handicrafts",
  "bakery",
  "stationery",
]);

export type NotificationChannel = "email" | "sms" | "push" | "whatsapp";

export type NotificationEvent =
  | "dine_in_order"
  | "delivery_order"
  | "order_receipt"
  | "otp"
  | "bid_request"
  | "bid_awarded"
  | "bid_rejected"
  | "low_stock"
  | "stock_critical"
  | "back_in_stock"
  | "critical"
  | string; // allow other event types

export function shouldUseWhatsApp(businessType: string): boolean {
  return WHATSAPP_BUSINESS_TYPES.has(businessType);
}

export function getChannelsForEvent(
  event: NotificationEvent,
  businessType: string
): NotificationChannel[] {
  const whatsapp = shouldUseWhatsApp(businessType);

  switch (event) {
    case "dine_in_order":
      return ["push"];

    case "delivery_order":
      return whatsapp
        ? ["push", "sms", "whatsapp"]
        : ["push", "sms"];

    case "critical":
      return whatsapp
        ? ["push", "sms", "email", "whatsapp"]
        : ["push", "sms", "email"];

    case "order_receipt":
      return ["email"];

    case "otp":
      return ["sms"];

    case "bid_request":
      return whatsapp
        ? ["email", "whatsapp"]
        : ["email"];

    case "bid_awarded":
      return ["email"];

    case "bid_rejected":
      return ["email"];

    case "low_stock":
      return ["push"];

    case "stock_critical":
      return ["push", "sms"];

    case "back_in_stock":
      return ["push", "sms"];

    default:
      return ["push"];
  }
}
