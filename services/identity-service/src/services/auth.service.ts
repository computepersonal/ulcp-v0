import bcrypt from "bcrypt";
import {
  AuthError,
  ConflictError,
  NotFoundError,
  StaffJwtPayload,
  ROLES,
} from "@ulcp/shared";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByIdOnly,
  findPendingUserByEmail,
  findAllUsersByEmail,
  updateUserTenant,
} from "../repositories/user.repository";
import {
  storeRefreshToken,
  findAndDeleteRefreshToken,
  deleteAllUserRefreshTokens,
} from "../repositories/token.repository";
import {
  signStaffAccessToken,
  signStaffRefreshToken,
  verifyStaffRefreshToken,
} from "../lib/jwt";
import { redis } from "../lib/redis";
import type { User } from "../generated/prisma";

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  mobile?: string;
  tenant_id?: string;   // optional — owner registers before tenant exists
  role?: string;        // defaults to pending_onboarding
  permissions?: string[];
}

export interface LoginInput {
  email: string;
  password: string;
  tenant_id?: string;   // optional — pending users have no tenant yet
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, "password_hash" | "pin_hash">;
}

export async function register(input: RegisterInput): Promise<AuthTokens> {
  const role = input.role ?? ROLES.PENDING_ONBOARDING;

  if (input.tenant_id) {
    // Registering as a staff/partner into an existing tenant
    const existing = await findUserByEmail(input.email, input.tenant_id);
    if (existing) {
      throw new ConflictError("A user with this email already exists in this business");
    }
  } else {
    // Registering as a new owner — no tenant yet
    // PostgreSQL allows multiple (email, NULL) rows, so we check here
    const existingPending = await findPendingUserByEmail(input.email);
    if (existingPending) {
      throw new ConflictError("An account with this email is already pending onboarding");
    }
  }

  const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await createUser({
    email: input.email,
    name: input.name,
    mobile: input.mobile,
    tenant_id: input.tenant_id,
    role,
    permissions: input.permissions ?? [],
    password_hash,
  });

  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthTokens> {
  let user: User | null = null;

  if (input.tenant_id) {
    user = await findUserByEmail(input.email, input.tenant_id);
  } else {
    // No tenant_id provided — look for a pending_onboarding user
    user = await findPendingUserByEmail(input.email);
  }

  if (!user) {
    // No tenant_id provided and no pending user found.
    if (!input.tenant_id) {
      const allUsers = await findAllUsersByEmail(input.email);
      if (allUsers.length > 0) {
        // Verify password against first match
        const valid = await bcrypt.compare(input.password, allUsers[0]!.password_hash);
        if (!valid) throw new AuthError("Invalid email or password");

        if (allUsers.length === 1) {
          // Only one business — log in directly
          return issueTokens(allUsers[0]!);
        }

        // Multiple businesses — return list so frontend can show a picker
        // We throw a special error that the route handler will catch and format
        const tenantChoices = allUsers.map((u) => ({
          tenant_id: u.tenant_id!,
          role: u.role,
          name: u.name,
        }));
        const err = new Error("TENANT_SELECTION_REQUIRED") as Error & { tenants: typeof tenantChoices };
        err.tenants = tenantChoices;
        throw err;
      }
    }
    throw new AuthError("Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new AuthError("Invalid email or password");
  }

  return issueTokens(user);
}

export async function refresh(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  let userId: string;
  try {
    const payload = verifyStaffRefreshToken(refreshToken);
    userId = payload.user_id;
  } catch {
    throw new AuthError("Invalid refresh token");
  }

  const storedUserId = await findAndDeleteRefreshToken(refreshToken);
  if (!storedUserId || storedUserId !== userId) {
    throw new AuthError("Refresh token not found or expired");
  }

  const user = await findUserByIdOnly(userId);
  if (!user) throw new AuthError("User not found");

  const newAccessToken = signStaffAccessToken(buildPayload(user));
  const newRefreshToken = signStaffRefreshToken(userId);
  await storeRefreshToken(userId, newRefreshToken);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(
  userId: string,
  refreshToken?: string
): Promise<void> {
  if (refreshToken) {
    await findAndDeleteRefreshToken(refreshToken);
  } else {
    await deleteAllUserRefreshTokens(userId);
  }
}

export async function getMe(
  userId: string,
  tenantId: string | null
): Promise<Omit<User, "password_hash" | "pin_hash">> {
  const user = tenantId
    ? await findUserById(userId, tenantId)
    : await findUserByIdOnly(userId);
  if (!user) throw new NotFoundError("User not found");
  const { password_hash, pin_hash, ...safe } = user;
  return safe;
}

export async function assignTenant(
  userId: string,
  tenant_id: string,
  role: string
): Promise<Omit<User, "password_hash" | "pin_hash">> {
  const user = await findUserByIdOnly(userId);
  if (!user) throw new NotFoundError("User not found");
  if (user.tenant_id) {
    throw new ConflictError("User already belongs to a tenant");
  }
  const updated = await updateUserTenant(userId, tenant_id, role);
  const { password_hash, pin_hash, ...safe } = updated;
  return safe;
}

export async function blacklistToken(
  jti: string,
  ttlSeconds: number
): Promise<void> {
  await redis.set(`jwt:blacklist:${jti}`, "1", "EX", ttlSeconds);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const result = await redis.exists(`jwt:blacklist:${jti}`);
  return result === 1;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPayload(user: User): Omit<StaffJwtPayload, "iat" | "exp"> {
  return {
    user_id: user.id,
    name: user.name ?? undefined,
    tenant_id: user.tenant_id,   // string | null
    role: user.role as StaffJwtPayload["role"],
    permissions: user.permissions as StaffJwtPayload["permissions"],
    branch_id: user.branch_id ?? undefined,
    is_partner: user.is_partner,
  };
}

async function issueTokens(user: User): Promise<AuthTokens> {
  const accessToken = signStaffAccessToken(buildPayload(user));
  const refreshToken = signStaffRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  const { password_hash, pin_hash, ...safeUser } = user;
  return { accessToken, refreshToken, user: safeUser };
}
