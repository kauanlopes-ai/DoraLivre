import { accountState, errorResponse, HttpError, requireAccess } from "@/server/account";
import { accountsEnabled, modes } from "@/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = modes();
  const base = { contasAtivas: accountsEnabled(), pagamentosAtivos: Boolean(m.pagamento), modoTeste: m.teste && m.pagamento === "simulado" };
  try {
    const { user, plano, pedidos } = await requireAccess("conta");
    return Response.json({ ...base, conta: await accountState(user, plano, pedidos) });
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 503)) return Response.json({ ...base, conta: null });
    return errorResponse(err);
  }
}
