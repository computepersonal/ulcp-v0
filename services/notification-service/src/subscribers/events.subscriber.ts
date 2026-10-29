import Redis from "ioredis";
import { createSubscriberClient } from "../lib/redis";
import { notificationQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { getChannelsForEvent, shouldUseWhatsApp } from "../services/router.service";
import type { NotificationChannel } from "../services/router.service";

// All Redis pub/sub event channels (from CLAUDE.md)
const EVENT_CHANNELS = [
  "ORDER_CREATED",
  "ORDER_COMPLETED",
  "PAYMENT_COMPLETED",
  "STOCK_LOW",
  "STOCK_CRITICAL",
  "BID_REQUEST_OPENED",
  "BID_AWARDED",
  "DIRECT_ORDER_CREATED",
];

interface EventPayload {
  tenant_id?: string;
  branch_id?: string;
  business_type?: string;
  order_id?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
  owner_email?: string;
  owner_phone?: string;
  vendor_email?: string;
  vendor_phone?: string;
  item_name?: string;
  order_number?: string;
  business_name?: string;
  amount?: number;
  [key: string]: unknown;
}

let subscriberClient: Redis | null = null;

async function queueChannels(
  channels: NotificationChannel[],
  payload: EventPayload,
  jobNamePrefix: string
): Promise<void> {
  const jobPromises: Promise<unknown>[] = [];

  for (const channel of channels) {
    switch (channel) {
      case "email": {
        const to = payload.customer_email ?? payload.owner_email ?? payload.vendor_email;
        if (!to) break;
        jobPromises.push(notificationQueue.add(`${jobNamePrefix}-email`, {
          type: "email",
          to,
          subject: "Notification from {{business_name}}",
          template: "Hello {{customer_name}}, your order {{order_number}} update.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        }));
        break;
      }
      case "sms": {
        const to = payload.customer_phone ?? payload.owner_phone ?? payload.vendor_phone;
        if (!to) break;
        jobPromises.push(notificationQueue.add(`${jobNamePrefix}-sms`, {
          type: "sms",
          to,
          template: "{{business_name}}: {{message}}",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        }));
        break;
      }
      case "push": {
        const to = payload.customer_phone ?? payload.owner_phone;
        if (!to) break;
        jobPromises.push(notificationQueue.add(`${jobNamePrefix}-push`, {
          type: "push",
          to,
          template: "{{message}}",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        }));
        break;
      }
      case "whatsapp": {
        const to = payload.customer_phone ?? payload.owner_phone ?? payload.vendor_phone;
        if (!to) break;
        jobPromises.push(notificationQueue.add(`${jobNamePrefix}-whatsapp`, {
          type: "whatsapp",
          to,
          template: "order_update",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        }));
        break;
      }
    }
  }

  const jobs = jobPromises;

  await Promise.allSettled(jobs);
}

async function handleEvent(channel: string, message: string): Promise<void> {
  let payload: EventPayload;
  try {
    payload = JSON.parse(message) as EventPayload;
  } catch {
    logger.warn({ channel, message }, "Failed to parse event payload as JSON");
    return;
  }

  const businessType = payload.business_type ?? "default";

  logger.debug({ channel, tenant_id: payload.tenant_id }, "Handling event");

  switch (channel) {
    case "ORDER_CREATED": {
      // Alert owner/staff of new order
      if (payload.owner_phone) {
        const channels = getChannelsForEvent("delivery_order", businessType);
        await queueChannels(
          channels.filter((c): c is NotificationChannel => c !== "email"),
          { ...payload, message: `New order ${payload.order_number} received` },
          "order-created"
        );
      }
      break;
    }

    case "ORDER_COMPLETED": {
      // Email receipt to customer
      if (payload.customer_email) {
        await notificationQueue.add("order-receipt-email", {
          type: "email",
          to: payload.customer_email,
          subject: `Order Receipt - ${payload.order_number}`,
          template: "Thank you {{customer_name}}! Your order {{order_number}} total: {{amount}}",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "PAYMENT_COMPLETED": {
      // Email + SMS receipt
      if (payload.customer_email) {
        await notificationQueue.add("payment-receipt-email", {
          type: "email",
          to: payload.customer_email,
          subject: "Payment Confirmed",
          template: "Payment of {{amount}} received for order {{order_number}}.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      if (payload.customer_phone) {
        await notificationQueue.add("payment-receipt-sms", {
          type: "sms",
          to: payload.customer_phone,
          template: "Payment of {{amount}} confirmed for order {{order_number}}. {{business_name}}",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "STOCK_LOW": {
      if (payload.owner_phone) {
        await notificationQueue.add("stock-low-push", {
          type: "push",
          to: payload.owner_phone,
          template: "Low stock alert: {{item_name}} is running low",
          data: { ...payload, message: `Low stock: ${payload.item_name}` } as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "STOCK_CRITICAL": {
      if (payload.owner_phone) {
        await notificationQueue.add("stock-critical-push", {
          type: "push",
          to: payload.owner_phone,
          template: "CRITICAL: {{item_name}} is out of stock",
          data: { ...payload, message: `CRITICAL: ${payload.item_name} out of stock` } as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
        await notificationQueue.add("stock-critical-sms", {
          type: "sms",
          to: payload.owner_phone,
          template: "CRITICAL stock alert: {{item_name}} is out. Dependent items auto-disabled.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "BID_REQUEST_OPENED": {
      const useWhatsApp = shouldUseWhatsApp(businessType);
      if (payload.vendor_email) {
        await notificationQueue.add("bid-request-email", {
          type: "email",
          to: payload.vendor_email,
          subject: "New Bid Request",
          template: "You have a new bid request. Click the link to submit your bid.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      if (useWhatsApp && payload.vendor_phone) {
        await notificationQueue.add("bid-request-whatsapp", {
          type: "whatsapp",
          to: payload.vendor_phone,
          template: "bid_request",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "BID_AWARDED": {
      if (payload.vendor_email) {
        await notificationQueue.add("bid-awarded-email", {
          type: "email",
          to: payload.vendor_email,
          subject: "Congratulations! Your bid was selected",
          template: "Your bid has been awarded. Please prepare for delivery.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    case "DIRECT_ORDER_CREATED": {
      const useWhatsApp = shouldUseWhatsApp(businessType);
      if (payload.vendor_email) {
        await notificationQueue.add("direct-order-email", {
          type: "email",
          to: payload.vendor_email,
          subject: "New Direct Purchase Order",
          template: "You have received a new purchase order from {{business_name}}.",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      if (useWhatsApp && payload.vendor_phone) {
        await notificationQueue.add("direct-order-whatsapp", {
          type: "whatsapp",
          to: payload.vendor_phone,
          template: "direct_order",
          data: payload as Record<string, unknown>,
          tenant_id: payload.tenant_id,
        });
      }
      break;
    }

    default:
      logger.debug({ channel }, "Unhandled event channel");
  }
}

export async function subscribeToEvents(): Promise<void> {
  subscriberClient = createSubscriberClient();

  await subscriberClient.subscribe(...EVENT_CHANNELS);

  subscriberClient.on("message", (channel: string, message: string) => {
    handleEvent(channel, message).catch((err) => {
      logger.error({ err, channel }, "Error handling event");
    });
  });

  logger.info({ channels: EVENT_CHANNELS }, "Subscribed to Redis event channels");
}

export async function closeSubscriber(): Promise<void> {
  if (subscriberClient) {
    await subscriberClient.quit();
    logger.info("Redis event subscriber closed");
  }
}
