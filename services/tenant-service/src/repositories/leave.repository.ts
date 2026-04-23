import { prisma } from "../lib/prisma";

// ─── Leave Types ─────────────────────────────────────────────────────────────

export async function findLeaveTypes(tenant_id: string) {
  return prisma.leaveType.findMany({
    where: { tenant_id },
    orderBy: { name: "asc" },
  });
}

export async function findLeaveTypeById(id: string, tenant_id: string) {
  return prisma.leaveType.findFirst({ where: { id, tenant_id } });
}

export async function createLeaveType(data: {
  tenant_id: string;
  name: string;
  code: string;
  annual_quota?: number;
  is_paid?: boolean;
  carry_forward?: boolean;
  max_carry?: number;
}) {
  return prisma.leaveType.create({ data });
}

export async function updateLeaveType(id: string, tenant_id: string, data: {
  name?: string;
  annual_quota?: number;
  is_paid?: boolean;
  carry_forward?: boolean;
  max_carry?: number;
  is_active?: boolean;
}) {
  return prisma.leaveType.updateMany({
    where: { id, tenant_id },
    data: { ...data, updated_at: new Date() },
  });
}

// ─── Leave Balances ──────────────────────────────────────────────────────────

export async function findLeaveBalances(tenant_id: string, user_id: string, year: number) {
  return prisma.leaveBalance.findMany({
    where: { tenant_id, user_id, year },
    include: { leave_type: true },
  });
}

export async function upsertLeaveBalance(
  user_id: string,
  leave_type_id: string,
  year: number,
  data: { tenant_id: string; total: number; used?: number; pending?: number }
) {
  return prisma.leaveBalance.upsert({
    where: { user_id_leave_type_id_year: { user_id, leave_type_id, year } },
    create: { user_id, leave_type_id, year, ...data },
    update: { total: data.total, used: data.used, pending: data.pending },
  });
}

export async function incrementLeaveUsed(
  user_id: string,
  leave_type_id: string,
  year: number,
  days: number
) {
  return prisma.leaveBalance.updateMany({
    where: { user_id, leave_type_id, year },
    data: { used: { increment: days }, pending: { decrement: days } },
  });
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

export async function findLeaveRequests(
  tenant_id: string,
  filters: { user_id?: string; status?: string }
) {
  return prisma.leaveRequest.findMany({
    where: {
      tenant_id,
      ...(filters.user_id ? { user_id: filters.user_id } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { leave_type: true },
    orderBy: { created_at: "desc" },
  });
}

export async function findLeaveRequestById(id: string, tenant_id: string) {
  return prisma.leaveRequest.findFirst({
    where: { id, tenant_id },
    include: { leave_type: true },
  });
}

export async function createLeaveRequest(data: {
  tenant_id: string;
  user_id: string;
  leave_type_id: string;
  start_date: Date;
  end_date: Date;
  days: number;
  reason?: string;
}) {
  return prisma.leaveRequest.create({
    data,
    include: { leave_type: true },
  });
}

export async function updateLeaveRequestStatus(
  id: string,
  tenant_id: string,
  data: {
    status: string;
    reviewed_by: string;
    review_notes?: string;
  }
) {
  return prisma.leaveRequest.updateMany({
    where: { id, tenant_id },
    data: {
      ...data,
      reviewed_at: new Date(),
      updated_at: new Date(),
    },
  });
}
