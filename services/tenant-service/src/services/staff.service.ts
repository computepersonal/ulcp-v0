import crypto from "crypto";
import { NotFoundError, ConflictError } from "@ulcp/shared";
import {
  findInviteByToken,
  createStaffInvite,
  acceptStaffInvite,
  findInvitesByTenant,
  findInviteById,
  deleteStaffInvite,
} from "../repositories/staff.repository";

export type InviteStaffInput = {
  email: string;
  role: string;
  permissions?: string[];
  branch_id?: string;
};

export async function inviteStaff(
  tenant_id: string,
  data: InviteStaffInput,
  invited_by: string
) {
  const invite_token = crypto.randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  return createStaffInvite({
    email: data.email,
    role: data.role,
    permissions: data.permissions ?? [],
    branch_id: data.branch_id,
    invited_by,
    invite_token,
    expires_at,
    tenant: { connect: { id: tenant_id } },
  });
}

export async function acceptStaffInviteByToken(token: string) {
  const invite = await findInviteByToken(token);
  if (!invite) throw new NotFoundError("Invite not found");
  if (invite.accepted_at) throw new ConflictError("Invite already accepted");
  if (invite.expires_at < new Date()) throw new ConflictError("Invite has expired");

  return acceptStaffInvite(token);
}

export async function listStaffInvites(tenant_id: string) {
  return findInvitesByTenant(tenant_id);
}

export async function revokeStaffInvite(tenant_id: string, invite_id: string) {
  const invite = await findInviteById(invite_id, tenant_id);
  if (!invite) throw new NotFoundError("Invite not found");

  await deleteStaffInvite(invite_id, tenant_id);
}
