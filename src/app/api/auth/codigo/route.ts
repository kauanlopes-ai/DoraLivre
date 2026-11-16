import { sendCode } from "@/server/auth";
import { accountsEnabled } from "@/server/config";
import { errorResponse, HttpError } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!accountsEnabled()) throw new HttpError(503, "Contas ainda não configuradas neste ambiente.");
    const { email } = await body(req);
    const e = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 200) throw new HttpError(400, "Informe um e-mail válido.");
    await sendCode(e);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && !(err instanceof HttpError)) return Response.json({ erro: err.message }, { status: 400 });
    return errorResponse(err);
  }
}
