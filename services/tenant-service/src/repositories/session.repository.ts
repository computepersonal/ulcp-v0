import { prisma } from "../lib/prisma";

export async function createTableSession(data: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  customer_id?: string;
  customer_phone?: string;
  customer_name?: string;
  pax?: number;
  status: string;
  confirmed_at?: Date;
  confirmed_by?: string;
}) {
  return prisma.tableSession.create({ data });
}

export async function findActiveSessionByTable(table_id: string) {
  return prisma.tableSession.findFirst({
    where: { table_id, status: { in: ["pending_confirmation", "open", "billed"] } },
    orderBy: { created_at: "desc" },
  });
}

export async function findSessionById(id: string, tenant_id: string) {
  return prisma.tableSession.findFirst({ where: { id, tenant_id } });
}

export async function updateSessionStatus(
  id: string,
  status: string,
  extra?: { confirmed_at?: Date; confirmed_by?: string; closed_at?: Date }
) {
  return prisma.tableSession.update({ where: { id }, data: { status, ...extra } });
}

export async function listSessionsByBranch(tenant_id: string, branch_id: string, status?: string) {
  return prisma.tableSession.findMany({
    where: { tenant_id, branch_id, ...(status ? { status } : {}) },
    orderBy: { created_at: "desc" },
    take: 50,
  });
}
