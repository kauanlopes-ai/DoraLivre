# Lua Doramas

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
