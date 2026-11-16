import { currentUser } from "@/server/auth";

/** Renova a sessão (cookies) e volta para a página interna pedida. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const volta = url.searchParams.get("volta") ?? "/conta";
  const destino = volta.startsWith("/") && !volta.startsWith("//") ? volta : "/conta";
  const user = await currentUser({ refresh: true }).catch(() => null);
  const target = new URL(user ? destino : `/entrar?volta=${encodeURIComponent(destino)}`, url.origin);
  if (!user) target.searchParams.set("sessao", "expirada");
  return Response.redirect(target, 303);
}
