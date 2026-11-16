import { HttpError } from "./account";

/** Bloqueia POST de outros sites (além do SameSite=Lax dos cookies). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new HttpError(403, "Origem não permitida.");
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  assertSameOrigin(req);
  try {
    const j = await req.json();
    return j && typeof j === "object" ? j : {};
  } catch {
    throw new HttpError(400, "Corpo inválido.");
  }
}

export function originOf(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
