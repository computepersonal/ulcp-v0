import { prisma } from "../lib/prisma";

export interface CreateReservationInput {
  tenant_id: string;
  branch_id: string;
  table_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  pax: number;
  date: string;        // "YYYY-MM-DD"
  time_slot: string;   // "HH:MM"
  notes?: string;
  created_by?: string;
}

export interface UpdateReservationInput {
  status?: string;
  table_id?: string | null;
  notes?: string;
  pax?: number;
  date?: string;
  time_slot?: string;
}

export async function createReservation(input: CreateReservationInput) {
  return prisma.reservation.create({ data: input });
}

export async function listReservations(
  tenant_id: string,
  branch_id: string,
  date?: string,
  status?: string
) {
  return prisma.reservation.findMany({
    where: {
      tenant_id,
      branch_id,
      ...(date ? { date } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ date: "asc" }, { time_slot: "asc" }],
    include: { table: { select: { id: true, name: true } } },
  });
}

export async function findReservationById(id: string, tenant_id: string) {
  return prisma.reservation.findFirst({
    where: { id, tenant_id },
    include: { table: { select: { id: true, name: true } } },
  });
}

export async function updateReservation(
  id: string,
  _tenant_id: string,
  data: UpdateReservationInput
) {
  return prisma.reservation.update({ where: { id }, data });
}

export async function deleteReservation(id: string, tenant_id: string) {
  return prisma.reservation.deleteMany({ where: { id, tenant_id } });
}

/**
 * Count active (non-cancelled, non-no_show) reservations for a date + time slot.
 * Optionally filter by a specific table_id.
 */
export async function countActiveReservations(
  tenant_id: string,
  branch_id: string,
  date: string,
  time_slot: string,
  table_id?: string
): Promise<number> {
  return prisma.reservation.count({
    where: {
      tenant_id,
      branch_id,
      date,
      time_slot,
      status: { notIn: ["cancelled", "no_show", "completed"] },
      ...(table_id ? { table_id } : {}),
    },
  });
}
