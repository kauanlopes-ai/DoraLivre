"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Plano } from "@/lib/products";

export type ContaCliente = {
  user: { id: string; email: string };
  plano: Plano;
  pedidos: { id: string; produto: string; valor_centavos: number; status: string; criado_em: string; atualizado_em: string }[];
  pagamentoEmConfirmacao: boolean;
  favoritos: string[];
  assistidos: string[];
  seguindo: string[];
  listas: { id: string; nome: string }[];
  avisosNaoLidos: number;
};

type Info = { contasAtivas: boolean; pagamentosAtivos: boolean; modoTeste: boolean; conta: ContaCliente | null };

type Ctx = {
  loading: boolean;
  info: Info | null;
  conta: ContaCliente | null;
  plano: Plano;
  refresh: () => Promise<void>;
  toggleFavorito: (slug: string) => Promise<string | null>;
  toggleAssistido: (youtubeId: string) => Promise<string | null>;
  toggleSeguir: (slug: string) => Promise<string | null>;
  adicionarALista: (listaId: string, slug: string) => Promise<string | null>;
  criarLista: (nome: string) => Promise<{ id: string } | string>;
  registrarAbertura: (youtubeId: string) => void;
};

const AccountContext = createContext<Ctx | null>(null);

export async function postJson(url: string, data: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j as Record<string, unknown> };
}

export default function AccountProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/conta", { cache: "no-store" });
      if (r.ok) setInfo(await r.json());
    } catch {
      /* offline: catálogo segue funcionando */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const conta = info?.conta ?? null;
  const plano: Plano = conta?.plano ?? "nenhum";

  const registrarAbertura = useCallback(
    (youtubeId: string) => {
      if (plano !== "premium") return;
      postJson("/api/maratona/historico", { youtubeId }).catch(() => {});
    },
    [plano],
  );

  const patch = (fn: (c: ContaCliente) => ContaCliente) =>
    setInfo((i) => (i && i.conta ? { ...i, conta: fn(i.conta) } : i));

  const toggleIn = (arr: string[], v: string, on: boolean) => (on ? [...new Set([...arr, v])] : arr.filter((x) => x !== v));

  const value = useMemo<Ctx>(
    () => ({
      loading,
      info,
      conta,
      plano,
      refresh,
      async toggleFavorito(slug) {
        if (!conta) return "login";
        const on = !conta.favoritos.includes(slug);
        patch((c) => ({ ...c, favoritos: toggleIn(c.favoritos, slug, on) }));
        const r = await postJson("/api/conta/favoritos", { slug, on });
        if (!r.ok) {
          patch((c) => ({ ...c, favoritos: toggleIn(c.favoritos, slug, !on) }));
          return String(r.data.erro ?? "Não foi possível salvar.");
        }
        return null;
      },
      async toggleAssistido(youtubeId) {
        if (!conta) return "login";
        const on = !conta.assistidos.includes(youtubeId);
        patch((c) => ({ ...c, assistidos: toggleIn(c.assistidos, youtubeId, on) }));
        const r = await postJson("/api/conta/assistidos", { youtubeId, on });
        if (!r.ok) {
          patch((c) => ({ ...c, assistidos: toggleIn(c.assistidos, youtubeId, !on) }));
          return String(r.data.erro ?? "Não foi possível salvar.");
        }
        return null;
      },
      async toggleSeguir(slug) {
        if (!conta) return "login";
        const on = !conta.seguindo.includes(slug);
        patch((c) => ({ ...c, seguindo: toggleIn(c.seguindo, slug, on) }));
        const r = await postJson("/api/maratona/seguir", { slug, on });
        if (!r.ok) {
          patch((c) => ({ ...c, seguindo: toggleIn(c.seguindo, slug, !on) }));
          return String(r.data.erro ?? "Não foi possível salvar.");
        }
        return null;
      },
      async adicionarALista(listaId, slug) {
        const r = await postJson("/api/maratona/listas", { acao: "item", itemAcao: "adicionar", listaId, slug });
        return r.ok ? null : String(r.data.erro ?? "Não foi possível adicionar.");
      },
      async criarLista(nome) {
        const r = await postJson("/api/maratona/listas", { acao: "criar", nome });
        if (!r.ok) return String(r.data.erro ?? "Não foi possível criar a lista.");
        const lista = r.data.lista as { id: string; nome: string };
        patch((c) => ({ ...c, listas: [...c.listas, { id: lista.id, nome: lista.nome }] }));
        return lista;
      },
      registrarAbertura,
    }),
    [loading, info, conta, plano, refresh, registrarAbertura],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
