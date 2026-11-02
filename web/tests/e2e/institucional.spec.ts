// O que o site institucional promete e o que ele nao pode prometer na v1.
import { test, expect } from '@playwright/test';

const PAGINAS = ['/', '/comunidade', '/como-funciona', '/para-profissionais', '/sobre', '/contato', '/termos', '/privacidade'];

// O que este caso garantia antes de 02/11/2026: que a promessa de plataforma
// estava VISIVEL, na forma da frase "Em breve na App Store e no Google Play.".
// O cliente trocou a frase pelos DOIS icones, sem "em breve" e sem link, e a
// cobertura continua: o que tem de estar visivel agora sao os dois selos.
test('nenhum link sem destino, e os dois icones das lojas presentes e nao clicaveis', async ({ page }) => {
  for (const rota of PAGINAS) {
    await page.goto(rota);
    await expect(page.locator('a[href="#"], a:not([href])'), rota).toHaveCount(0);
    await expect(page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"]'), rota).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Baixar o app' }).first(), rota).toBeAttached();
  }
  await page.goto('/');
  const lojas = page.getByRole('list', { name: 'Lojas de aplicativos' }).first();
  await expect(lojas).toBeVisible();
  await expect(lojas.getByText('App Store', { exact: true })).toBeVisible();
  await expect(lojas.getByText('Google Play', { exact: true })).toBeVisible();
  // Sem endereco de loja, um selo clicavel produz clique morto: nem <a> nem <button>.
  await expect(lojas.locator('a, button')).toHaveCount(0);
  // E a frase que saiu nao volta por descuido.
  await expect(page.getByText('Em breve na App Store e no Google Play.')).toHaveCount(0);
});

test('decisoes do cliente: sem Grupos, sem pontos, rodape com Instagram e e-mail', async ({ page }) => {
  for (const rota of PAGINAS.slice(0, 6)) {
    await page.goto(rota);
    const texto = (await page.locator('main').textContent()) ?? '';
    expect(texto, rota).not.toMatch(/\bGrupos?\b/);
    expect(texto, rota).not.toMatch(/\bpontos\b/i);
    // TODA conversa deste produto nasce de um aviso de plaquinha e de mais nada:
    // `migrations/20260922000012_conversa-mediada.sql` faz `found_report_id` NOT
    // NULL e UNIQUE, e o contrato nao declara `POST /conversations` -- sob
    // `/conversations` so existe o `get`. Conversa entre pessoas NAO EXISTE, e o
    // site nao pode convidar para ela. A conversa do ACHADO continua podendo ser
    // dita, e por isso o que se proibe e o convite, nao a palavra.
    expect(texto, rota).not.toMatch(/\bConverse\b/i);
    expect(texto, rota).not.toMatch(/convers\w+\s+com\s+quem/i);
    const rodape = page.locator('footer');
    await expect(rodape.getByRole('link', { name: /Instagram do Bichu/ })).toHaveAttribute('href', 'https://www.instagram.com/bichu.app/');
    await expect(rodape.getByRole('link', { name: /oi@bichu\.app/ })).toHaveAttribute('href', 'mailto:oi@bichu.app');
    await expect(rodape).toContainText('© 2026 Bichu. Nunca pague recompensa por um pet. O Bichu não intermedeia pagamento.');
  }
});

test('navegacao: link da pagina atual com aria-current', async ({ page }) => {
  await page.goto('/comunidade');
  await expect(page.locator('a[aria-current="page"]').first()).toHaveText('Comunidade');
});

test('hierarquia de titulos sem pular nivel', async ({ page }) => {
  for (const rota of PAGINAS) {
    await page.goto(rota);
    const niveis = await page.locator('h1, h2, h3, h4').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(niveis[0], rota).toBe(1);
    expect(niveis.filter((n) => n === 1), rota).toHaveLength(1);
    for (let i = 1; i < niveis.length; i++) expect(niveis[i]! - niveis[i - 1]!, `${rota}: h${niveis[i - 1]} -> h${niveis[i]}`).toBeLessThanOrEqual(1);
  }
});
