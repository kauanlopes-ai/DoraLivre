import { modes } from "@/server/config";
import { originOf } from "@/server/http";
import { simGoogleAuthorize } from "@/server/sim/gotrue";

/** Modo de teste: conclui a tela de "Google" e volta para o callback com ?code= (ou ?error=). */
export async function POST(req: Request) {
  if (modes().auth !== "simulado") return new Response("Not found", { status: 404 });
  const form = await req.formData();
  const origin = originOf(req);
  const destino = new URL(String(form.get("redirect_to") ?? ""), origin);
  if (destino.origin !== origin || destino.pathname !== "/api/auth/callback") return new Response("redirect_to inválido", { status: 400 });
  if (form.get("acao") === "cancelar") return Response.redirect(`${destino.origin}${destino.pathname}?error=access_denied`, 303);
  try {
    const code = await simGoogleAuthorize(String(form.get("email") ?? ""), String(form.get("code_challenge") ?? ""));
    return Response.redirect(`${destino.origin}${destino.pathname}?code=${encodeURIComponent(code)}`, 303);
  } catch (err) {
    return new Response(String(err instanceof Error ? err.message : err), { status: 400 });
  }
}
