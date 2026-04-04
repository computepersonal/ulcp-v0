import { AppError } from "@ulcp/shared";
import { prisma } from "../lib/prisma";
import {
  createTableSession,
  findActiveSessionByTable,
  findSessionById,
  updateSessionStatus,
} from "../repositories/session.repository";

// Business types that require staff confirmation before table is "open"
const CONFIRMATION_REQUIRED_TYPES = [
  "seated_food_only",
  "seated_full_service",
  "restaurant_plus_delivery",
];

// Business types that auto-confirm (customer self-orders)
const AUTO_CONFIRM_TYPES = [
  "seated_self_order",
  "self_service_cafe",
];

export async function openTableSession(input: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  customer_id?: string;
  customer_phone?: string;
  customer_name?: string;
  pax?: number;
}) {
  // Verify table belongs to tenant/branch
  const table = await prisma.table.findFirst({
    where: { id: input.table_id, tenant_id: input.tenant_id, branch_id: input.branch_id, is_active: true },
    include: { branch: { include: { tenant: true } } },
  });
  if (!table) throw new AppError("Table not found", 404);

  // Check no active session already exists
  const existing = await findActiveSessionByTable(input.table_id);
  if (existing) {
    // If already open, just return the existing session (idempotent)
    if (existing.status === "open") return { session: existing, table, isNew: false };
    // If pending_confirmation, return it — customer already waiting
    return { session: existing, table, isNew: false };
  }

  const businessType = table.branch.tenant.business_type;
  const needsConfirmation = CONFIRMATION_REQUIRED_TYPES.includes(businessType);
  const autoConfirm = AUTO_CONFIRM_TYPES.includes(businessType);

  let status = "pending_confirmation";
  let confirmed_at: Date | undefined;

  if (autoConfirm || !needsConfirmation) {
    status = "open";
    confirmed_at = new Date();
  }

  const session = await createTableSession({
    ...input,
    status,
    confirmed_at,
    confirmed_by: autoConfirm ? "auto" : undefined,
  });

  // Update table status
  await prisma.table.update({
    where: { id: input.table_id },
    data: { status },
  });

  return { session, table, isNew: true };
}

export async function confirmTableSession(
  session_id: string,
  tenant_id: string,
  staff_user_id: string
) {
  const session = await findSessionById(session_id, tenant_id);
  if (!session) throw new AppError("Session not found", 404);
  if (session.status !== "pending_confirmation") {
    throw new AppError(`Session is already ${session.status}`, 400);
  }

  const updated = await updateSessionStatus(session_id, "open", {
    confirmed_at: new Date(),
    confirmed_by: staff_user_id,
  });

  await prisma.table.update({
    where: { id: session.table_id },
    data: { status: "occupied" },
  });

  return updated;
}

export async function closeTableSession(
  session_id: string,
  tenant_id: string,
  staff_user_id: string
) {
  const session = await findSessionById(session_id, tenant_id);
  if (!session) throw new AppError("Session not found", 404);
  if (session.status === "closed") throw new AppError("Session already closed", 400);

  const updated = await updateSessionStatus(session_id, "closed", {
    closed_at: new Date(),
  });

  await prisma.table.update({
    where: { id: session.table_id },
    data: { status: "available" },
  });

  return updated;
}

export async function billTableSession(session_id: string, tenant_id: string) {
  const session = await findSessionById(session_id, tenant_id);
  if (!session) throw new AppError("Session not found", 404);

  const updated = await updateSessionStatus(session_id, "billed");
  await prisma.table.update({
    where: { id: session.table_id },
    data: { status: "billed" },
  });
  return updated;
}
