/**
 * Login por código de uso único (OTP) por e-mail com Supabase Auth.
 * Usa a API REST do Supabase Auth (GoTrue). No modo de teste, a mesma chamada vai para o simulador local.
 * Tokens ficam em cookies httpOnly; o servidor valida o usuário a cada requisição em /auth/v1/user.
 */
import { cookies } from "next/headers";
import { modes, supabaseConfig } from "./config";
import { db } from "./db";
import { simGoTrue } from "./sim/gotrue";

export const COOKIE_AT = "dl_at";
export const COOKIE_RT = "dl_rt";

export type SessionUser = { id: string; email: string };

async function gotrue(path: string, init: RequestInit = {}): Promise<Response> {
  const m = modes();
  if (m.auth === "simulado") return simGoTrue(path, init);
  if (m.auth !== "supabase") throw new Error("Login não configurado");
  const { url, anonKey } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("content-type", "application/json");
  return fetch(`${url}/auth/v1${path}`, { ...init, headers, cache: "no-store" });
}

export async function sendCode(email: string) {
  // create_user: true — a conta é criada no primeiro acesso
  const r = await gotrue("/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.msg || j.error_description || "Não foi possível enviar o código");
  }
}

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; user: SessionUser };

export async function verifyCode(email: string, token: string): Promise<Tokens> {
  const r = await gotrue("/verify", { method: "POST", body: JSON.stringify({ type: "email", email, token }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Código inválido ou expirado");
  return j as Tokens;
}

export async function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const r = await gotrue("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!r.ok) return null;
  return (await r.json()) as Tokens;
}

export async function revoke(accessToken: string) {
  await gotrue("/logout", { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }).catch(() => {});
}

async function userFromAccessToken(at: string): Promise<SessionUser | null> {
  const r = await gotrue("/user", { headers: { authorization: `Bearer ${at}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id || !u?.email) return null;
  return { id: u.id, email: String(u.email).toLowerCase() };
}

/** Garante a linha da conta no banco (vinculada ao ID do Supabase Auth). */
export async function ensureAccount(user: SessionUser) {
  const sql = await db();
  await sql`insert into contas (user_id, email) values (${user.id}, ${user.email})
    on conflict (user_id) do update set email = excluded.email`;
}

/**
 * Usuário autenticado da requisição atual (validado no servidor), ou null.
 * `refresh: true` só em route handlers/server actions (onde é possível gravar cookies).
 */
export async function currentUser(opts: { refresh?: boolean } = {}): Promise<SessionUser | null> {
  if (!modes().auth) return null;
  const jar = await cookies();
  const at = jar.get(COOKIE_AT)?.value;
  let user = at ? await userFromAccessToken(at) : null;
  if (!user && opts.refresh) {
    const rt = jar.get(COOKIE_RT)?.value;
    const t = rt ? await refreshTokens(rt) : null;
    if (t) {
      setSessionCookies(jar, t);
      user = await userFromAccessToken(t.access_token);
    }
  }
  if (user) await ensureAccount(user);
  return user;
}

type Jar = Awaited<ReturnType<typeof cookies>>;

export function setSessionCookies(jar: Jar, t: Tokens) {
  jar.set(COOKIE_AT, t.access_token, sessionCookieOptions(t.expires_in));
  jar.set(COOKIE_RT, t.refresh_token, sessionCookieOptions(60 * 60 * 24 * 30));
}

export function clearSessionCookies(jar: Jar) {
  jar.set(COOKIE_AT, "", sessionCookieOptions(0));
  jar.set(COOKIE_RT, "", sessionCookieOptions(0));
}

/** Há sessão renovável (token de acesso vencido, mas refresh presente)? */
export async function needsRefresh() {
  const jar = await cookies();
  return Boolean(jar.get(COOKIE_RT)?.value);
}

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
