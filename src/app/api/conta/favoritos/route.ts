import { errorResponse, requireAccess, setFavorito } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireAccess("basico");
    await setFavorito(user.id, String(b.slug ?? ""), b.on !== false);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
