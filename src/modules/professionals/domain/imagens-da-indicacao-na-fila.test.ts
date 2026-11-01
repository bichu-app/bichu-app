import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import { projetarIndicacao, type IndicacaoNaFila } from './fila-de-indicacoes.js';

const CRIADA_EM = Date.UTC(2026, 9, 30, 12, 0, 0) as Instant;

const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

const THUMB_DA_LOGO = 'directory/thumb/ZmFrZS1sb2dvLXRodW1i.webp';
const CARD = (n: number): string => `directory/card/Zm90by1kby1sb2NhbC0${String(n)}.webp`;

function naFila(sobre: Partial<IndicacaoNaFila> = {}): IndicacaoNaFila {
  return {
    ref: 'u7YkQwE2tLm9ZpR4sAbC',
    displayName: 'Clínica do bairro',
    kind: 'clinic',
    entityKind: 'organization',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Bela Vista',
    contatoKind: 'phone',
    contatoValue: '+551130612200',
    note: null,
    reviewStatus: 'pending',
    createdAt: comoData(CRIADA_EM),
    decidedAt: null,
    declineReason: null,
    entradaSlug: null,
    logoThumbKey: null,
    fotoCardKeys: [],
    fotosTotal: 0,
    ...sobre,
  };
}

void describe('as imagens da indicacao na fila do painel', () => {
  void it('as QUATRO fotos saem na ORDEM em que quem indicou as colocou, e a primeira e a capa', () => {
    const projetada = projetarIndicacao(
      naFila({
        fotoCardKeys: [CARD(0), CARD(1), CARD(2), CARD(3)],
        fotosTotal: 4,
      }),
      URL_DE_MIDIA,
    );

    assert.deepEqual(projetada.photo_urls, [
      `https://midia.invalido/${CARD(0)}`,
      `https://midia.invalido/${CARD(1)}`,
      `https://midia.invalido/${CARD(2)}`,
      `https://midia.invalido/${CARD(3)}`,
    ]);
    assert.equal(projetada.photos_total, 4);
  });

  void it('`photos_total` conta as NAO PRONTAS, e e por isso que ele nao e `photo_urls.length`', () => {
    const umaPronta = projetarIndicacao(
      naFila({ fotoCardKeys: [CARD(0)], fotosTotal: 4 }),
      URL_DE_MIDIA,
    );
    assert.equal(umaPronta.photo_urls.length, 1);
    assert.equal(umaPronta.photos_total, 4);

    const nenhumaPronta = projetarIndicacao(naFila({ fotoCardKeys: [], fotosTotal: 4 }), URL_DE_MIDIA);
    assert.deepEqual(nenhumaPronta.photo_urls, []);
    assert.equal(
      nenhumaPronta.photos_total,
      4,
      'REPROVA: "enviou quatro e nenhuma ficou pronta" ficou igual a "nao enviou nenhuma", ' +
        'e o painel perde a diferenca entre dizer "ainda processando" e dizer "sem fotos".',
    );

    const semFoto = projetarIndicacao(naFila(), URL_DE_MIDIA);
    assert.deepEqual(semFoto.photo_urls, []);
    assert.equal(semFoto.photos_total, 0);
  });

  void it('`photo_urls` e LISTA VAZIA e nunca nula, ao contrario de `logo_url`', () => {
    const projetada = projetarIndicacao(naFila(), URL_DE_MIDIA);
    assert.ok(Array.isArray(projetada.photo_urls));
    assert.notEqual(projetada.photo_urls, null);
    assert.equal(projetada.logo_url, null);
  });

  void it('`logo_url` sai da derivada `thumb`, e e nula nos TRES casos que a fila trata igual', () => {
    const comLogo = projetarIndicacao(naFila({ logoThumbKey: THUMB_DA_LOGO }), URL_DE_MIDIA);
    assert.equal(comLogo.logo_url, `https://midia.invalido/${THUMB_DA_LOGO}`);

    assert.equal(projetarIndicacao(naFila({ logoThumbKey: null }), URL_DE_MIDIA).logo_url, null);
  });

  void it('chave que NAO e de derivada publica nao vira URL: a logo vira nula e a foto sai da lista', () => {
    const original = 'directory/original/ZmFrZS1vcmlnaW5hbA.jpeg';
    assert.equal(projetarIndicacao(naFila({ logoThumbKey: original }), URL_DE_MIDIA).logo_url, null);

    const comLixo = projetarIndicacao(
      naFila({ fotoCardKeys: [CARD(0), original, CARD(1)], fotosTotal: 3 }),
      URL_DE_MIDIA,
    );
    assert.deepEqual(comLixo.photo_urls, [
      `https://midia.invalido/${CARD(0)}`,
      `https://midia.invalido/${CARD(1)}`,
    ]);
    assert.equal(
      comLixo.photos_total,
      3,
      'a contagem e das LINHAS da tabela, e nao das URLs que a projecao conseguiu montar',
    );
  });

  void it('NENHUM identificador do banco sai na projecao -- so a URL da derivada', () => {
    const projetada = projetarIndicacao(
      naFila({ logoThumbKey: THUMB_DA_LOGO, fotoCardKeys: [CARD(0), CARD(1)], fotosTotal: 2 }),
      URL_DE_MIDIA,
    );
    const texto = JSON.stringify(projetada);

    for (const proibido of ['image_id', 'logo_image_id', 'suggestion_id', 'upload_id', 'id"']) {
      assert.ok(!texto.includes(proibido), `a projecao carrega ${proibido}: ${texto}`);
    }
    assert.ok(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto),
      `a projecao carrega um UUID: ${texto}`,
    );
    assert.equal(projetada.photo_urls.length, 2);
    assert.ok(projetada.logo_url !== null);
  });

  void it('a base de midia e a INJETADA, e nao uma escrita aqui', () => {
    const outra = projetarIndicacao(
      naFila({ logoThumbKey: THUMB_DA_LOGO, fotoCardKeys: [CARD(0)], fotosTotal: 1 }),
      (chave) => `https://outra.invalido/base/${chave}`,
    );
    assert.equal(outra.logo_url, `https://outra.invalido/base/${THUMB_DA_LOGO}`);
    assert.deepEqual(outra.photo_urls, [`https://outra.invalido/base/${CARD(0)}`]);
  });
});
