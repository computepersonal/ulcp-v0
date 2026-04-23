import { prisma } from "../lib/prisma";

export async function findAttendance(
  tenant_id: string,
  filters: { user_id?: string; date_from?: Date; date_to?: Date; status?: string }
) {
  return prisma.attendance.findMany({
    where: {
      tenant_id,
      ...(filters.user_id ? { user_id: filters.user_id } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.date_from || filters.date_to
        ? {
            date: {
              ...(filters.date_from ? { gte: filters.date_from } : {}),
              ...(filters.date_to ? { lte: filters.date_to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
  });
}

export async function findAttendanceByUserDate(user_id: string, date: Date) {
  return prisma.attendance.findUnique({
    where: { user_id_date: { user_id, date } },
  });
}

export async function upsertAttendance(
  user_id: string,
  date: Date,
  data: {
    tenant_id: string;
    branch_id?: string;
    clock_in?: Date;
    clock_out?: Date;
    clock_in_method?: string;
    clock_out_method?: string;
    hours_worked?: number;
    overtime_mins?: number;
    late_by_mins?: number;
    status?: string;
    notes?: string;
  }
) {
  return prisma.attendance.upsert({
    where: { user_id_date: { user_id, date } },
    create: { user_id, date, ...data },
    update: data,
  });
}

export async function getAttendanceSummary(
  tenant_id: string,
  user_id: string,
  year: number,
  month: number
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const records = await prisma.attendance.findMany({
    where: {
      tenant_id,
      user_id,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: "asc" },
  });

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const halfDay = records.filter((r) => r.status === "half_day").length;
  const onLeave = records.filter((r) => r.status === "on_leave").length;
  const totalHours = records.reduce((sum, r) => sum + (r.hours_worked ?? 0), 0);
  const totalOvertime = records.reduce((sum, r) => sum + r.overtime_mins, 0);
  const totalLate = records.reduce((sum, r) => sum + r.late_by_mins, 0);

  return {
    year,
    month,
    records,
    summary: { present, absent, halfDay, onLeave, totalHours, totalOvertime, totalLate },
  };
}
