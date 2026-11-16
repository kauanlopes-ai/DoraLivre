/**
 * Simulador local da API do Supabase Auth (GoTrue) — SOMENTE modo de teste.
 * Implementa os mesmos endpoints usados em produção: /otp, /verify, /user, /token, /logout.
 * O código de uso único vai para a caixa de entrada de teste (tabela sim_emails).
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

  if (p === "/otp") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ msg: "E-mail inválido" }, 400);
    await sql`insert into sim_auth_usuarios (id, email) values (${crypto.randomUUID()}, ${email}) on conflict (email) do nothing`;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await sql`
      insert into sim_auth_codigos (email, codigo_hash, expira_em, tentativas)
      values (${email}, ${sha(code)}, ${new Date(Date.now() + 10 * 60_000)}, 0)
      on conflict (email) do update set codigo_hash = excluded.codigo_hash, expira_em = excluded.expira_em, tentativas = 0`;
    await sql`insert into sim_emails (para, assunto, corpo) values (${email}, 'Seu código de acesso ao DoraLivre',
      ${`Use o código ${code} para entrar no DoraLivre. Ele vale por 10 minutos.`})`;
    return json({});
  }

  if (p === "/verify") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "").trim();
    const [c] = await sql`select * from sim_auth_codigos where email = ${email}`;
    if (!c || new Date(c.expira_em) < new Date() || c.tentativas >= 5) return json({ msg: "Código expirado ou inválido" }, 403);
    if (c.codigo_hash !== sha(token)) {
      await sql`update sim_auth_codigos set tentativas = tentativas + 1 where email = ${email}`;
      return json({ msg: "Código expirado ou inválido" }, 403);
    }
    await sql`delete from sim_auth_codigos where email = ${email}`;
    const [u] = await sql`select id, email from sim_auth_usuarios where email = ${email}`;
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
