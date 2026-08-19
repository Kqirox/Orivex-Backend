// ── Enums ──────────────────────────────────────────────────

export enum UserRole {
  ADMIN = 'admin',
  LEARNER = 'learner',
  INSTRUCTOR = 'instructor',
}

// ── Core models ────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  role: string;
  walletAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface PublicUserInfo {
  id: string;
  username: string;
  role: string;
  createdAt: Date;
}

// ── Request types ──────────────────────────────────────────

export interface UpdateUserData {
  username?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}
