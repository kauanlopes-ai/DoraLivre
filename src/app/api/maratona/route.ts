import { errorResponse, maratonaData, requireAccess } from "@/server/account";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requireAccess("premium");
    return Response.json(await maratonaData(user.id));
  } catch (err) {
    return errorResponse(err);
  }
}
