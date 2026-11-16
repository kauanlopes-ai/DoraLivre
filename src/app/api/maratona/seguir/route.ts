import { errorResponse, requireAccess, setSeguindo } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireAccess("premium");
    await setSeguindo(user.id, String(b.slug ?? ""), b.on !== false);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
