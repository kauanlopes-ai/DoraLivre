import { cookies } from "next/headers";
import { clearSessionCookies, COOKIE_AT, revoke } from "@/server/auth";
import { errorResponse } from "@/server/account";
import { assertSameOrigin } from "@/server/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const jar = await cookies();
    const at = jar.get(COOKIE_AT)?.value;
    if (at) await revoke(at);
    clearSessionCookies(jar);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
