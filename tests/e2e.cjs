const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.SHOTS || require('path').join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

async function embedInfo(page) {
  const fr = page.frames().find(f => f.url().includes('youtube.com/embed/'));
  if (!fr) return null;
  try {
    return await fr.evaluate(() => {
      const v = document.querySelector('video');
      const mp = document.querySelector('#movie_player');
      const vd = mp && mp.getVideoData ? mp.getVideoData() : {};
      return { href: vd.video_id || '', title: (vd.title || '').slice(0, 40), state: mp && mp.getPlayerState ? mp.getPlayerState() : null, t: v ? v.currentTime : -1, paused: v ? v.paused : null, err: document.querySelector('.ytp-error')?.innerText || '' };
    });
  } catch (e) { return { evalError: String(e) }; }
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // ---------- Desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const popups = []; let page;
  page = await ctx.newPage();
  ctx.on('page', p => popups.push(p.url()));
  const bad = {};
  page.on('response', r => { if (r.status() >= 400) { const h = new URL(r.url()).host; bad[h + ' ' + r.status()] = (bad[h + ' ' + r.status()] || 0) + 1; } });
  page.on('requestfailed', r => { const h = new URL(r.url()).host; bad[h + ' failed'] = (bad[h + ' failed'] || 0) + 1; });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: OUT + 'd1-home.png' });
  await page.screenshot({ path: OUT + 'd1-home-full.png', fullPage: true });

  const gridCards = await page.locator('#catalogo .grid .poster').count();
  check('Grade mostra 20 séries', gridCards === 20, `${gridCards}`);
  const gridText = await page.locator('#catalogo .grid').innerText();
  const counts = [...gridText.matchAll(/(\d+) eps?\. disponíve/g)].reduce((a, m) => a + +m[1], 0);
  check('Soma das contagens nos cards = 66', counts === 66, `${counts}`);
  check('Nenhum card diz "completa"', !/complet/i.test(gridText));
  check('Hero mostra "Quando Eu Encontrar a Lua"', (await page.locator('.hero-title').innerText()) === 'Quando Eu Encontrar a Lua');
  const rows = await page.locator('.row h2').allInnerTexts();
  console.log('   fileiras:', rows.join(' | '));
  check('Filtro de gênero oculto (sem metadados confiáveis)', (await page.getByText('Gênero', { exact: true }).count()) === 0);

  // Busca
  const search = page.getByLabel('Buscar dorama por título');
  await search.fill('lua');
  await page.waitForTimeout(400);
  let names = await page.locator('#catalogo .grid .poster-name').allInnerTexts();
  check('Busca "lua" → Quando Eu Encontrar a Lua', names.length === 1 && names[0] === 'Quando Eu Encontrar a Lua', names.join(','));
  await search.fill('fenix');
  names = await page.locator('#catalogo .grid .poster-name').allInnerTexts();
  check('Busca sem acento "fenix" → A Chave para o Coração da Fênix', names.length === 1 && names[0].includes('Fênix'), names.join(','));
  await search.fill('shadow punisher');
  names = await page.locator('#catalogo .grid .poster-name').allInnerTexts();
  check('Busca por título original "shadow punisher"', names.length === 1 && names[0] === 'O Justiceiro das Sombras', names.join(','));
  await search.fill('zzzz');
  check('Busca sem resultado mostra estado vazio', await page.getByText('Nenhum dorama encontrado.').isVisible());
  await page.screenshot({ path: OUT + 'd2-busca-vazia.png' });
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  check('Limpar busca restaura 20 séries', (await page.locator('#catalogo .grid .poster').count()) === 20);
  await page.getByRole('button', { name: 'WeTV', exact: true }).click();
  names = await page.locator('#catalogo .grid .poster-name').allInnerTexts();
  check('Filtro canal WeTV → 4 séries', names.length === 4, names.join(','));
  await page.getByRole('button', { name: 'Todos' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  // Assistir agora
  await page.getByRole('button', { name: /Assistir agora/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const iframe = page.locator('.stage iframe');
  await iframe.waitFor({ timeout: 20000 });
  const src = await iframe.getAttribute('src');
  check('"Assistir agora" abre janela com iframe youtube.com/embed/smvfWWTcRXU', /^https:\/\/www\.youtube\.com\/embed\/smvfWWTcRXU/.test(src), src.slice(0, 70));
  check('URL continua no site', new URL(page.url()).origin === new URL(BASE).origin, page.url());
  check('Iframe permite tela cheia', (await iframe.getAttribute('allowfullscreen')) !== null || /fullscreen/.test((await iframe.getAttribute('allow')) || ''));
  await page.waitForTimeout(6000);
  console.log('   ep1 embed:', JSON.stringify(await embedInfo(page)));
  await page.screenshot({ path: OUT + 'd3-player-ep1.png' });

  // Layout desktop: lista ao lado do vídeo
  const stageBox = await page.locator('.stage').boundingBox();
  const listBox = await page.locator('.episodes-col').boundingBox();
  check('Desktop: episódios ao lado do vídeo', listBox.x >= stageBox.x + stageBox.width - 2, `stage x=${stageBox.x} w=${stageBox.width} lista x=${listBox.x}`);

  // Sequência 1 → 5
  const expected = ['smvfWWTcRXU', 'sHqCUz7CAEY', 'x2HbyeMYvdk', '61HE9dxACEM', 'XEan-lK_58E'];
  const iframeHandle = await iframe.elementHandle();
  for (let n = 1; n <= 5; n++) {
    await page.locator('.episode-item', { hasText: `Episódio ${n}` }).click();
    await page.waitForTimeout(n === 1 ? 1000 : 5000);
    const active = await page.locator('.episode-item[aria-current="true"] .episode-num').innerText();
    const info = await embedInfo(page);
    const sameIframe = await iframeHandle.evaluate(el => el.isConnected);
    const url = page.url();
    const err = await page.locator('.stage-error').count();
    const ytErr = await page.locator('.stage').getAttribute('data-yt-error');
    if (ytErr || err) console.log('   erro do player:', ytErr, 'overlay=', err);
    const ok = active === `Episódio ${n}` && url.includes(`ep=0${n}`) && sameIframe && (info?.href || '').includes(expected[n - 1]) ;
    check(`Episódio ${n}: destacado, vídeo ${expected[n - 1]} carregado no mesmo iframe`, ok, `ativo="${active}" href=${info?.href} t=${info?.t?.toFixed?.(1)} url=${url.split('/').pop()}`);
  }
  await page.screenshot({ path: OUT + 'd4-player-ep5.png' });
  check('Nenhuma aba/janela nova aberta', popups.length === 0, popups.join(','));
  check('Ainda na mesma origem após a sequência', new URL(page.url()).origin === new URL(BASE).origin);

  // Botões próximo/anterior
  await page.getByRole('button', { name: /Anterior/ }).click();
  check('Botão "Anterior" volta ao ep 4', (await page.locator('.episode-item[aria-current="true"] .episode-num').innerText()) === 'Episódio 4');

  // Fechar
  await page.getByRole('button', { name: 'Fechar player' }).click();
  await page.waitForTimeout(500);
  check('Fechar remove a janela', (await page.getByRole('dialog').count()) === 0);
  check('Fechar limpa a URL', !page.url().includes('assistir='), page.url());
  check('Card mostra "Continuar assistindo"', (await page.getByRole('heading', { name: 'Continuar assistindo' }).count()) === 1);

  // Abrir pelo card + Esc + voltar do navegador
  await page.locator('#catalogo .poster', { hasText: 'Genius Girlfriend' }).click();
  await page.getByRole('dialog').waitFor();
  check('Card abre player na janela', (await page.locator('.modal-bar-title strong').innerText()) === 'Genius Girlfriend');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc fecha a janela', (await page.getByRole('dialog').count()) === 0);
  await page.locator('#catalogo .poster', { hasText: 'O Melhor de Tudo' }).click();
  await page.getByRole('dialog').waitFor();
  await page.goBack();
  await page.waitForTimeout(400);
  check('Botão voltar do navegador fecha a janela (sem sair do site)', (await page.getByRole('dialog').count()) === 0 && page.url().startsWith(BASE), page.url());

  // Link direto
  await page.goto(BASE + '/?assistir=quando-eu-encontrar-a-lua&ep=03', { waitUntil: 'networkidle' });
  check('Link direto ?assistir=…&ep=03 abre o ep. 3', (await page.locator('.episode-item[aria-current="true"] .episode-num').innerText()) === 'Episódio 3');
  console.log('   respostas com erro por host:', JSON.stringify(bad));
  console.log('   erros de console (desktop):', consoleErrors.filter(e => !/youtube|googlevideo|doubleclick|ytimg|google/i.test(e)).slice(0, 5));
  await ctx.close();

  // ---------- Celular ----------
  const mctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-BR' });
  const m = await mctx.newPage();
  await m.goto(BASE, { waitUntil: 'networkidle' });
  await m.screenshot({ path: OUT + 'm1-home.png' });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Celular: sem rolagem horizontal na home', overflow <= 0, `${overflow}px`);
  await m.getByRole('button', { name: /Assistir agora/ }).click();
  await m.getByRole('dialog').waitFor();
  await m.locator('.stage iframe').waitFor({ timeout: 20000 });
  await m.waitForTimeout(3000);
  await m.screenshot({ path: OUT + 'm2-player.png' });
  const vp = m.viewportSize();
  const sb = await m.locator('.stage').boundingBox();
  const lb = await m.locator('.episodes-col').boundingBox();
  check('Celular: lista de episódios abaixo do player', lb.y >= sb.y + sb.height - 1, `stage bottom=${(sb.y + sb.height).toFixed(0)} lista y=${lb.y.toFixed(0)}`);
  check('Celular: player ocupa a largura', Math.abs(sb.width - vp.width) < 2, `${sb.width}/${vp.width}`);
  const cb = await m.locator('.mobile-close').boundingBox();
  check('Celular: botão "Fechar" fixo na parte de baixo, visível', cb && cb.y + cb.height <= vp.height && cb.y > vp.height * 0.8 && cb.height >= 44, JSON.stringify(cb));
  const xb = await m.getByRole('button', { name: 'Fechar player' }).boundingBox();
  check('Celular: X de fechar com área ≥ 44px', xb.width >= 44 && xb.height >= 44);
  await m.locator('.episode-item', { hasText: 'Episódio 2' }).scrollIntoViewIfNeeded();
  await m.locator('.episode-item', { hasText: 'Episódio 2' }).click();
  await m.waitForTimeout(2500);
  await m.screenshot({ path: OUT + 'm3-player-ep2.png' });
  check('Celular: troca para ep. 2 destacada', (await m.locator('.episode-item[aria-current="true"] .episode-num').innerText()) === 'Episódio 2');
  await m.locator('.mobile-close').click();
  await m.waitForTimeout(400);
  check('Celular: botão inferior fecha a janela', (await m.getByRole('dialog').count()) === 0);
  await m.getByLabel('Buscar dorama por título').fill('oliveira');
  await m.waitForTimeout(600);
  await m.screenshot({ path: OUT + 'm4-busca.png' });
  check('Celular: busca funciona', (await m.locator('#catalogo .grid .poster').count()) === 1);
  await mctx.close();

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
