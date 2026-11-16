import { errorResponse, marcarAvisosLidos, requireAccess } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireAccess("premium");
    const ids = b.ids === "todos" ? "todos" : Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isFinite) : [];
    await marcarAvisosLidos(user.id, ids);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
