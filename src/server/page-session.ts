import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_RT, currentUser } from "./auth";
import { ordersOf, planFromOrders } from "./billing";
import { accountsEnabled } from "./config";

/** Para páginas (server components): sessão validada no servidor; renova cookies quando preciso. */
export async function pageSession(voltar: string, opts: { obrigatorio?: boolean } = {}) {
  if (!accountsEnabled()) return { ativo: false as const };
  const user = await currentUser();
  if (!user) {
    const jar = await cookies();
    if (jar.get(COOKIE_RT)?.value) redirect(`/api/auth/renovar?volta=${encodeURIComponent(voltar)}`);
    if (opts.obrigatorio) redirect(`/entrar?volta=${encodeURIComponent(voltar)}`);
    return { ativo: true as const, user: null };
  }
  const pedidos = await ordersOf(user.id);
  return { ativo: true as const, user, pedidos, plano: planFromOrders(pedidos) };
}
