import { cookies } from "next/headers";
import { ensureAccount, setSessionCookies, verifyCode } from "@/server/auth";
import { accountsEnabled } from "@/server/config";
import { errorResponse, HttpError } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!accountsEnabled()) throw new HttpError(503, "Contas ainda não configuradas neste ambiente.");
    const b = await body(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const codigo = String(b.codigo ?? "").replace(/\D/g, "");
    if (!email || codigo.length < 6) throw new HttpError(400, "Informe o código de 6 dígitos.");
    let t;
    try {
      t = await verifyCode(email, codigo);
    } catch {
      throw new HttpError(401, "Código inválido ou expirado. Peça um novo código.");
    }
    setSessionCookies(await cookies(), t);
    await ensureAccount({ id: t.user.id, email: String(t.user.email).toLowerCase() });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
