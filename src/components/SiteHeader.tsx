"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "./AccountProvider";
import { IconSearch, Logo } from "./Icons";

type Props = {
  search?: { value: string; onChange: (v: string) => void };
};

export default function SiteHeader({ search }: Props) {
  const acc = useAccount();
  const path = usePathname();
  const conta = acc?.conta;
  const premium = acc?.plano === "premium";
  const link = (href: string, label: string, extra?: React.ReactNode) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
      {extra}
    </Link>
  );
  return (
    <>
      {acc?.info?.modoTeste && (
        <div className="test-banner" role="status">
          Ambiente de teste: login e pagamentos simulados, nenhum valor é cobrado.{" "}
          <Link href="/teste/caixa-de-entrada">Caixa de entrada de teste</Link>
        </div>
      )}
      <header className={`topbar${acc?.info?.modoTeste ? " has-banner" : ""}`}>
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="DoraLivre — início">
            <Logo />
          </Link>
          <nav className="topnav" aria-label="Principal">
            {link("/", "Início")}
            <Link href="/#catalogo">Catálogo</Link>
            {premium
              ? link(
                  "/minha-maratona",
                  "Minha maratona",
                  conta && conta.avisosNaoLidos > 0 ? <span className="dot-badge">{conta.avisosNaoLidos}</span> : null,
                )
              : link("/planos", "Planos")}
          </nav>
          {search && (
            <label className="search">
              <IconSearch size={16} />
              <input
                type="search"
                placeholder="Buscar dorama…"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                aria-label="Buscar dorama por título"
              />
            </label>
          )}
          <div className={`account-slot${search ? "" : " push"}`}>
            <Link className="mobile-nav-link" href={premium ? "/minha-maratona" : "/planos"}>
              {premium ? "Maratona" : "Planos"}
              {premium && conta && conta.avisosNaoLidos > 0 && <span className="dot-badge">{conta.avisosNaoLidos}</span>}
            </Link>
            {conta ? (
              <Link href="/conta" className="account-chip" aria-label={`Minha conta (${conta.user.email})`}>
                <span className="avatar" aria-hidden>
                  {conta.user.email[0]?.toUpperCase()}
                </span>
                <span className="account-chip-text">Minha conta</span>
                {conta.plano !== "nenhum" && <span className={`plan-tag plan-${conta.plano}`}>{conta.plano === "premium" ? "Premium" : "Básico"}</span>}
              </Link>
            ) : acc?.info?.contasAtivas ? (
              <Link href="/entrar" className="btn btn-ghost btn-sm">
                Entrar
              </Link>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}
