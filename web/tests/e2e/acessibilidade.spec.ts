// WCAG 2.1 AA com axe-core em cada pagina e estado, e o que o axe nao mede:
// teclado, foco visivel e alvo de toque de 48 px (target.min).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CODIGOS, TOKENS } from './apoio.ts';

const PAGINAS = [
  '/', '/comunidade', '/como-funciona', '/para-profissionais', '/sobre', '/contato', '/termos', '/privacidade', '/nao-existe',
  `/t/${CODIGOS.perdido}`, `/t/${CODIGOS.semFoto}`, `/t/${CODIGOS.malformado}`, `/t/${CODIGOS.inexistente}`,
  `/t/${CODIGOS.desativada}`, `/t/${CODIGOS.muitasTentativas}`, `/t/${CODIGOS.lento}`, `/t/${CODIGOS.tipoInesperado}`,
  `/verificar-email?token=${TOKENS.emailValido}`, `/redefinir-senha?token=${TOKENS.senhaValido}`, `/redefinir-senha?token=${TOKENS.senhaVencido}`,
];

for (const rota of PAGINAS) {
  test(`axe WCAG 2.1 AA: ${rota}`, async ({ page }) => {
    await page.goto(rota);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('o primeiro Tab vai para "Pular para o conteudo", e o foco aparece', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const foco = page.locator(':focus');
  await expect(foco).toHaveText('Pular para o conteúdo');
  const contorno = await foco.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(contorno).toBe('solid');
});

test('todo link e botao visivel tem alvo de 48 px ou mais', async ({ page }) => {
  for (const rota of ['/', '/comunidade', '/contato', `/t/${CODIGOS.perdido}`, `/t/${CODIGOS.malformado}`, `/redefinir-senha?token=${TOKENS.senhaValido}`]) {
    await page.goto(rota);
    const pequenos = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, summary, input:not([type="hidden"])')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const visivel = r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
          // Link dentro de paragrafo de texto corrido (termos) e excecao do SC 2.5.8.
          const emTexto = e.closest('.legal__texto');
          return visivel && !emTexto && e.closest('.sr-only, .pular-para-conteudo') === null && r.height < 47.5;
        })
        .map((e) => `${e.tagName} "${(e.textContent ?? '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().height)}px`),
    );
    expect(pequenos, rota).toEqual([]);
  }
});

test('manuscrito e formas sao decorativos (fora da arvore de acessibilidade)', async ({ page }) => {
  await page.goto('/');
  for (const seletor of ['.selo-manuscrito', '.blob', '.divisor-onda', '.trilha-patinhas']) {
    const todos = await page.locator(seletor).evaluateAll((els) => els.every((e) => e.getAttribute('aria-hidden') === 'true'));
    expect(todos, seletor).toBe(true);
  }
});
