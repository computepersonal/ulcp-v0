import cron from "node-cron";
import { logger } from "./logger";
import { redis } from "./redis";
import * as offerRepo from "../repositories/customerOffer.repository";
import { prisma } from "./prisma";
import * as loyaltyService from "../services/loyalty.service";

export function startCronJobs(): void {
  // ─── Offer Expiry: runs every hour ─────────────────────────────────────────
  cron.schedule("0 * * * *", async () => {
    try {
      const count = await offerRepo.expireOffers();
      if (count > 0) {
        logger.info({ expired: count }, "Expired offers swept");
      }
    } catch (err) {
      logger.error(err, "Offer expiry cron failed");
    }
  });

  // ─── Expiring Soon Notifications: runs every 2 hours ───────────────────────
  cron.schedule("0 */2 * * *", async () => {
    try {
      const expiringSoon = await offerRepo.getExpiringOffers(24);
      for (const offer of expiringSoon) {
        redis.publish("OFFER_EXPIRING_SOON", JSON.stringify({
          tenant_id: offer.tenant_id,
          customer_id: offer.customer_id,
          offer_id: offer.id,
          offer_name: offer.name,
          expires_at: offer.expires_at,
        })).catch(() => { /* non-critical */ });
      }
      if (expiringSoon.length > 0) {
        logger.info({ count: expiringSoon.length }, "Sent expiring soon notifications");
      }
    } catch (err) {
      logger.error(err, "Expiring soon cron failed");
    }
  });

  // ─── Birthday Offers: runs daily at 6 AM ───────────────────────────────────
  cron.schedule("0 6 * * *", async () => {
    try {
      // Get all unique tenant_ids that have loyalty records
      const tenants = await prisma.customerLoyalty.findMany({
        select: { tenant_id: true, customer_id: true },
        distinct: ["tenant_id", "customer_id"],
      });

      let granted = 0;
      for (const { tenant_id, customer_id } of tenants) {
        try {
          await loyaltyService.checkAndGrantBirthdayOffer(tenant_id, customer_id);
          granted++;
        } catch {
          // Non-fatal — continue with other customers
        }
      }
      logger.info({ checked: tenants.length, granted }, "Birthday offer cron complete");
    } catch (err) {
      logger.error(err, "Birthday cron failed");
    }
  });

  logger.info("Cron jobs started: offer expiry (hourly), expiring soon (2h), birthday (6 AM)");
}
