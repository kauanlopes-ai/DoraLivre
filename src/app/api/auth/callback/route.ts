import { cookies } from "next/headers";
import { COOKIE_PKCE, ensureAccount, exchangeCode, setSessionCookies } from "@/server/auth";
import { safeVolta } from "@/server/volta";

/** Retorno do Google via Supabase Auth: troca o código (PKCE) por sessão e volta para a página de origem. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get(COOKIE_PKCE)?.value;
  jar.delete(COOKIE_PKCE);
  let pkce: { v?: string; volta?: string } = {};
  try {
    pkce = raw ? JSON.parse(Buffer.from(raw, "base64url").toString()) : {};
  } catch {
    pkce = {};
  }
  const volta = safeVolta(pkce.volta);
  const falha = (motivo: string) =>
    Response.redirect(new URL(`/entrar?erro=${motivo}&volta=${encodeURIComponent(volta)}`, url.origin), 303);

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return falha(url.searchParams.get("error") === "access_denied" ? "cancelado" : "google");
  if (!pkce.v) return falha("sessao"); // login iniciado em outro navegador ou expirado
  try {
    const t = await exchangeCode(code, pkce.v);
    setSessionCookies(jar, t);
    await ensureAccount(t.user);
  } catch (err) {
    console.error("login Google:", err);
    return falha("google");
  }
  return Response.redirect(new URL(volta, url.origin), 303);
}
