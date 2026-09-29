// /t/{code} contra o mock do contrato: cada estado, o status HTTP e o que a pagina
// NUNCA mostra (telefone e endereco do tutor nao existem na resposta).
import { test, expect } from '@playwright/test';
import { CODIGOS, limparPedidos, pedidos, semChamadaForaDoContrato, titulo } from './apoio.ts';

test.beforeEach(async ({ request }) => limparPedidos(request));
test.afterEach(async ({ request }) => semChamadaForaDoContrato(request));

const estados: [string, string, number, RegExp][] = [
  ['pet perdido', CODIGOS.perdido, 200, /^Thor$/],
  ['sem foto e nao perdido', CODIGOS.semFoto, 200, /^Thor$/],
  ['400 codigo malformado', CODIGOS.malformado, 400, /Confira o código/],
  ['404 codigo inexistente', CODIGOS.inexistente, 404, /não é de nenhuma tag do Bichu/],
  ['410 tag desativada', CODIGOS.desativada, 410, /desativada pelo tutor/],
  ['429 muitas tentativas', CODIGOS.muitasTentativas, 429, /Espere um pouco/],
  ['erro de rede (tempo esgotado)', CODIGOS.lento, 503, /Não conseguimos abrir os dados deste pet/],
  ['500 internal', CODIGOS.foraDoAr, 503, /fora do ar/],
  ['type inesperado', CODIGOS.tipoInesperado, 403, /Algo não saiu como devia/],
];

for (const [nome, codigo, status, h1] of estados) {
  test(`/t/ ${nome}: ${status}`, async ({ page }) => {
    const resposta = await page.goto(`/t/${codigo}`);
    expect(resposta?.status()).toBe(status);
    expect(await titulo(page)).toMatch(h1);
    const html = await page.content();
    expect(html).not.toMatch(/telefone do tutor|endereço do tutor/i);
  });
}

test('/t/ 200: faixa de perdido, cuidados, garantia de contato e o botao', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await expect(page.getByText('Este pet está perdido')).toBeVisible();
  await expect(page.getByText(/O tutor está procurando Thor desde/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cuidados com Thor' })).toBeVisible();
  await expect(page.getByText('É medroso, não corra atrás.')).toBeVisible();
  await expect(page.getByText('O tutor recebe seu aviso sem que você veja telefone nem endereço.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avisar o tutor' })).toBeVisible();
});

test('/t/ ja avisado por este aparelho: o botao muda o texto e continua avisando', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.jaAvisou}`);
  await expect(page.getByRole('button', { name: 'Avisar o tutor de novo' })).toBeVisible();
});

test('/t/ 429: a espera sai do Retry-After', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.muitasTentativas}`);
  await expect(page.getByText('Tente de novo em 10 minutos.')).toBeVisible();
});

test('/t/ 404, 410 e 429 levam a saida do achado sem plaquinha, sem botao sem destino', async ({ page }) => {
  for (const codigo of [CODIGOS.inexistente, CODIGOS.desativada, CODIGOS.muitasTentativas]) {
    await page.goto(`/t/${codigo}`);
    await expect(page.getByText('Se você está com um animal agora, não precisa do código.')).toBeVisible();
    await expect(page.locator('a[href="#"], a:not([href])')).toHaveCount(0);
  }
});

test('/t/ com JavaScript: avisar mostra "Avisando o tutor…" e um segundo toque nao reenvia', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.avisoLento}`);
  // O estado "enviando" dura so ate a proxima pagina chegar. Um ouvinte posto
  // DEPOIS do script da pagina le o que ele deixou no botao, guarda na sessao
  // (que sobrevive a navegacao) e tenta um segundo envio, que precisa ser barrado.
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[data-envio]')!;
    form.addEventListener('submit', (e) => {
      const botao = form.querySelector('button[type="submit"]')!;
      if (sessionStorage.getItem('primeiro')) {
        sessionStorage.setItem('segundoBarrado', String(e.defaultPrevented));
        return;
      }
      sessionStorage.setItem('primeiro', '1');
      sessionStorage.setItem('ocupado', String(botao.getAttribute('aria-busy')));
      sessionStorage.setItem('anuncio', form.querySelector('[data-anuncio]')?.textContent ?? '');
      setTimeout(() => form.requestSubmit(), 0);
    });
  });
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Não conseguimos avisar o tutor.');
  const guardado = await page.evaluate(() => ({ ...sessionStorage }));
  expect(guardado).toMatchObject({ ocupado: 'true', anuncio: 'Avisando o tutor…', segundoBarrado: 'true' });
  const avisos = (await pedidos(request)).filter((p) => p.operacao === 'createFoundReportFromTag');
  expect(avisos).toHaveLength(1);
});

test('/t/ aviso: a Idempotency-Key e UUID e o X-Forwarded-For chega a API', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Pronto. O tutor de Thor foi avisado.');
  const [aviso] = (await pedidos(request)).filter((p) => p.operacao === 'createFoundReportFromTag');
  expect(aviso?.cabecalhos['idempotency-key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(aviso?.cabecalhos['x-forwarded-for']).toBeTruthy();
});

test('/t/ POST 429: o aviso e confirmado, sem erro tecnico (contrato)', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.avisoNoLimite}`);
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Recebemos o seu aviso.');
});

test('/t/ POST 410: a tag foi desativada entre abrir e avisar', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.avisoDesativada}`);
  await page.getByRole('button', { name: 'Avisar o tutor' }).click();
  await expect(page.locator('h1')).toHaveText('Esta tag foi desativada pelo tutor.');
});

test('/t?codigo= leva ao endereco da tag (Procurar este codigo)', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.malformado}`);
  await page.getByLabel('Código da tag').fill(CODIGOS.inexistente);
  await page.getByRole('button', { name: 'Procurar este código' }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${CODIGOS.inexistente}$`));
  await expect(page.locator('h1')).toHaveText('Esse código não é de nenhuma tag do Bichu.');
});
