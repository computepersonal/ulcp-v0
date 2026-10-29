import { randomUUID } from "crypto";
import { NotFoundError } from "@ulcp/shared";
import {
  createTable,
  findTablesByBranch,
  findTableById,
  updateTable,
  deleteTable,
} from "../repositories/table.repository";
import { findBranchById } from "../repositories/branch.repository";
import { findTenantById } from "../repositories/tenant.repository";
import { generateQrCode } from "./tenant.service";

export type CreateTableInput = {
  name: string;
  capacity?: number;
  position?: number;
  section_id?: string;
};

export type UpdateTableInput = Omit<Partial<CreateTableInput>, "section_id"> & {
  is_active?: boolean;
  section_id?: string | null; // null = remove from section
};

// The QR opens the customer app at this place and table (see customerPlaceUrl)
async function generateTableQr(tenant_id: string, table_id: string): Promise<string> {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return generateQrCode(tenant.slug, undefined, table_id);
}

export async function createTableForBranch(
  tenant_id: string,
  branch_id: string,
  input: CreateTableInput
) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");

  // Reserve a placeholder id-like value; Prisma will assign the real cuid.
  // We create first with a temp qr_code, then update with the real table id.
  const table = await createTable({
    name: input.name,
    capacity: input.capacity ?? 2,
    position: input.position ?? 0,
    qr_code: `__pending__:${randomUUID()}`, // unique temp — replaced immediately below
    tenant_id,
    branch: { connect: { id: branch_id } },
    ...(input.section_id ? { section: { connect: { id: input.section_id } } } : {}),
  });

  const qr_code = await generateTableQr(tenant_id, table.id);
  return updateTable(table.id, { qr_code });
}

export async function getTablesForBranch(tenant_id: string, branch_id: string) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");
  return findTablesByBranch(tenant_id, branch_id);
}

export async function updateTableById(
  tenant_id: string,
  branch_id: string,
  id: string,
  data: UpdateTableInput
) {
  const table = await findTableById(id, tenant_id);
  if (!table || table.branch_id !== branch_id) throw new NotFoundError("Table not found");

  const { section_id, ...rest } = data;
  const prismaData = {
    ...rest,
    ...(section_id === null
      ? { section: { disconnect: true } }
      : section_id !== undefined
        ? { section: { connect: { id: section_id } } }
        : {}),
  };
  return updateTable(id, prismaData);
}

export async function deleteTableById(
  tenant_id: string,
  branch_id: string,
  id: string
) {
  const table = await findTableById(id, tenant_id);
  if (!table || table.branch_id !== branch_id) throw new NotFoundError("Table not found");
  return deleteTable(id);
}
