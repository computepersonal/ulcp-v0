import { z } from "zod";
import { NotFoundError } from "@ulcp/shared";
import {
  findProfileByUserId,
  findProfilesByTenant,
  upsertProfile,
  deleteProfile,
} from "../repositories/staffProfile.repository";

export const staffProfileSchema = z.object({
  phone: z.string().optional(),
  alt_phone: z.string().optional(),
  date_of_birth: z.string().datetime().optional(), // ISO string
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  photo_url: z.string().url().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  emergency_name: z.string().optional(),
  emergency_phone: z.string().optional(),
  emergency_relation: z.string().optional(),
  joining_date: z.string().datetime().optional(),
  department: z.enum(["kitchen", "service", "management", "delivery", "other"]).optional(),
  designation: z.string().optional(),
  employment_type: z.enum(["full_time", "part_time", "contract", "intern"]).optional(),
  bank_account_no: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_name: z.string().optional(),
  pan_number: z.string().optional(),
  aadhaar_last4: z.string().max(4).optional(),
  id_proof_url: z.string().url().optional(),
  address_proof_url: z.string().url().optional(),
  notes: z.string().optional(),
  branch_id: z.string().optional(),
});

export type StaffProfileInput = z.infer<typeof staffProfileSchema>;

export async function getStaffProfile(user_id: string, tenant_id: string) {
  const profile = await findProfileByUserId(user_id, tenant_id);
  if (!profile) throw new NotFoundError("Staff profile not found");
  return profile;
}

export async function listStaffProfiles(tenant_id: string, branch_id?: string) {
  return findProfilesByTenant(tenant_id, branch_id);
}

export async function upsertStaffProfile(
  user_id: string,
  tenant_id: string,
  input: StaffProfileInput
) {
  // Convert date strings to Date objects for Prisma
  const data: Record<string, unknown> = { ...input };
  if (input.date_of_birth) data.date_of_birth = new Date(input.date_of_birth);
  if (input.joining_date) data.joining_date = new Date(input.joining_date);

  return upsertProfile(user_id, tenant_id, data);
}

export async function deleteStaffProfile(user_id: string, tenant_id: string) {
  const profile = await findProfileByUserId(user_id, tenant_id);
  if (!profile) throw new NotFoundError("Staff profile not found");
  return deleteProfile(user_id, tenant_id);
}
