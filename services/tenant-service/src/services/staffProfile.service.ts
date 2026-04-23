import { z } from "zod";
import { NotFoundError } from "@ulcp/shared";
import {
  findProfileByUserId,
  findProfilesByTenant,
  upsertProfile,
  deleteProfile,
} from "../repositories/staffProfile.repository";

// Allow empty strings to pass through as undefined (frontend sends "" for cleared fields)
const optionalString = z.string().optional().transform((v) => v || undefined);
const optionalUrl = z.union([z.string().url(), z.literal("")]).optional().transform((v) => v || undefined);
// Accept ISO datetime, plain date (YYYY-MM-DD), or empty string
const optionalDate = z.string().optional().transform((v) => v || undefined);
const optionalEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z.union([z.enum(values), z.literal("")]).optional().transform((v) => v || undefined);

export const staffProfileSchema = z.object({
  phone: optionalString,
  alt_phone: optionalString,
  date_of_birth: optionalDate,
  gender: optionalEnum(["male", "female", "other", "prefer_not_to_say"]),
  photo_url: optionalUrl,
  address_line1: optionalString,
  address_line2: optionalString,
  city: optionalString,
  state: optionalString,
  pincode: optionalString,
  emergency_name: optionalString,
  emergency_phone: optionalString,
  emergency_relation: optionalString,
  joining_date: optionalDate,
  department: optionalEnum(["kitchen", "service", "management", "delivery", "other"]),
  designation: optionalString,
  employment_type: optionalEnum(["full_time", "part_time", "contract", "intern"]),
  bank_account_no: optionalString,
  bank_ifsc: optionalString,
  bank_name: optionalString,
  pan_number: optionalString,
  aadhaar_last4: z.string().max(4).optional().transform((v) => v || undefined),
  id_proof_url: optionalUrl,
  address_proof_url: optionalUrl,
  notes: optionalString,
  branch_id: optionalString,
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
  // Convert date strings to Date objects for Prisma (handles both YYYY-MM-DD and ISO datetime)
  const data: Record<string, unknown> = { ...input };
  if (input.date_of_birth) {
    data.date_of_birth = new Date(input.date_of_birth);
  } else {
    data.date_of_birth = null;
  }
  if (input.joining_date) {
    data.joining_date = new Date(input.joining_date);
  } else {
    data.joining_date = null;
  }

  return upsertProfile(user_id, tenant_id, data);
}

export async function deleteStaffProfile(user_id: string, tenant_id: string) {
  const profile = await findProfileByUserId(user_id, tenant_id);
  if (!profile) throw new NotFoundError("Staff profile not found");
  return deleteProfile(user_id, tenant_id);
}
