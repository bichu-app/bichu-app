// /verificar-email e /redefinir-senha contra o mock do contrato.
import { test, expect } from '@playwright/test';
import { SENHAS, TOKENS, limparPedidos, pedidos, semChamadaForaDoContrato, titulo } from './apoio.ts';

test.beforeEach(async ({ request }) => limparPedidos(request));
test.afterEach(async ({ request }) => semChamadaForaDoContrato(request));

test('verificar e-mail: o GET nao chama a API (GET nunca executa)', async ({ page, request }) => {
  const r = await page.goto(`/verificar-email?token=${TOKENS.emailValido}`);
  expect(r?.status()).toBe(200);
  expect(await titulo(page)).toBe('Confirme seu e-mail');
  expect(await pedidos(request)).toHaveLength(0);
});

const email: [string, string, number, string][] = [
  ['confirmado', TOKENS.emailValido, 200, 'E-mail confirmado.'],
  ['410 vencido', TOKENS.emailVencido, 410, 'Este link expirou.'],
  ['400 token curto', 'curto', 400, 'Este link expirou.'],
  ['429', TOKENS.emailLimite, 429, 'Espere um pouco antes de tentar de novo.'],
  ['erro de rede', TOKENS.emailLento, 503, 'Não conseguimos confirmar agora.'],
];
for (const [nome, token, status, h1] of email) {
  test(`verificar e-mail ${nome}`, async ({ page }) => {
    await page.goto(`/verificar-email?token=${token}`);
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === new URL(page.url()).pathname),
      page.getByRole('button', { name: 'Confirmar meu e-mail' }).click(),
    ]);
    expect(resposta.status()).toBe(status);
    await expect(page.locator('h1')).toHaveText(h1);
  });
}

test('redefinir senha: sem token, com token vencido e com falha ao conferir', async ({ page }) => {
  expect((await page.goto('/redefinir-senha'))?.status()).toBe(400);
  expect(await titulo(page)).toBe('Este link expirou.');
  expect((await page.goto(`/redefinir-senha?token=${TOKENS.senhaVencido}`))?.status()).toBe(410);
  expect(await titulo(page)).toBe('Este link expirou.');
  expect((await page.goto(`/redefinir-senha?token=${TOKENS.senhaLento}`))?.status()).toBe(503);
  expect(await titulo(page)).toBe('Não conseguimos conferir o seu link.');
});

const senhas: [string, string, number, string | RegExp][] = [
  ['alterada', SENHAS.boa, 200, 'Senha alterada.'],
  ['422 vazada', SENHAS.vazada, 422, 'Essa senha já apareceu em vazamentos de outros sites. Escolha outra.'],
  ['422 parecida', SENHAS.parecida, 422, 'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.'],
  ['erro de rede', SENHAS.lenta, 503, 'Não conseguimos salvar agora.'],
];
for (const [nome, senha, status, texto] of senhas) {
  test(`redefinir senha ${nome}`, async ({ page }) => {
    await page.goto(`/redefinir-senha?token=${TOKENS.senhaValido}`);
    await page.getByLabel('Senha', { exact: true }).fill(senha);
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === new URL(page.url()).pathname),
      page.getByRole('button', { name: 'Salvar a senha nova' }).click(),
    ]);
    expect(resposta.status()).toBe(status);
    await expect(page.getByText(texto)).toBeVisible();
    // A senha digitada nunca volta no HTML da resposta.
    expect(await page.content()).not.toContain(senha);
  });
}

test('redefinir senha: o campo tem rotulo, regra associada e o botao de mostrar (com JS)', async ({ page }) => {
  await page.goto(`/redefinir-senha?token=${TOKENS.senhaValido}`);
  const campo = page.getByLabel('Senha', { exact: true });
  await expect(campo).toHaveAttribute('autocomplete', 'new-password');
  await expect(campo).toHaveAttribute('aria-describedby', 'senha-regra');
  const mostrar = page.getByRole('button', { name: 'Mostrar a senha' });
  await mostrar.click();
  await expect(campo).toHaveAttribute('type', 'text');
  await expect(mostrar).toHaveAttribute('aria-pressed', 'true');
});
