// /t/{code} contra o mock do contrato: cada estado, o status HTTP e o que a pagina
// NUNCA mostra (telefone e endereco do tutor nao existem na resposta).
import { test, expect, type Page } from '@playwright/test';
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

// As duas pontas da decisao do cliente de 03/11/2026: o botao de avisar o tutor
// existe SO quando o pet esta marcado como perdido. `CODIGOS.semFoto` e o codigo
// do mock com `lost.is_lost: false` -- o mesmo estado renderizado.
test('/t/ 200: o botao de avisar existe no pet perdido e NAO existe no pet que nao esta perdido', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await expect(page.getByText('Este pet está perdido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avisar o tutor' })).toBeVisible();

  await page.goto(`/t/${CODIGOS.semFoto}`);
  await expect(page.locator('h1')).toHaveText('Thor');
  await expect(page.getByText('Este pet está perdido')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Avisar o tutor/ })).toHaveCount(0);
  await expect(page.locator('form[data-envio]')).toHaveCount(0);
});

test('/t/ 200 nao perdido: a pagina diz que nao esta perdido e o que fazer se parecer que esta', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.semFoto}`);
  await expect(page.getByText('Este pet não está marcado como perdido.')).toBeVisible();
  await expect(page.getByText('O tutor de Thor não avisou que ele saiu de casa.')).toBeVisible();
  await expect(page.getByText(/Se Thor parece perdido/)).toBeVisible();
  await expect(page.getByText(`/t/${CODIGOS.semFoto}`)).toBeVisible();
  await expect(page.getByText('Se o animal estiver machucado ou em perigo agora')).toBeVisible();
  // Nada de formulario de contato: o servidor recusa telefone e e-mail neste caminho.
  await expect(page.locator('input[type="email"], input[type="tel"], textarea')).toHaveCount(0);
});

/**
 * Abre a seção de contato, como a pessoa abre: tocando no `<summary>`.
 *
 * O `<details>` nasce FECHADO para preservar o "é um toque" de quem só quer
 * avisar e ir embora, e por isso todo caso que mexe nos campos passa por aqui.
 * `<summary>` abre sem JavaScript, então isto vale igual no projeto `sem-js`.
 */
async function abrirContato(pagina: Page) {
  await pagina.getByText('Quer que o tutor fale com você?').click();
  await expect(pagina.getByLabel('Seu telefone')).toBeVisible();
}

// ===========================================================================
// O CONTATO DE QUEM ACHOU, SOB CONSENTIMENTO (decisao do cliente, 03/11/2026)
// ===========================================================================
//
// Os campos vivem DENTRO do ramo `estaPerdido` e enviam pelo `<form>` da barra
// de acao, ligados por `form="avisar"` -- HTML puro, sem JavaScript.

test('/t/ perdido: o formulario de contato existe, a caixinha nasce DESMARCADA e o texto gravado aparece inteiro', async ({ page }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);

  // FECHADA no primeiro contato: os campos nao existem na tela antes do toque.
  await expect(page.getByLabel('Seu telefone')).toBeHidden();
  await abrirContato(page);

  await expect(page.getByLabel('Seu nome')).toBeVisible();
  await expect(page.getByLabel('Seu e-mail')).toBeVisible();
  await expect(page.getByLabel('Seu telefone')).toBeVisible();
  await expect(page.getByLabel('Recado para o tutor')).toBeVisible();

  // A caixinha NAO vem marcada: o consentimento e um ato, e caixinha
  // pre-marcada nao e ato nenhum.
  const caixinha = page.getByRole('checkbox', { name: /Aceito compartilhar meus dados/ });
  await expect(caixinha).toBeVisible();
  await expect(caixinha).not.toBeChecked();

  // A finalidade, e o TEXTO QUE FICA GRAVADO, inteiro e sem recorte: o registro
  // afirma que a pessoa leu isto.
  await expect(page.getByText(/o tutor entrar em contato com você e recuperar o pet/)).toBeVisible();
  await expect(page.getByText(/com a finalidade exclusiva de ele entrar em contato comigo/)).toBeVisible();
  await expect(page.getByText(/Compartilhar é opcional/)).toBeVisible();

  // Os campos pertencem ao formulario da barra de acao, e nao a um segundo
  // formulario: dois formularios seriam dois envios.
  await expect(page.locator('#avisar')).toHaveCount(1);
  await expect(page.locator('form')).toHaveCount(1);
  await expect(page.getByLabel('Seu telefone')).toHaveAttribute('form', 'avisar');
});

test('/t/ telefone SEM consentimento: recusa com 400, e o aviso NAO e criado', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await abrirContato(page);
  await page.getByLabel('Seu telefone').fill('11 91234-5678');
  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Avisar o tutor' }).click(),
  ]);
  expect(resposta.status()).toBe(400);

  await expect(page.getByText(/Marque "Aceito compartilhar meus dados com o tutor do pet"/)).toBeVisible();
  // O telefone volta preenchido: a pessoa conserta sem redigitar.
  await expect(page.getByLabel('Seu telefone')).toHaveValue('11 91234-5678');

  // E NADA foi criado. Validar depois do aviso faria o conserto custar um
  // SEGUNDO aviso, com o primeiro ja tendo saido sem o contato.
  const chamadas = await pedidos(request);
  expect(chamadas.filter((p) => p.operacao === 'createFoundReportFromTag')).toEqual([]);
  expect(chamadas.filter((p) => p.operacao === 'enrichFinderFoundReport')).toEqual([]);
});

test('/t/ consentimento sem contato nenhum: recusa, e nada e criado', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await abrirContato(page);
  await page.getByRole('checkbox', { name: /Aceito compartilhar meus dados/ }).check();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Avisar o tutor' }).click(),
  ]);
  await expect(page.getByText(/Preencha seu e-mail ou seu telefone/)).toBeVisible();
  const chamadas = await pedidos(request);
  expect(chamadas.filter((p) => p.operacao === 'createFoundReportFromTag')).toEqual([]);
});

test('/t/ COM consentimento: o corpo leva o ato, a versao e o telefone em E.164', async ({ page, request }) => {
  await page.goto(`/t/${CODIGOS.perdido}`);
  await abrirContato(page);
  await page.getByLabel('Seu nome').fill('Ana Paula');
  await page.getByLabel('Seu e-mail').fill('ana@exemplo.invalid');
  await page.getByLabel('Seu telefone').fill('(11) 91234-5678');
  await page.getByLabel('Recado para o tutor').fill('Ele está comigo, calmo e bem.');
  await page.getByRole('checkbox', { name: /Aceito compartilhar meus dados/ }).check();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Avisar o tutor' }).click(),
  ]);

  await expect(page.locator('h1')).toHaveText('Pronto. O tutor de Thor foi avisado.');
  await expect(page.getByText('O tutor recebeu seu contato junto do aviso')).toBeVisible();

  const chamadas = await pedidos(request);
  const avisou = chamadas.filter((p) => p.operacao === 'createFoundReportFromTag');
  expect(avisou).toHaveLength(1);
  const enriqueceu = chamadas.filter((p) => p.operacao === 'enrichFinderFoundReport');
  expect(enriqueceu).toHaveLength(1);

  const corpo = enriqueceu[0]?.corpo as {
    message?: string;
    finder_contact?: {
      display_name?: string;
      email?: string;
      phone_e164?: string;
      share_consent?: { accepted?: boolean; consent_version?: string };
    };
  };
  expect(corpo.message).toBe('Ele está comigo, calmo e bem.');
  expect(corpo.finder_contact?.display_name).toBe('Ana Paula');
  expect(corpo.finder_contact?.email).toBe('ana@exemplo.invalid');
  // Normalizado: a pessoa digita com parentese e hifen, o contrato exige E.164.
  expect(corpo.finder_contact?.phone_e164).toBe('+5511912345678');
  // O ATO, e a VERSAO do texto que a tela exibiu. Sem os dois o servidor recusa.
  expect(corpo.finder_contact?.share_consent?.accepted).toBe(true);
  expect(corpo.finder_contact?.share_consent?.consent_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // E o token do achador vai no cabecalho, nunca na URL (ADR-0010, item 6).
  expect(enriqueceu[0]?.cabecalhos['authorization']).toMatch(/^Bearer /);
  expect(enriqueceu[0]?.caminho).not.toMatch(/token|phone|email/i);
});

test('/t/ SEM JavaScript: o consentimento e o contato funcionam igual (D31)', async ({ browser, request }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false });
  const pagina = await contexto.newPage();
  try {
    await pagina.goto(`/t/${CODIGOS.perdido}`);
    // `<summary>` abre SEM JavaScript: e o navegador que faz, nao script nosso.
    await abrirContato(pagina);
    await pagina.getByLabel('Seu telefone').fill('11 91234-5678');
    await pagina.getByRole('checkbox', { name: /Aceito compartilhar meus dados/ }).check();
    await pagina.getByRole('button', { name: 'Avisar o tutor' }).click();
    await expect(pagina.locator('h1')).toHaveText('Pronto. O tutor de Thor foi avisado.');

    const enriqueceu = (await pedidos(request)).filter((p) => p.operacao === 'enrichFinderFoundReport');
    expect(enriqueceu, 'sem JS o contato nao chegou: a pagina passou a depender de script').toHaveLength(1);
    const corpo = enriqueceu[0]?.corpo as { finder_contact?: { share_consent?: { accepted?: boolean } } };
    expect(corpo.finder_contact?.share_consent?.accepted).toBe(true);
  } finally {
    await contexto.close();
  }
});
