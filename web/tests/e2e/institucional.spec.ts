// O que o site institucional promete e o que ele nao pode prometer na v1.
import { test, expect } from '@playwright/test';

const PAGINAS = ['/', '/comunidade', '/como-funciona', '/para-profissionais', '/sobre', '/contato', '/termos', '/privacidade'];

test('nenhum link sem destino, nenhum selo de loja e o texto "Em breve" no lugar', async ({ page }) => {
  for (const rota of PAGINAS) {
    await page.goto(rota);
    await expect(page.locator('a[href="#"], a:not([href])'), rota).toHaveCount(0);
    await expect(page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"]'), rota).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Em breve nas lojas' }).first(), rota).toBeAttached();
  }
  await page.goto('/');
  await expect(page.getByText('Em breve na App Store e no Google Play.').first()).toBeVisible();
});

test('decisoes do cliente: sem Grupos, sem pontos, rodape com Instagram e e-mail', async ({ page }) => {
  for (const rota of PAGINAS.slice(0, 6)) {
    await page.goto(rota);
    const texto = (await page.locator('main').textContent()) ?? '';
    expect(texto, rota).not.toMatch(/\bGrupos?\b/);
    expect(texto, rota).not.toMatch(/\bpontos\b/i);
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
