import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  projetarEntradaAdministrativa,
  retratoDaEntrada,
  TETO_DE_IMAGENS_DA_GALERIA,
  type EntradaAdministrativa,
  type ImagemDaGaleriaDaEntrada,
} from './escrita-do-diretorio.js';

const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

const NASCEU_EM = Date.UTC(2026, 9, 29, 12, 0, 0) as Instant;

function imagem(extra: Partial<ImagemDaGaleriaDaEntrada> = {}): ImagemDaGaleriaDaEntrada {
  return {
    uploadId: '0192a3b4-0000-7000-8000-00000000e001',
    imageId: '0192a3b4-0000-7000-8000-00000000c001',
    position: 0,
    altText: 'A fachada da clínica',
    status: 'ready',
    publicKey: 'directory/banner/abc.jpeg',
    rejectionReason: null,
    ...extra,
  };
}

function entrada(imagens: readonly ImagemDaGaleriaDaEntrada[]): EntradaAdministrativa {
  return {
    slug: 'clinica-sao-jorge',
    kinds: ['clinic'],
    entityKind: 'professional',
    displayName: 'Clínica Veterinária São Jorge',
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Vila Mariana',
    postalCode: null,
    street: null,
    streetNumber: null,
    complement: null,
    phoneE164: '+551130612200',
    siteUrl: null,
    logo: null,
    photo: null,
    imagens,
    status: 'published',
    source: 'import',
    claimStatus: 'unclaimed',
    verificacoes: [],
    publishedAt: comoData(NASCEU_EM),
    createdAt: comoData(NASCEU_EM),
    updatedAt: comoData(NASCEU_EM),
    version: 3,
  };
}

void describe('a galeria da entrada do diretorio (cliente, 29/10/2026)', () => {
  void it('o teto e OITO, que e o teto do banco e nao um numero redondo', () => {
    assert.equal(TETO_DE_IMAGENS_DA_GALERIA, 8);
  });

  void it('a galeria vazia projeta `[]`, e `[]` e o estado normal', () => {
    const projetada = projetarEntradaAdministrativa(entrada([]), URL_DE_MIDIA);
    assert.deepEqual(projetada.images, []);
  });

  void it('a imagem pronta sai com a URL da derivada, e a ORDEM recebida e preservada', () => {
    const projetada = projetarEntradaAdministrativa(
      entrada([
        imagem({ position: 0, publicKey: 'directory/banner/capa.jpeg' }),
        imagem({
          position: 1,
          imageId: '0192a3b4-0000-7000-8000-00000000c002',
          uploadId: '0192a3b4-0000-7000-8000-00000000e002',
          publicKey: 'directory/banner/dois.jpeg',
        }),
      ]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images.length, 2);
    assert.deepEqual(
      projetada.images.map((i) => i.position),
      [0, 1],
    );
    assert.equal(projetada.images[0]?.url, 'https://midia.invalido/directory/banner/capa.jpeg');
    assert.equal(projetada.images[1]?.url, 'https://midia.invalido/directory/banner/dois.jpeg');
    assert.equal(projetada.images[0]?.source, 'uploaded');
  });

  void it('em `processing` a URL e NULA, e nao uma URL que daria 404', () => {
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'processing', publicKey: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.status, 'processing');
    assert.equal(projetada.images[0]?.url, null);
  });

  void it('`ready` sem chave tambem da URL nula: as DUAS condicoes valem', () => {
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'ready', publicKey: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.url, null);
  });

  void it('`alt_text` nulo sai NULO, e nunca caindo no nome da entrada', () => {
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ altText: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.alt_text, null);
  });

  void it('`rejection_reason` sai SO quando a imagem foi recusada', () => {
    const recusada = projetarEntradaAdministrativa(
      entrada([
        imagem({ status: 'rejected', publicKey: null, rejectionReason: 'imagem pequena demais' }),
      ]),
      URL_DE_MIDIA,
    );
    assert.equal(recusada.images[0]?.rejection_reason, 'imagem pequena demais');

    const pronta = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'ready', rejectionReason: 'motivo velho' })]),
      URL_DE_MIDIA,
    );
    assert.equal(pronta.images[0]?.rejection_reason, null);
  });

  void it('`upload_id` nulo atravessa a projecao: a imagem fica e o painel perde o ponteiro', () => {
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ uploadId: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.upload_id, null);
  });

  void it('a projecao do painel nao entrega `image_id` nenhum (ADR-0010 item 6)', () => {
    const projetada = projetarEntradaAdministrativa(entrada([imagem()]), URL_DE_MIDIA);
    const chaves = Object.keys(projetada.images[0] ?? {});
    assert.ok(!chaves.includes('image_id'), `a projecao carrega ${chaves.join(', ')}`);
    assert.ok(!JSON.stringify(projetada).includes('0192a3b4-0000-7000-8000-00000000c001'));
  });

  void it('a trilha guarda a QUANTIDADE de fotos, e nunca a chave de objeto', () => {
    const retrato = retratoDaEntrada(entrada([imagem({ position: 0 }), imagem({ position: 1 })]));
    assert.equal(retrato['images'], 2);
    const texto = JSON.stringify(retrato);
    assert.ok(!texto.includes('directory/banner'), `a trilha carrega chave de objeto: ${texto}`);
    assert.ok(!texto.includes('0192a3b4-0000-7000-8000-00000000e001'), texto);
  });

  void it('a galeria vazia e ZERO na trilha, e nao campo ausente', () => {
    assert.equal(retratoDaEntrada(entrada([]))['images'], 0);
  });
});
