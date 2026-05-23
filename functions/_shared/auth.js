export class AuthError extends Error {
  constructor(message = "Authentication required.", status = 401) {
    super(message);
    this.status = status;
  }
}

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export async function ensureAuthSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();
}

export async function userCount(db) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users").first();
  return Number(row?.count || 0);
}

function randomHex(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt = randomHex(16)) {
  return {
    salt,
    hash: await sha256Hex(`${salt}:${password}`)
  };
}

export async function verifyPassword(password, salt, hash) {
  const result = await hashPassword(password, salt);
  return result.hash === hash;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: Number(row.active) === 1
  };
}

export function tokenFromRequest(request) {
  const header = request.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

export async function createSession(db, userId) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function getSessionUser(db, request) {
  const token = tokenFromRequest(request);
  if (!token) return null;

  const row = await db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.active, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).bind(token).first();

  if (!row) return null;
  if (Number(row.active) !== 1 || new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return publicUser(row);
}

export async function requireUser(db, request, roles = []) {
  await ensureAuthSchema(db);
  if ((await userCount(db)) === 0) {
    return { id: 0, username: "setup", displayName: "Setup", role: "admin", active: true };
  }

  const user = await getSessionUser(db, request);
  if (!user) throw new AuthError("로그인이 필요합니다.", 401);
  if (roles.length && !roles.includes(user.role)) {
    throw new AuthError("관리자 권한이 필요합니다.", 403);
  }
  return user;
}

export async function deleteSession(db, request) {
  const token = tokenFromRequest(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}
