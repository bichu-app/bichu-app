/** A decisão 200 ou 410 da leitura pública do caso, sem servidor e sem banco. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../shared/types/brands.js';
import { comoData } from '../../../shared/time/clock.js';
import type { CasoPublico, LeituraPublicaDoCaso } from '../ports/leitura-publica-do-caso.js';
import { LeituraPublicaDoCasoService } from './leitura-publica-do-caso.js';

const TOKEN = 'k3J9-share-token-opaco-0001';
/** 2026-09-20T18:30:00.000Z */
const VISTO_EM = 1_789_929_000_000 as Instant;
const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

function caso(parcial: Partial<CasoPublico> = {}): CasoPublico {
  return {
    shareToken: TOKEN,
    aberto: true,
    reencontrado: false,
    petNome: 'Thor',
    especie: 'dog',
    porte: 'M',
    racaRotulo: null,
    corRotulo: null,
    marcas: null,
    cuidados: null,
    descricao: null,
    vistoPorUltimoEm: comoData(VISTO_EM),
    cidade: 'São Paulo',
    bairro: null,
    chaveDaFoto: null,
    doChamador: false,
    ...parcial,
  };
}

function servico(
  resposta: CasoPublico | undefined,
  chamadas: { token: string; chamador: UserId | undefined }[] = [],
): LeituraPublicaDoCasoService {
  const porta: LeituraPublicaDoCaso = {
    porShareToken: (token, chamador) => {
      chamadas.push({ token, chamador });
      return Promise.resolve(resposta);
    },
  };
  return new LeituraPublicaDoCasoService(porta, {
    baseDaWeb: 'https://web.exemplo.invalid' as AbsoluteUrl,
    baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
  });
}

async function problemaDe(promessa: Promise<unknown>): Promise<AppError> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  assert.fail('esperava um problema, e a leitura respondeu 200');
}

void describe('leitura pública do caso: 200 ou 410', () => {
  void it('caso aberto devolve a projeção', async () => {
    const corpo = await servico(caso()).caso(TOKEN, undefined);
    assert.equal(corpo.share_token, TOKEN);
  });

  void it('caso encerrado responde 410 com next_action', async () => {
    const problema = await problemaDe(servico(caso({ aberto: false })).caso(TOKEN, undefined));
    assert.equal(problema.status, 410);
    assert.equal(problema.problemType, 'lost-case-closed');
    assert.equal(problema.nextAction, 'register_stray_found_report');
  });

  void it('token inexistente responde o MESMO 410, e não 404', async () => {
    const inexistente = await problemaDe(servico(undefined).caso(TOKEN, undefined));
    const encerrado = await problemaDe(servico(caso({ aberto: false })).caso(TOKEN, undefined));
    assert.deepEqual(
      [inexistente.status, inexistente.problemType, inexistente.title, inexistente.detail, inexistente.nextAction],
      [encerrado.status, encerrado.problemType, encerrado.title, encerrado.detail, encerrado.nextAction],
    );
  });

  void it('o cartaz segue a mesma regra', async () => {
    assert.equal((await problemaDe(servico(undefined).cartaz(TOKEN))).status, 410);
    assert.equal((await problemaDe(servico(caso({ aberto: false })).cartaz(TOKEN))).status, 410);
    assert.equal((await servico(caso()).cartaz(TOKEN)).pet_display_name, 'Thor');
  });

  void it('o chamador vai à porta só para calcular doChamador', async () => {
    const chamadas: { token: string; chamador: UserId | undefined }[] = [];
    await servico(caso({ doChamador: true }), chamadas).caso(TOKEN, TUTOR);
    assert.deepEqual(chamadas, [{ token: TOKEN, chamador: TUTOR }]);
  });

  void it('o cartaz não depende de quem chama: a porta recebe chamador indefinido', async () => {
    const chamadas: { token: string; chamador: UserId | undefined }[] = [];
    await servico(caso(), chamadas).cartaz(TOKEN);
    assert.deepEqual(chamadas, [{ token: TOKEN, chamador: undefined }]);
  });
});

/** O SEGUNDO 410 da página: `lost-case-reunited`, e só ele. */
void describe('o reencontrado é o único dos cinco que ganha nome', () => {
  void it('o caso reencontrado agradece, e SEM next_action', async () => {
    const problema = await problemaDe(
      servico(caso({ aberto: false, reencontrado: true })).caso(TOKEN, undefined),
    );
    assert.equal(problema.status, 410);
    assert.equal(problema.problemType, 'lost-case-reunited');
    assert.equal(
      problema.nextAction,
      undefined,
      'REPROVA: a página de agradecimento oferece uma saída. O animal está em ' +
        'casa, quem leu não tem achado nenhum para registrar, e empurrá-la ao ' +
        'formulário de achado era LITERALMENTE o defeito que o cliente relatou ' +
        'três vezes.',
    );
  });

  void it('os outros quatro motivos saem no MESMO corpo de sempre', async () => {
    const fundidos = [
      { rotulo: 'encerrado, excluído, falecido ou arquivado', caso: caso({ aberto: false }) },
      { rotulo: 'token desconhecido', caso: undefined },
    ];

    for (const { rotulo, caso: entrada } of fundidos) {
      const problema = await problemaDe(servico(entrada).caso(TOKEN, undefined));
      assert.deepEqual(
        [problema.status, problema.problemType, problema.nextAction],
        [410, 'lost-case-closed', 'register_stray_found_report'],
        `REPROVA: ${rotulo} deixou de responder o 410 fundido. Quem recebe ` +
          '`lost-case-closed` tem de continuar sabendo exatamente o que sabia ' +
          'antes de 28/10/2026 -- nada.',
      );
    }
  });

  void it('o token desconhecido é indistinguível do encerrado, campo por campo', async () => {
    const inexistente = await problemaDe(servico(undefined).caso(TOKEN, undefined));
    const encerrado = await problemaDe(servico(caso({ aberto: false })).caso(TOKEN, undefined));
    assert.deepEqual(
      [inexistente.problemType, inexistente.title, inexistente.detail, inexistente.nextAction],
      [encerrado.problemType, encerrado.title, encerrado.detail, encerrado.nextAction],
    );
  });

  void it('o CARTAZ nunca agradece, nem com o caso reencontrado na mão', async () => {
    const problema = await problemaDe(
      servico(caso({ aberto: false, reencontrado: true })).cartaz(TOKEN),
    );
    assert.equal(
      problema.problemType,
      'lost-case-closed',
      'REPROVA: o cartaz emitiu `lost-case-reunited`, que ele não declara no ' +
        'contrato. Resposta que a rota emite tem de estar declarada.',
    );
  });

  void it('o agradecimento não carrega nome do pet, data nem quem achou', async () => {
    const problema = await problemaDe(
      servico(caso({ aberto: false, reencontrado: true, petNome: 'Thor' })).caso(TOKEN, undefined),
    );
    const corpo = `${problema.title} ${problema.detail ?? ''}`;
    for (const proibido of ['Thor', TOKEN, '2026', 'achou', 'encontrou por']) {
      assert.equal(
        corpo.includes(proibido),
        false,
        `REPROVA: o corpo do agradecimento traz \`${proibido}\`. O único fato ` +
          'autorizado é "este caso terminou porque o animal voltou".',
      );
    }
  });
});
