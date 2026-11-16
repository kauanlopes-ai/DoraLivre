/**
 * Login com Google pelo Supabase Auth (OAuth com PKCE, feito no servidor).
 * 1) /api/auth/google gera o code_verifier (cookie httpOnly) e redireciona para /auth/v1/authorize?provider=google.
 * 2) O Supabase autentica no Google e volta para /api/auth/callback?code=...
 * 3) O servidor troca o código por tokens em /auth/v1/token?grant_type=pkce e grava a sessão em cookies httpOnly.
 * O usuário é validado no servidor a cada requisição em /auth/v1/user. No modo de teste, um simulador local
 * responde aos mesmos endpoints (com uma tela de "conta Google de teste").
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { modes, supabaseConfig } from "./config";
import { db } from "./db";
import { simGoTrue } from "./sim/gotrue";

export const COOKIE_AT = "dl_at";
export const COOKIE_RT = "dl_rt";
export const COOKIE_PKCE = "dl_pkce";

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

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; user: SessionUser };

const b64url = (b: Buffer) => b.toString("base64url");

/** Par PKCE: o verifier fica só no cookie do navegador que iniciou o login. */
export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** URL de autorização do Google via Supabase Auth (ou o simulador, no modo de teste). */
export function googleAuthorizeUrl(redirectTo: string, challenge: string, origin: string) {
  const q = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: "s256",
    prompt: "select_account", // sempre permite escolher a conta Google
  });
  if (modes().auth === "simulado") return `${origin}/teste/google?${q}`;
  return `${supabaseConfig().url}/auth/v1/authorize?${q}`;
}

export async function exchangeCode(authCode: string, verifier: string): Promise<Tokens> {
  const r = await gotrue("/token?grant_type=pkce", {
    method: "POST",
    body: JSON.stringify({ auth_code: authCode, code_verifier: verifier }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token || !j.user?.email) throw new Error(j.msg || j.error_description || "Falha ao concluir o login");
  return { ...j, user: { id: j.user.id, email: String(j.user.email).toLowerCase() } } as Tokens;
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

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
