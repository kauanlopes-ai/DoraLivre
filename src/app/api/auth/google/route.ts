import { cookies } from "next/headers";
import { COOKIE_PKCE, googleAuthorizeUrl, pkcePair } from "@/server/auth";
import { accountsEnabled, modes, siteUrl } from "@/server/config";
import { originOf } from "@/server/http";
import { safeVolta } from "@/server/volta";

/** Inicia o login com Google (Supabase Auth, PKCE). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const volta = safeVolta(url.searchParams.get("volta"));
  if (!accountsEnabled()) return Response.redirect(new URL("/entrar", url.origin), 303);
  const origin = originOf(req);
  // Em produção, o retorno é sempre o domínio oficial cadastrado no Supabase (SITE_URL)
  const site = modes().auth === "simulado" ? origin : siteUrl(origin);
  const { verifier, challenge } = pkcePair();
  const jar = await cookies();
  jar.set(COOKIE_PKCE, Buffer.from(JSON.stringify({ v: verifier, volta })).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return Response.redirect(googleAuthorizeUrl(`${site}/api/auth/callback`, challenge, origin), 303);
}
