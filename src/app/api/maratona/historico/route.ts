import { errorResponse, registrarAbertura, requireAccess } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireAccess("premium");
    await registrarAbertura(user.id, String(b.youtubeId ?? ""));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
