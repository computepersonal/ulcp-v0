import crypto from "crypto";
import { NotFoundError, ConflictError } from "@ulcp/shared";
import {
  findPartnersByTenant,
  findPartnerByToken,
  findPartnerById,
  createPartner,
  updatePartner,
} from "../repositories/partner.repository";

export type InvitePartnerInput = {
  user_id: string;
  role: string;
  permissions?: Record<string, boolean>;
  assigned_branches?: string[];
};

export type PartnerPermissions = Record<string, boolean>;

export async function invitePartner(
  tenant_id: string,
  data: InvitePartnerInput,
  invited_by: string
) {
  const invite_token = crypto.randomBytes(32).toString("hex");
  const invite_expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  return createPartner({
    user_id: data.user_id,
    role: data.role,
    permissions: data.permissions ?? {},
    assigned_branches: data.assigned_branches ?? [],
    invited_by,
    invite_token,
    invite_expires_at,
    is_active: false,
    tenant: { connect: { id: tenant_id } },
  });
}

export async function acceptPartnerInvite(token: string, user_id: string) {
  const partner = await findPartnerByToken(token);
  if (!partner) throw new NotFoundError("Invite not found");
  if (partner.user_id !== user_id) {
    throw new ConflictError("Invite does not match the provided user");
  }
  if (partner.accepted_at) throw new ConflictError("Invite already accepted");
  if (partner.invite_expires_at && partner.invite_expires_at < new Date()) {
    throw new ConflictError("Invite has expired");
  }

  await updatePartner(partner.id, partner.tenant_id, {
    is_active: true,
    accepted_at: new Date(),
    invite_token: null,
  });

  return findPartnerById(partner.id, partner.tenant_id);
}

export async function listPartners(tenant_id: string) {
  return findPartnersByTenant(tenant_id);
}

export async function updatePartnerPermissions(
  tenant_id: string,
  partner_id: string,
  permissions: PartnerPermissions
) {
  const partner = await findPartnerById(partner_id, tenant_id);
  if (!partner) throw new NotFoundError("Partner not found");

  await updatePartner(partner_id, tenant_id, { permissions });
  return findPartnerById(partner_id, tenant_id);
}
