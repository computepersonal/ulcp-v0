import { prisma } from "../lib/prisma";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10); // "2026-03-28"
}

/**
 * Atomically increment and return the next order sequence number for a branch.
 * Returns formatted string e.g. "ORD-001".
 * Resets naturally — each calendar day gets a new row.
 */
export async function nextOrderNumber(branch_id: string): Promise<string> {
  const date = todayDate();
  const counter = await prisma.dailyCounter.upsert({
    where: { branch_id_date: { branch_id, date } },
    update: { order_seq: { increment: 1 } },
    create: { branch_id, date, order_seq: 1, kot_seq: 0 },
  });
  return `ORD-${String(counter.order_seq).padStart(3, "0")}`;
}

/**
 * Atomically increment and return the next KOT sequence number for a branch.
 * Returns formatted string e.g. "KOT-001".
 */
export async function nextKotNumber(branch_id: string): Promise<string> {
  const date = todayDate();
  const counter = await prisma.dailyCounter.upsert({
    where: { branch_id_date: { branch_id, date } },
    update: { kot_seq: { increment: 1 } },
    create: { branch_id, date, order_seq: 0, kot_seq: 1 },
  });
  return `KOT-${String(counter.kot_seq).padStart(3, "0")}`;
}
