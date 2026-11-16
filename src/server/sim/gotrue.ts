/**
 * Simulador local da API do Supabase Auth (GoTrue) — SOMENTE modo de teste.
 * Implementa os endpoints usados em produção: /token (pkce e refresh_token), /user e /logout.
 * O "Google" é a tela /teste/google, que gera o código de autorização ligado ao code_challenge.
 */
import crypto from "node:crypto";
import { db } from "../db";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function issueTokens(userId: string, email: string) {
  const sql = await db();
  const access = crypto.randomBytes(32).toString("base64url");
  const refresh = crypto.randomBytes(32).toString("base64url");
  await sql`insert into sim_auth_tokens ${sql([
    { token_hash: sha(access), user_id: userId, tipo: "access", expira_em: new Date(Date.now() + 3600_000) },
    { token_hash: sha(refresh), user_id: userId, tipo: "refresh", expira_em: new Date(Date.now() + 30 * 86400_000) },
  ])}`;
  return { access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: 3600, user: { id: userId, email } };
}

async function userFromToken(token: string, tipo: "access" | "refresh") {
  const sql = await db();
  const [row] = await sql`
    select u.id, u.email from sim_auth_tokens t join sim_auth_usuarios u on u.id = t.user_id
    where t.token_hash = ${sha(token)} and t.tipo = ${tipo} and not t.revogado and t.expira_em > now()`;
  return row as { id: string; email: string } | undefined;
}

export async function simGoTrue(pathname: string, init: RequestInit): Promise<Response> {
  const sql = await db();
  const body = init.body ? JSON.parse(String(init.body)) : {};
  const auth = new Headers(init.headers).get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [p, query] = pathname.split("?");

  if (p === "/token" && query?.includes("grant_type=pkce")) {
    const code = String(body.auth_code ?? "");
    const verifier = String(body.code_verifier ?? "");
    const [c] = await sql`delete from sim_auth_pkce where codigo = ${code} and expira_em > now() returning user_id, desafio`;
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    if (!c || c.desafio !== challenge) return json({ msg: "invalid flow state, no valid flow state found" }, 400);
    const [u] = await sql`select id, email from sim_auth_usuarios where id = ${c.user_id}`;
    return json(await issueTokens(u.id, u.email));
  }

  if (p === "/user") {
    const u = auth ? await userFromToken(auth, "access") : undefined;
    return u ? json({ id: u.id, email: u.email }) : json({ msg: "invalid JWT" }, 401);
  }

  if (p === "/token" && query?.includes("grant_type=refresh_token")) {
    const rt = String(body.refresh_token ?? "");
    const u = rt ? await userFromToken(rt, "refresh") : undefined;
    if (!u) return json({ msg: "Invalid Refresh Token" }, 400);
    await sql`update sim_auth_tokens set revogado = true where token_hash = ${sha(rt)}`;
    return json(await issueTokens(u.id, u.email));
  }

  if (p === "/logout") {
    if (auth) {
      const u = await userFromToken(auth, "access");
      if (u) await sql`update sim_auth_tokens set revogado = true where user_id = ${u.id}`;
    }
    return new Response(null, { status: 204 });
  }

  return json({ msg: "not found" }, 404);
}

/** Tela de teste do "Google": cria/acha o usuário e devolve um código de autorização PKCE. */
export async function simGoogleAuthorize(email: string, challenge: string) {
  const sql = await db();
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("E-mail inválido");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error("code_challenge inválido");
  await sql`insert into sim_auth_usuarios (id, email) values (${crypto.randomUUID()}, ${e}) on conflict (email) do nothing`;
  const [u] = await sql`select id from sim_auth_usuarios where email = ${e}`;
  const codigo = crypto.randomUUID();
  await sql`insert into sim_auth_pkce (codigo, user_id, desafio, expira_em) values (${codigo}, ${u.id}, ${challenge}, ${new Date(Date.now() + 5 * 60_000)})`;
  return codigo;
}
