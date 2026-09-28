// O toque unico sem JavaScript (ADR-0028, item 10.7; docs/04-seguranca.md D31):
// o aviso pela tag concluido com o script desligado no navegador.
import { test, expect } from '@playwright/test';
import { CODIGOS, SENHAS, TOKENS, limparPedidos, pedidos, semChamadaForaDoContrato } from './apoio.ts';

test.beforeEach(async ({ request }) => limparPedidos(request));
test.afterEach(async ({ request }) => semChamadaForaDoContrato(request));

test('sem JS: o JavaScript esta mesmo desligado', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  // Com JS, o script de envio revela este botao; sem JS ele continua escondido.
  await page.goto(`/redefinir-senha?token=${TOKENS.senhaValido}`);
  await expect(page.getByRole('button', { name: 'Mostrar a senha' })).toBeHidden();
});

test('sem JS: avisar o tutor pela tag, um toque', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Pronto. O tutor de Thor foi avisado.');
  const avisos = (await pedidos(request)).filter((p) => p.operacao === 'createFoundReportFromTag');
  expect(avisos).toHaveLength(1);
  expect(avisos[0]?.corpo).toEqual({});
});

test('sem JS: depois da falha, "Tentar de novo" reenvia com a MESMA Idempotency-Key', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.avisoLento}`);
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Não conseguimos avisar o tutor.');
  await expect(page.getByText(`/t/${CODIGOS.avisoLento}`)).toBeVisible();
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('h1')).toHaveText('Não conseguimos avisar o tutor.');
  const chaves = (await pedidos(request)).filter((p) => p.operacao === 'createFoundReportFromTag').map((p) => p.cabecalhos['idempotency-key']);
  expect(chaves).toHaveLength(2);
  expect(chaves[0]).toBe(chaves[1]);
});

test('sem JS: procurar o codigo digitado', async ({ page }) => {
  await page.goto('/t');
  await page.getByLabel('Código da tag').fill(CODIGOS.perdido);
  await page.getByRole('button', { name: 'Procurar este código' }).click();
  await expect(page.locator('h1')).toHaveText('Thor');
});

test('sem JS: confirmar o e-mail e criar a senha nova', async ({ page }) => {
  await page.goto(`/verificar-email?token=${TOKENS.emailValido}`);
  await page.getByRole('button', { name: 'Confirmar meu e-mail' }).click();
  await expect(page.locator('h1')).toHaveText('E-mail confirmado.');
  await page.goto(`/redefinir-senha?token=${TOKENS.senhaValido}`);
  await page.getByLabel('Senha', { exact: true }).fill(SENHAS.boa);
  await page.getByRole('button', { name: 'Salvar a senha nova' }).click();
  await expect(page.locator('h1')).toHaveText('Senha alterada.');
});

test('sem JS: o menu do celular abre (details)', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Menu', { exact: true }).click();
  await expect(page.locator('.nav-celular__painel').getByRole('link', { name: 'Comunidade' })).toBeVisible();
});
