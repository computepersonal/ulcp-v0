import { prisma } from "../lib/prisma";

// ─── Shift Templates ─────────────────────────────────────────────────────────

export async function findShiftTemplates(tenant_id: string) {
  return prisma.shiftTemplate.findMany({
    where: { tenant_id },
    orderBy: { start_time: "asc" },
  });
}

export async function findShiftTemplateById(id: string, tenant_id: string) {
  return prisma.shiftTemplate.findFirst({ where: { id, tenant_id } });
}

export async function createShiftTemplate(data: {
  tenant_id: string;
  branch_id?: string;
  name: string;
  start_time: string;
  end_time: string;
  break_mins?: number;
  color?: string;
}) {
  return prisma.shiftTemplate.create({ data });
}

export async function updateShiftTemplate(id: string, tenant_id: string, data: {
  name?: string;
  start_time?: string;
  end_time?: string;
  break_mins?: number;
  color?: string;
  is_active?: boolean;
}) {
  return prisma.shiftTemplate.updateMany({
    where: { id, tenant_id },
    data: { ...data, updated_at: new Date() },
  });
}

export async function deleteShiftTemplate(id: string, tenant_id: string) {
  return prisma.shiftTemplate.deleteMany({ where: { id, tenant_id } });
}

// ─── Shift Assignments ───────────────────────────────────────────────────────

export async function findShiftAssignments(
  tenant_id: string,
  filters: { user_id?: string; date_from?: Date; date_to?: Date }
) {
  return prisma.shiftAssignment.findMany({
    where: {
      tenant_id,
      ...(filters.user_id ? { user_id: filters.user_id } : {}),
      ...(filters.date_from || filters.date_to
        ? {
            date: {
              ...(filters.date_from ? { gte: filters.date_from } : {}),
              ...(filters.date_to ? { lte: filters.date_to } : {}),
            },
          }
        : {}),
    },
    include: { shift: true },
    orderBy: { date: "asc" },
  });
}

export async function createShiftAssignment(data: {
  tenant_id: string;
  user_id: string;
  branch_id?: string;
  shift_id: string;
  date: Date;
}) {
  return prisma.shiftAssignment.create({
    data,
    include: { shift: true },
  });
}

export async function updateShiftAssignment(id: string, tenant_id: string, data: {
  status?: string;
  notes?: string;
}) {
  return prisma.shiftAssignment.updateMany({
    where: { id, tenant_id },
    data: { ...data, updated_at: new Date() },
  });
}

export async function deleteShiftAssignment(id: string, tenant_id: string) {
  return prisma.shiftAssignment.deleteMany({ where: { id, tenant_id } });
}
