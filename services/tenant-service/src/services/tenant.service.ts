/**
 * tenant.service.ts
 *
 * Design note on emails:
 *   user.email   → personal login credential (authentication only, in identity-service)
 *   tenant.email → business contact email (printed on receipts, invoices, GST documents)
 *   These are intentionally separate. A business owner may use personal@gmail.com to
 *   log in while the business shows info@mycafe.com on receipts. No validation links them.
 */

import QRCode from "qrcode";
import { ConflictError, ForbiddenError, NotFoundError, slugify } from "@ulcp/shared";
import { TENANT_CONFIG_CACHE_TTL_SECS } from "../constants";
import { redisGet, redisSet, redisDel } from "../lib/redis";
import {
  findTenantById,
  findTenantBySlug,
  createTenant,
  updateTenant,
  findTenantsByOwner,
} from "../repositories/tenant.repository";
import { createBranch } from "../repositories/branch.repository";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import {
  fetchOwnerDetails,
  assignUserTenant,
  updateUserRole,
  type OwnerDetails,
} from "../lib/identityClient";

export type CreateTenantInput = {
  name: string;
  slug?: string;
  business_type: string;
  country?: string;
  currency?: string;
  timezone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  /**
   * Business contact email — printed on receipts/invoices/GST documents.
   * NOT the owner's login email (that lives in identity-service).
   */
  email?: string;
  website?: string;
  logo_url?: string;
  cover_url?: string;
};

export type TenantWithOwner = Awaited<ReturnType<typeof findTenantById>> & {
  owner: OwnerDetails | null;
};

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createTenantWithDefaults(
  input: CreateTenantInput,
  owner_user_id: string
) {
  const slug = input.slug ?? slugify(input.name);

  const existing = await findTenantBySlug(slug);
  if (existing) throw new ConflictError(`Slug "${slug}" is already taken`);

  const tenant = await createTenant({
    name: input.name,
    slug,
    business_type: input.business_type,
    country: input.country ?? "IN",
    currency: input.currency ?? "INR",
    timezone: input.timezone ?? "Asia/Kolkata",
    address: input.address,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    phone: input.phone,
    email: input.email,   // business contact email (not the owner's login email)
    website: input.website,
    logo_url: input.logo_url,
    cover_url: input.cover_url,
    owner_user_id,
    plan: "free",
  });

  await createBranch({
    name: input.name,
    address: input.address,
    phone: input.phone,
    is_primary: true,
    is_active: true,
    tenant: { connect: { id: tenant.id } },
  });

  await prisma.subscription.create({
    data: { tenant_id: tenant.id, plan: "free", is_active: true },
  });

  // Assign tenant_id + tenant_owner role to the registering owner in identity-service
  await assignUserTenant(owner_user_id, tenant.id, "tenant_owner");

  await redisSet(`tenant:config:${tenant.id}`, JSON.stringify(tenant), TENANT_CONFIG_CACHE_TTL_SECS);

  return tenant;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getTenant(id: string): Promise<TenantWithOwner> {
  const cached = await redisGet(`tenant:config:${id}`);
  let tenant: Awaited<ReturnType<typeof findTenantById>> | null = null;

  if (cached) {
    try {
      tenant = JSON.parse(cached) as Awaited<ReturnType<typeof findTenantById>>;
    } catch {
      // fall through to DB
    }
  }

  if (!tenant) {
    tenant = await findTenantById(id);
    if (!tenant) throw new NotFoundError("Tenant not found");
    await redisSet(`tenant:config:${id}`, JSON.stringify(tenant), TENANT_CONFIG_CACHE_TTL_SECS);
  }

  // Enrich with owner details from identity-service
  const owner = await fetchOwnerDetails(tenant!.owner_user_id);
  return { ...tenant!, owner };
}

export async function getTenantsByOwner(owner_user_id: string): Promise<TenantWithOwner[]> {
  const tenants = await findTenantsByOwner(owner_user_id);

  // Single owner lookup since all tenants share the same owner
  const owner = tenants.length > 0 ? await fetchOwnerDetails(owner_user_id) : null;

  return tenants.map(t => ({ ...t, owner }));
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateTenantById(
  id: string,
  owner_user_id: string,
  data: Partial<CreateTenantInput>
) {
  const tenant = await findTenantById(id);
  if (!tenant) throw new NotFoundError("Tenant not found");
  if (tenant.owner_user_id !== owner_user_id) {
    throw new ForbiddenError("Only the owner can update tenant details");
  }

  if (data.slug && data.slug !== tenant.slug) {
    const existing = await findTenantBySlug(data.slug);
    if (existing) throw new ConflictError(`Slug "${data.slug}" is already taken`);
  }

  const updated = await updateTenant(id, data);
  await redisDel(`tenant:config:${id}`);
  return updated;
}

// ─── Transfer ownership ───────────────────────────────────────────────────────

export async function transferOwnership(
  tenantId: string,
  currentOwnerUserId: string,
  newOwnerUserId: string
) {
  const tenant = await findTenantById(tenantId);
  if (!tenant) throw new NotFoundError("Tenant not found");
  if (tenant.owner_user_id !== currentOwnerUserId) {
    throw new ForbiddenError("Only the current owner can transfer ownership");
  }
  if (newOwnerUserId === currentOwnerUserId) {
    throw new ConflictError("New owner must be a different user");
  }

  // Update tenant record
  await updateTenant(tenantId, { owner_user_id: newOwnerUserId });

  // Demote old owner → tenant_admin, promote new owner → tenant_owner
  // Both calls must succeed — if either fails the error propagates to the caller
  await updateUserRole(currentOwnerUserId, "tenant_admin");
  await updateUserRole(newOwnerUserId, "tenant_owner");

  await redisDel(`tenant:config:${tenantId}`);

  logger.info({ tenantId, from: currentOwnerUserId, to: newOwnerUserId }, "Ownership transferred");
}

// ─── Plan change ─────────────────────────────────────────────────────────────

export async function updateTenantPlan(
  id: string,
  owner_user_id: string,
  plan: string
) {
  const tenant = await findTenantById(id);
  if (!tenant) throw new NotFoundError("Tenant not found");
  if (tenant.owner_user_id !== owner_user_id) {
    throw new ForbiddenError("Only the owner can change the plan");
  }

  const updated = await updateTenant(id, { plan });
  await redisDel(`tenant:config:${id}`);
  return updated;
}

// ─── QR code ─────────────────────────────────────────────────────────────────

export async function generateQrCode(
  slug: string,
  branch_id?: string,
  table_id?: string
): Promise<string> {
  let url = `https://app.ulcp.in/t/${slug}`;
  if (branch_id) url += `/b/${branch_id}`;
  if (table_id) url += `/table/${table_id}`;

  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}
