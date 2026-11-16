import type { Metadata } from "next";
import ContaView from "@/components/ContaView";
import PageShell from "@/components/PageShell";
import { getCatalog } from "@/lib/catalog";
import { accountState } from "@/server/account";
import { modes } from "@/server/config";
import { pageSession } from "@/server/page-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta — DoraLivre" };

export default async function ContaPage() {
  const s = await pageSession("/conta", { obrigatorio: true });
  if (!s.ativo || !s.user)
    return (
      <PageShell className="narrow">
        <h1>Minha conta</h1>
        <p className="lead">As contas ainda não estão ativas neste ambiente.</p>
      </PageShell>
    );
  const estado = await accountState(s.user, s.plano, s.pedidos);
  return (
    <PageShell>
      <ContaView estado={estado} series={getCatalog().series} pagamentos={Boolean(modes().pagamento)} />
    </PageShell>
  );
}
