import { prisma } from "../lib/prisma";

export interface CreateAuditLogInput {
  tenant_id: string;
  branch_id?: string;
  actor_id: string;
  actor_name?: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogsFilter {
  tenant_id: string;
  branch_id?: string;
  entity_type?: string;
  actor_id?: string;
  from?: string; // ISO date string
  to?: string;
  page?: number;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditLogModel = (prisma as any).auditLog as {
  create: (args: { data: unknown }) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
};

export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  await auditLogModel.create({
    data: {
      tenant_id:   input.tenant_id,
      branch_id:   input.branch_id ?? null,
      actor_id:    input.actor_id,
      actor_name:  input.actor_name ?? null,
      actor_role:  input.actor_role,
      action:      input.action,
      entity_type: input.entity_type,
      entity_id:   input.entity_id,
      entity_name: input.entity_name,
      metadata:    input.metadata ?? null,
    },
  });
}

export async function listAuditLogs(filter: ListAuditLogsFilter) {
  const page  = Math.max(1, filter.page  ?? 1);
  const limit = Math.min(100, filter.limit ?? 50);
  const skip  = (page - 1) * limit;

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenant_id: filter.tenant_id };
  if (filter.branch_id) where["branch_id"] = filter.branch_id;
  if (filter.entity_type) {
    const types = filter.entity_type.split(",").map((t) => t.trim()).filter(Boolean);
    where["entity_type"] = types.length === 1 ? types[0] : { in: types };
  }
  if (filter.actor_id)    where["actor_id"]    = filter.actor_id;
  if (filter.from || filter.to) {
    where["created_at"] = {
      ...(filter.from ? { gte: new Date(filter.from) } : {}),
      ...(filter.to   ? { lte: new Date(filter.to)   } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    auditLogModel.findMany({ where, orderBy: { created_at: "desc" }, skip, take: limit }),
    auditLogModel.count({ where }),
  ]);

  return { logs, total, page, limit };
}
