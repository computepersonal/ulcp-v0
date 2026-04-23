import { prisma } from "../lib/prisma";
import type { User } from "../generated/prisma";

export async function findUserById(
  id: string,
  tenant_id: string
): Promise<User | null> {
  return prisma.user.findFirst({ where: { id, tenant_id } });
}

export async function findUserByIdOnly(id: string): Promise<User | null> {
  return prisma.user.findFirst({ where: { id } });
}

export async function findUserByEmail(
  email: string,
  tenant_id: string
): Promise<User | null> {
  return prisma.user.findFirst({ where: { email, tenant_id, is_active: true } });
}

// For pending_onboarding users who have not been assigned a tenant yet
export async function findPendingUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({ where: { email, tenant_id: null, is_active: true } });
}

// Find any active user by email regardless of tenant — used to give helpful login errors
export async function findAnyUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({ where: { email, is_active: true } });
}

// Find ALL active users with this email (same person, multiple businesses)
export async function findAllUsersByEmail(email: string): Promise<User[]> {
  return prisma.user.findMany({ where: { email, is_active: true, tenant_id: { not: null } } });
}

export async function createUser(data: {
  email: string;
  password_hash: string;
  name: string;
  mobile?: string;
  tenant_id?: string;
  role: string;
  permissions: string[];
}): Promise<User> {
  return prisma.user.create({ data });
}

// Called by tenant-service (via internal API) after creating a tenant
export async function updateUserTenant(
  userId: string,
  tenant_id: string,
  role: string
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { tenant_id, role },
  });
}

export async function updateUserPin(
  userId: string,
  tenant_id: string,
  pin_hash: string
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, tenant_id },
    data: { pin_hash },
  });
}

export async function findUserByPin(
  tenant_id: string,
  branch_id: string,
  pin_hash: string
): Promise<User | null> {
  return prisma.user.findFirst({
    where: { tenant_id, branch_id, pin_hash, is_active: true },
  });
}

export async function findUsersByTenant(tenant_id: string): Promise<User[]> {
  return prisma.user.findMany({
    where: { tenant_id, is_active: true },
    orderBy: { created_at: "asc" },
  });
}

export async function deactivateUser(id: string): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { is_active: false },
  });
}
