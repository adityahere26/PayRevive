// Password hashing utility (bcrypt algorithm via bcryptjs — a pure-JS implementation, used
// instead of the native `bcrypt` package so the project has no native build step; the
// hashing algorithm and security properties are the same). Not exercised by the Day 2
// foundation (only POST /api/auth/demo exists, and the demo merchant has no password), but
// implemented now since real merchant registration/login will need it and SECURITY.md
// specifies bcrypt-hashed passwords.

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainTextPassword, passwordHash) {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
