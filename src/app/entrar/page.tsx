import Link from "next/link";
import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";
import LogoutButton from "@/components/LogoutButton";
import PageShell from "@/components/PageShell";
import { brl, PRODUTOS } from "@/lib/products";
import { orderById } from "@/server/billing";
import { modes } from "@/server/config";
import { pageSession } from "@/server/page-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar — DoraLivre" };

const PLANO_NOME = { nenhum: "Nenhum plano ativo", basico: "DoraLivre Básico", premium: "DoraLivre Premium" } as const;

function safeVolta(v: string | undefined, fallback: string) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

/**
 * URL de entrega (/entrar). Quem abrir o link entra com o PRÓPRIO e-mail e vê o plano da PRÓPRIA conta.
 * O ?pedido= só mostra detalhes para o dono do pedido; para outra conta, nada é revelado nem transferido.
 */
export default async function EntrarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const pedidoId = sp.pedido;
  const aqui = pedidoId ? `/entrar?pedido=${encodeURIComponent(pedidoId)}` : "/entrar";
  const s = await pageSession(aqui);

  if (!s.ativo)
    return (
      <PageShell className="narrow">
        <h1>Entrar</h1>
        <p className="lead">As contas ainda não estão ativas neste ambiente. O catálogo e o player continuam livres.</p>
        <Link className="btn btn-primary" href="/">
          Ir para o catálogo
        </Link>
      </PageShell>
    );

  if (!s.user)
    return (
      <PageShell className="narrow">
        <div className="auth-card">
          <p className="eyebrow">{pedidoId ? "Acesso à sua compra" : "Minha conta"}</p>
          <h1>{pedidoId ? "Entre para acessar sua compra" : "Entrar no DoraLivre"}</h1>
          <p className="lead">
            {pedidoId
              ? "Use o e-mail da conta que fez a compra. O plano é liberado na conta autenticada, não no link."
              : "Acesse favoritos, episódios assistidos e a sua maratona em qualquer dispositivo."}
          </p>
          {sp.sessao === "expirada" && <p className="nudge">Sua sessão expirou. Entre novamente.</p>}
          <LoginForm volta={safeVolta(sp.volta, aqui)} teste={modes().auth === "simulado"} />
        </div>
      </PageShell>
    );

  const pedido = pedidoId ? await orderById(pedidoId) : null;
  const doUsuario = pedido && pedido.user_id === s.user.id;

  return (
    <PageShell className="narrow">
      <div className="auth-card">
        <p className="eyebrow">Conectado como {s.user.email}</p>
        <h1>{PLANO_NOME[s.plano]}</h1>

        {pedidoId && !doUsuario && (
          <div className="status-box status-warn" role="alert" data-testid="pedido-outra-conta">
            <strong>Este link de compra não pertence a esta conta.</strong>
            <p>
              O plano é liberado somente na conta que fez o pagamento. Se a compra foi sua, saia e entre com o e-mail
              usado nela. Abaixo está o plano da conta conectada agora.
            </p>
            <LogoutButton label="Sair e entrar com outro e-mail" volta={aqui} />
          </div>
        )}

        {pedido && doUsuario && <PedidoStatus status={pedido.status} produto={pedido.produto} centavos={pedido.valor_centavos} />}

        <p className="lead">
          {s.plano === "premium"
            ? "Favoritos, episódios assistidos e a área Minha maratona estão liberados."
            : s.plano === "basico"
              ? "Favoritos e episódios assistidos estão liberados."
              : "Esta conta ainda não tem plano. O catálogo e o player continuam livres."}
        </p>
        <div className="row-actions">
          {s.plano === "premium" && (
            <Link className="btn btn-primary" href="/minha-maratona">
              Abrir Minha maratona
            </Link>
          )}
          <Link className={`btn ${s.plano === "premium" ? "btn-ghost" : "btn-primary"}`} href="/conta">
            Minha conta
          </Link>
          {s.plano === "nenhum" && (
            <Link className="btn btn-ghost" href="/planos">
              Ver planos
            </Link>
          )}
          <Link className="btn btn-ghost" href="/">
            Assistir
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function PedidoStatus({ status, produto, centavos }: { status: string; produto: keyof typeof PRODUTOS; centavos: number }) {
  const nome = PRODUTOS[produto].nome;
  if (status === "aprovado")
    return (
      <div className="status-box status-ok" role="status" data-testid="pedido-status">
        <strong>Pagamento aprovado: {nome}</strong>
        <p>{brl(centavos)} confirmados pelo provedor. O acesso já está liberado nesta conta.</p>
      </div>
    );
  if (status === "pendente" || status === "criado")
    return (
      <div className="status-box status-wait" role="status" data-testid="pedido-status">
        <strong>Pagamento em confirmação: {nome}</strong>
        <p>
          {status === "pendente"
            ? "O provedor ainda está processando o pagamento (por exemplo, Pix ou boleto aguardando compensação)."
            : "Ainda não recebemos a confirmação do provedor."}{" "}
          O acesso é liberado automaticamente assim que o pagamento for aprovado. Atualize esta página em alguns instantes.
        </p>
      </div>
    );
  return (
    <div className="status-box status-warn" role="status" data-testid="pedido-status">
      <strong>
        {status === "recusado"
          ? `Pagamento não aprovado: ${nome}`
          : status === "reembolsado"
            ? `Compra reembolsada: ${nome}`
            : status === "contestado"
              ? `Compra contestada: ${nome}`
              : `Pagamento em análise: ${nome}`}
      </strong>
      <p>O acesso desta conta foi calculado com as compras que continuam válidas.</p>
    </div>
  );
}
