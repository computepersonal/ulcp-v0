import { PLAN_BRANCH_LIMITS, PlanTier, PlanLimitError, NotFoundError } from "@ulcp/shared";
import {
  findBranchesByTenant,
  findBranchById,
  createBranch,
  updateBranch,
  countBranches,
} from "../repositories/branch.repository";
import { findTenantById } from "../repositories/tenant.repository";

export type CreateBranchInput = {
  name: string;
  address?: string;
  phone?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  printer_ip?: string;
  delivery_radius_km?: number;
};

export async function listBranches(tenant_id: string) {
  return findBranchesByTenant(tenant_id);
}

export async function createBranchForTenant(
  tenant_id: string,
  data: CreateBranchInput
) {
  // Load tenant to get plan
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  const plan = tenant.plan as PlanTier;
  const knownPlan = plan in PLAN_BRANCH_LIMITS ? plan : "free";
  const limit =
    PLAN_BRANCH_LIMITS[knownPlan as keyof typeof PLAN_BRANCH_LIMITS];
  const current = await countBranches(tenant_id);

  if (limit !== Infinity && current >= limit) {
    throw new PlanLimitError(
      `Your ${plan} plan allows a maximum of ${limit} branch(es). Upgrade to add more.`
    );
  }

  return createBranch({
    name: data.name,
    address: data.address,
    phone: data.phone,
    lat: data.lat,
    lng: data.lng,
    timezone: data.timezone ?? "Asia/Kolkata",
    printer_ip: data.printer_ip,
    delivery_radius_km: data.delivery_radius_km ?? 5,
    is_active: true,
    is_primary: false,
    tenant: { connect: { id: tenant_id } },
  });
}

export async function updateBranchForTenant(
  tenant_id: string,
  branch_id: string,
  data: Partial<CreateBranchInput> & { is_active?: boolean }
) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");

  return updateBranch(branch_id, tenant_id, data);
}

export async function softDeleteBranch(tenant_id: string, branch_id: string) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");

  return updateBranch(branch_id, tenant_id, { is_active: false });
}
