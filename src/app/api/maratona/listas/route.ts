import { criarLista, errorResponse, excluirLista, HttpError, itemLista, moverLista, renomearLista, requireAccess } from "@/server/account";
import { body } from "@/server/http";

export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireAccess("premium");
    const id = String(b.listaId ?? "");
    switch (b.acao) {
      case "criar":
        return Response.json({ lista: await criarLista(user.id, b.nome) });
      case "renomear":
        await renomearLista(user.id, id, b.nome);
        break;
      case "excluir":
        await excluirLista(user.id, id);
        break;
      case "subir":
      case "descer":
        await moverLista(user.id, id, b.acao === "subir" ? -1 : 1);
        break;
      case "item": {
        const a = b.itemAcao;
        if (a !== "adicionar" && a !== "remover" && a !== "subir" && a !== "descer") throw new HttpError(400, "Ação inválida.");
        await itemLista(user.id, id, String(b.slug ?? ""), a);
        break;
      }
      default:
        throw new HttpError(400, "Ação inválida.");
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
