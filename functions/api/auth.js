import {
  AuthError,
  createSession,
  deleteSession,
  ensureAuthSchema,
  getSessionUser,
  hashPassword,
  json,
  publicUser,
  requireUser,
  userCount,
  verifyPassword
} from "../_shared/auth.js";

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function cleanDisplayName(value, fallback) {
  return String(value || fallback || "").trim().slice(0, 60);
}

async function createUser(db, body, role) {
  const username = cleanUsername(body.username);
  const displayName = cleanDisplayName(body.displayName, username);
  const password = String(body.password || "");
  if (username.length < 3 || password.length < 6) {
    throw new AuthError("아이디는 3자 이상, 비밀번호는 6자 이상이어야 합니다.", 400);
  }

  const passwordResult = await hashPassword(password);
  const result = await db.prepare(`
    INSERT INTO users (username, display_name, password_hash, password_salt, role)
    VALUES (?, ?, ?, ?, ?)
  `).bind(username, displayName, passwordResult.hash, passwordResult.salt, role).run();

  return {
    id: result.meta.last_row_id,
    username,
    displayName,
    role,
    active: true
  };
}

async function listUsers(db) {
  const rows = await db.prepare(`
    SELECT id, username, display_name, role, active
    FROM users
    ORDER BY role, username
  `).all();
  return (rows.results || []).map(publicUser);
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Cloudflare D1 binding DB is not configured." }, 500);

  try {
    await ensureAuthSchema(env.DB);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const action = url.searchParams.get("action") || "";

    if (method === "GET" && action === "users") {
      await requireUser(env.DB, request, ["admin"]);
      return json({ users: await listUsers(env.DB) });
    }

    if (method === "GET") {
      const setupRequired = (await userCount(env.DB)) === 0;
      const user = setupRequired ? null : await getSessionUser(env.DB, request);
      return json({ setupRequired, user });
    }

    const body = await request.json().catch(() => ({}));

    if (method === "POST" && action === "setup") {
      if ((await userCount(env.DB)) > 0) throw new AuthError("이미 관리자가 생성되어 있습니다.", 409);
      const user = await createUser(env.DB, body, "admin");
      const session = await createSession(env.DB, user.id);
      return json({ ok: true, user, ...session });
    }

    if (method === "POST" && action === "login") {
      const username = cleanUsername(body.username);
      const row = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND active = 1")
        .bind(username)
        .first();
      if (!row || !(await verifyPassword(String(body.password || ""), row.password_salt, row.password_hash))) {
        throw new AuthError("아이디 또는 비밀번호가 맞지 않습니다.", 401);
      }
      const session = await createSession(env.DB, row.id);
      return json({ ok: true, user: publicUser(row), ...session });
    }

    if (method === "POST" && action === "logout") {
      await deleteSession(env.DB, request);
      return json({ ok: true });
    }

    if (method === "POST" && action === "create-user") {
      await requireUser(env.DB, request, ["admin"]);
      const role = body.role === "admin" ? "admin" : "staff";
      const user = await createUser(env.DB, body, role);
      return json({ ok: true, user, users: await listUsers(env.DB) });
    }

    if (method === "POST" && action === "set-active") {
      await requireUser(env.DB, request, ["admin"]);
      const id = Number(body.id);
      const active = body.active ? 1 : 0;
      await env.DB.prepare("UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(active, id)
        .run();
      return json({ ok: true, users: await listUsers(env.DB) });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error.message || "Auth error" }, 500);
  }
}
