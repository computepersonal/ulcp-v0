import { redisSub } from "./redis";
import { logger } from "./logger";
import * as loyaltyService from "../services/loyalty.service";

interface OrderCompletedEvent {
  tenant_id: string;
  customer_id?: string;
  order_id: string;
  branch_id: string;
  amount_paid: number;
  items_count: number;
}

export function startEventSubscriber(): void {
  redisSub.subscribe("ORDER_COMPLETED", (err) => {
    if (err) {
      logger.error(err, "Failed to subscribe to ORDER_COMPLETED");
      return;
    }
    logger.info("Subscribed to ORDER_COMPLETED events");
  });

  redisSub.on("message", (channel: string, message: string) => {
    if (channel !== "ORDER_COMPLETED") return;

    try {
      const event = JSON.parse(message) as OrderCompletedEvent;
      if (!event.customer_id) return; // no customer attached — skip

      loyaltyService.handleOrderCompleted({
        tenant_id: event.tenant_id,
        customer_id: event.customer_id,
        order_id: event.order_id,
        branch_id: event.branch_id,
        amount_paid: event.amount_paid,
        items_count: event.items_count,
      }).catch((err: unknown) => {
        logger.error({ err, event }, "Failed to handle ORDER_COMPLETED");
      });
    } catch (err) {
      logger.error({ err, message }, "Failed to parse ORDER_COMPLETED event");
    }
  });
}
