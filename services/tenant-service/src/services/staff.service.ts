import crypto from "crypto";
import { NotFoundError, ConflictError, AppError } from "@ulcp/shared";
import { logger } from "../lib/logger";
import {
  findInviteByToken,
  createStaffInvite,
  acceptStaffInvite,
  findInvitesByTenant,
  findInviteById,
  deleteStaffInvite,
} from "../repositories/staff.repository";

const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";

export type InviteStaffInput = {
  email: string;
  role: string;
  permissions?: string[];
  branch_id?: string;
};

export type AcceptInviteInput = {
  token: string;
  name: string;
  password: string;
};

export async function inviteStaff(
  tenant_id: string,
  data: InviteStaffInput,
  invited_by: string
) {
  const invite_token = crypto.randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  const invite = await createStaffInvite({
    email: data.email,
    role: data.role,
    permissions: data.permissions ?? [],
    branch_id: data.branch_id,
    invited_by,
    invite_token,
    expires_at,
    tenant: { connect: { id: tenant_id } },
  });

  // Build invite URL for frontend
  const webUrl = process.env.WEB_APP_URL ?? "http://localhost:5173";
  const inviteUrl = `${webUrl}/onboarding/invite/${invite_token}`;

  logger.info({ email: data.email, role: data.role, inviteUrl }, "Staff invite created");

  return { ...invite, invite_url: inviteUrl };
}

/** Validate invite token and return invite details (for the accept page to display) */
export async function getInviteByToken(token: string) {
  const invite = await findInviteByToken(token);
  if (!invite) throw new NotFoundError("Invite not found or invalid link");
  if (invite.accepted_at) throw new ConflictError("This invite has already been accepted");
  if (invite.expires_at < new Date()) throw new ConflictError("This invite has expired. Ask the business owner to send a new one.");

  return {
    email: invite.email,
    role: invite.role,
    tenant_id: invite.tenant_id,
    expires_at: invite.expires_at,
  };
}

/** Accept invite: validate → create identity User → mark invite accepted */
export async function acceptStaffInviteByToken(input: AcceptInviteInput) {
  const invite = await findInviteByToken(input.token);
  if (!invite) throw new NotFoundError("Invite not found or invalid link");
  if (invite.accepted_at) throw new ConflictError("This invite has already been accepted");
  if (invite.expires_at < new Date()) throw new ConflictError("This invite has expired. Ask the business owner to send a new one.");

  // Create the User in identity-service via internal endpoint
  const res = await fetch(`${IDENTITY_SERVICE_URL}/api/v1/auth/internal/register-staff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
    body: JSON.stringify({
      email: invite.email,
      password: input.password,
      name: input.name,
      tenant_id: invite.tenant_id,
      role: invite.role,
      permissions: invite.permissions as string[],
      branch_id: invite.branch_id ?? undefined,
    }),
  });

  const data = (await res.json()) as { success: boolean; data?: { user: { id: string } }; error?: string };

  if (!res.ok || !data.success) {
    const msg = data.error ?? "Failed to create staff account";
    logger.error({ email: invite.email, status: res.status, error: msg }, "Identity register-staff failed");
    throw new AppError(msg, res.status >= 400 && res.status < 500 ? res.status : 500);
  }

  // Mark invite as accepted
  await acceptStaffInvite(input.token);

  logger.info({ email: invite.email, role: invite.role, userId: data.data?.user.id }, "Staff invite accepted, user created");

  return {
    message: "Account created successfully. You can now log in.",
    email: invite.email,
    role: invite.role,
  };
}

export async function listStaffInvites(tenant_id: string) {
  return findInvitesByTenant(tenant_id);
}

export async function revokeStaffInvite(tenant_id: string, invite_id: string) {
  const invite = await findInviteById(invite_id, tenant_id);
  if (!invite) throw new NotFoundError("Invite not found");

  await deleteStaffInvite(invite_id, tenant_id);
}
