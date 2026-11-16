# DoraLivre

Plataforma de doramas dublados em português (Next.js 15 + TypeScript). Os episódios tocam **dentro do site** pelo player oficial do YouTube (`https://www.youtube.com/embed/VIDEO_ID`), controlado pela API oficial do IFrame Player.

## Como rodar

```bash
npm install
npm run dev          # desenvolvimento em http://localhost:3000
npm run build && npm start   # produção
```

`predev` e `prebuild` executam a importação do catálogo automaticamente.

## Onde editar o catálogo

| Arquivo | Para quê |
|---|---|
| `data/catalogo-doramas-pt-br.md` | **Fonte do catálogo.** Cada `### Série` vira uma série e cada linha da tabela vira um episódio (número, canal, ID do YouTube). |
| `data/catalogo.json` | Gerado por `npm run catalogo:importar`. Não edite à mão. |
| `data/series-meta.json` | Metadados opcionais por série (chave = slug): `sinopse`, `generos`, `ano`, `nota`, `poster`, `destaque`. Preencha só com dados confiáveis e autorizados. Campos vazios não aparecem, e o filtro de gênero só surge quando houver gêneros. |

Regras da importação (`scripts/importar-catalogo.mjs`):
- Os números originais ficam preservados, lacunas incluídas (ex.: 1, 2, 7). Os cards mostram "Eps. 1–2, 7".
- Uma linha com intervalo (`08–10` ou `08-10`) vira **uma** opção no player.
- A atualização usa o ID do YouTube. Um ID que sai do `.md` fica `"publicado": false` no JSON e some do site. IDs duplicados são ignorados.
- Para adicionar episódios, acrescente linhas no `.md` e rode `npm run catalogo:importar` (ou faça um novo build). Nenhum código de interface precisa mudar.

## Verificação dos vídeos

```bash
npm run catalogo:verificar                 # oEmbed oficial: existe, permite incorporar, canal e título
YT_API_KEY=... npm run catalogo:verificar  # + Data API v3: status.embeddable e contentDetails.regionRestriction (BR)
```

O resultado vai para `data/verificacao-youtube.json`, com alertas (por exemplo, número do episódio no título diferente do número no catálogo). Em ambientes atrás de proxy, use `NODE_USE_ENV_PROXY=1`.

## Testes

```bash
npm start &        # servidor em :3000
npm run test:e2e   # Playwright: home, busca, player, sequência 1→5, fechar, celular
```

## Comportamento do player

- "Assistir agora", os cards e a lista de episódios abrem uma janela sobre o catálogo. A URL vira `?assistir=slug&ep=01` e o usuário não sai do site. O botão Voltar do navegador fecha a janela.
- Ao trocar de episódio, `loadVideoById` carrega o novo vídeo no mesmo iframe. O episódio atual fica destacado e, ao fim de cada um, o próximo começa sozinho (opção que pode ser desligada).
- Com erro do player (códigos 2/5/100/101/150) ou se a API não carregar, aparece **"Episódio indisponível no momento"**, com botão para o próximo episódio disponível e "Tentar novamente". O episódio fica marcado na lista.
- A tela cheia funciona pelo botão do próprio YouTube e pelo botão "Tela cheia" do site. Controles, marca e anúncios do YouTube continuam intactos.

## Planos e pagamentos

O catálogo e o player continuam **públicos**. As compras (pagamento único) liberam recursos da conta:

| Produto | Preço (servidor, centavos) | Libera |
|---|---|---|
| DoraLivre Básico | `1090` | Favoritos e episódios assistidos, salvos na conta |
| DoraLivre Premium | `1990` | Tudo do Básico + área **Minha maratona** |
| Upgrade Básico → Premium | `900` | Só oferecido pelo servidor a contas com Básico ativo |

Páginas: `/planos` (vendas), `/entrar` (login e **URL de entrega**), `/conta` (Minha conta), `/minha-maratona` (Premium).

**Como funciona**
- Login: botão **Entrar com Google** pelo Supabase Auth (OAuth com PKCE, feito no servidor em `src/server/auth.ts`, rotas `/api/auth/google` e `/api/auth/callback`). Tokens em cookies httpOnly e validados no servidor a cada requisição.
- Pedido: `POST /api/checkout` exige sessão e cria o pedido com o ID da conta **antes** de abrir o checkout. Produto e valor são decididos no servidor (`src/lib/products.ts`, `offerFor` em `src/server/billing.ts`).
- Checkout: Mercado Pago Checkout Pro, com `external_reference` = ID do pedido.
- Webhook `POST /api/webhooks/mercadopago`:
  1. valida a assinatura `x-signature` (HMAC-SHA256);
  2. busca o pagamento na API oficial;
  3. confere pedido, moeda **BRL**, valor esperado e status.
  - É idempotente (`eventos_webhook`).
  - Reembolso (`refunded`) e chargeback (`charged_back`) mudam o status do pedido.
- Acesso: sempre **recalculado** a partir das compras aprovadas.
  - Premium = Premium aprovado, ou Básico + upgrade aprovados.
  - Básico = Básico aprovado.
  - Exemplo: com o upgrade reembolsado e o Básico válido, a conta volta ao Básico. Favoritos e marcações ficam na conta.
- Todas as rotas e ações Premium validam o plano no servidor (`requireAccess` em `src/server/account.ts`).
- Avisos de novos episódios: a cada início do servidor, o catálogo publicado é comparado com `catalogo_episodios`. Episódios novos geram avisos para quem segue a série.

### Rodar em modo de teste (sem credenciais)

```bash
# Postgres local (ex.: docker run -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16)
export DATABASE_URL=postgres://postgres@localhost:5432/postgres
npm run dev     # ou: npm run build && DORALIVRE_MODO_TESTE=1 npm start
```

No modo de teste, login e Mercado Pago são **simulados pelo mesmo código de produção**:
- o botão "Entrar com Google" abre `/teste/google`, que simula a escolha da conta Google;
- o checkout simulado envia webhooks assinados;
- `/teste/pagamentos` aprova pendentes, reembolsa, contesta e reenvia webhooks.

Testes: `node tests/planos.e2e.cjs parte1` e, depois de adicionar um episódio ao catálogo e reiniciar, `node tests/planos.e2e.cjs parte2`.

### Ativar o login com Google e a cobrança real
1. **Google Cloud** (console.cloud.google.com):
   - *APIs e serviços → Tela de permissão OAuth* (ou *Google Auth Platform*): público **Externo**, nome do app, e-mail de suporte; escopos `openid`, `email` e `profile`; publique o app.
   - *APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth*, tipo **Aplicativo da Web**:
     - Origens JavaScript autorizadas: `https://dora-livre.vercel.app`
     - URIs de redirecionamento autorizados: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`
   - Copie o **ID do cliente** e a **chave secreta do cliente**.
2. **Supabase** (projeto doralivre):
   - *Authentication → Sign In / Providers → Google*: ative e cole o ID e a chave secreta do cliente.
   - *Authentication → URL Configuration*: *Site URL* `https://dora-livre.vercel.app` e, em *Redirect URLs*, `https://dora-livre.vercel.app/api/auth/callback`.
3. **Banco**: `DATABASE_URL` com a connection string do pooler. O esquema (`supabase/schema.sql`, com RLS ligado em todas as tabelas) é aplicado automaticamente na primeira requisição.
4. **Mercado Pago**: crie a aplicação (Checkout Pro) e use as credenciais em `MP_ACCESS_TOKEN`. Em *Webhooks*:
   - cadastre `https://dora-livre.vercel.app/api/webhooks/mercadopago` com o evento **Pagamentos**;
   - copie a assinatura secreta para `MP_WEBHOOK_SECRET`.
5. **Vercel**:
   - cadastre as variáveis de `.env.example`, incluindo `SITE_URL=https://dora-livre.vercel.app`;
   - **não** defina `DORALIVRE_MODO_TESTE`.
6. Faça uma compra com usuários de teste do Mercado Pago antes de liberar ao público.
