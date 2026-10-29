/**
 * A GALERIA da entrada do diretorio, na camada de regra (cliente, 29/10/2026:
 * *"implemente a tabela de galeria entao"*).
 *
 * ## AS ISCAS DESTE ARQUIVO, e cada uma foi conferida REPROVANDO
 *
 * Escritas antes do codigo de producao e provadas nos dois sentidos -- com a
 * regra errada no lugar, cada caso reprova; com a regra certa, passa:
 *
 * | o que se poe no codigo de producao | reprova |
 * |---|---|
 * | `images: []` fixo na projecao (galeria ignorada) | 1 |
 * | `url` montada mesmo em `processing` | 1 |
 * | `alt_text` caindo no `display_name` quando nulo | 1 |
 * | `rejection_reason` saindo fora de `rejected` | 1 |
 * | `images: entrada.imagens` (lista) no retrato da trilha | 1 |
 * | `TETO_DE_IMAGENS_DA_GALERIA` em 9 (o `CHECK` do banco vai a 7) | 1 |
 *
 * ## O QUE ESTE ARQUIVO NAO MEDE, E ESTA DITO PARA NAO PARECER MEDIDO
 *
 * - **A ordem.** Quem a decide e o `ORDER BY i.position` do repositorio, e a
 *   projecao NAO reordena de proposito (duas definicoes de "a ordem" divergem
 *   no dia em que uma delas mudar). O caso abaixo confere que a projecao
 *   PRESERVA a ordem que recebeu, que e o que ela promete -- nao que ela ordene.
 * - **A recusa de envio de outro proposito**, que e do caso de uso e tem caso
 *   proprio em `application/galeria-do-parceiro.test.ts`.
 * - **O `CHECK` do banco.** Quem o mede e a suite de integracao.
 */
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
    // `CHECK (position BETWEEN 0 AND 7)` em `professional_images`: 0 a 7 sao
    // oito posicoes. Se esta constante subir, a nona imagem passa por aqui e
    // morre no banco como 500 em vez de `400 too_many_images`.
    assert.equal(TETO_DE_IMAGENS_DA_GALERIA, 8);
  });

  void it('a galeria vazia projeta `[]`, e `[]` e o estado normal', () => {
    // `[]` e nao campo ausente: o contrato declara `images` em `required`, e a
    // tela abre a galeria com zero itens -- que e diferente de "esta resposta
    // nao fala de galeria".
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
    // `source` e sempre `uploaded`: o painel nao escreve URL externa nesta
    // galeria, e `external` so existe em dado de massa da `Loja`.
    assert.equal(projetada.images[0]?.source, 'uploaded');
  });

  void it('em `processing` a URL e NULA, e nao uma URL que daria 404', () => {
    // O intervalo entre confirmar o envio e o worker terminar e normal. A tela
    // mostra o lugar da imagem; uma URL que nao serve seria a pior das duas
    // respostas.
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'processing', publicKey: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.status, 'processing');
    assert.equal(projetada.images[0]?.url, null);
  });

  void it('`ready` sem chave tambem da URL nula: as DUAS condicoes valem', () => {
    // Isca do `&&`: trocar por `||` faria esta linha montar
    // `https://midia.invalido/null`.
    const projetada = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'ready', publicKey: null })]),
      URL_DE_MIDIA,
    );
    assert.equal(projetada.images[0]?.url, null);
  });

  void it('`alt_text` nulo sai NULO, e nunca caindo no nome da entrada', () => {
    // A reserva e de quem DESENHA. Se a leitura do painel caisse no
    // `display_name`, o formulario reabriria com o campo preenchido e quem
    // edita nao teria como distinguir "descrevi com o nome" de "nao descrevi".
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

    // E nao sai fora dela, mesmo que a coluna carregue texto de uma recusa
    // anterior: o motivo descreve o estado ATUAL.
    const pronta = projetarEntradaAdministrativa(
      entrada([imagem({ status: 'ready', rejectionReason: 'motivo velho' })]),
      URL_DE_MIDIA,
    );
    assert.equal(pronta.images[0]?.rejection_reason, null);
  });

  void it('`upload_id` nulo atravessa a projecao: a imagem fica e o painel perde o ponteiro', () => {
    // `catalog_images.upload_intent_id` e `ON DELETE SET NULL`: apagar a conta
    // do painel que enviou deixa a imagem na entrada. O contrato ja declara
    // `[string, 'null']`, e o painel usa o nulo para avisar que a imagem sai se
    // a galeria mudar.
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
    // E a identidade interna da imagem nao aparece em nenhum valor da projecao.
    assert.ok(!JSON.stringify(projetada).includes('0192a3b4-0000-7000-8000-00000000c001'));
  });

  void it('a trilha guarda a QUANTIDADE de fotos, e nunca a chave de objeto', () => {
    // A MESMA regra dos booleanos `logo` e `photo` deste retrato: chave de
    // objeto numa trilha append-only e um ponteiro permanente para um arquivo
    // que pode ser trocado ou retirado.
    const retrato = retratoDaEntrada(entrada([imagem({ position: 0 }), imagem({ position: 1 })]));
    assert.equal(retrato['images'], 2);
    const texto = JSON.stringify(retrato);
    assert.ok(!texto.includes('directory/banner'), `a trilha carrega chave de objeto: ${texto}`);
    assert.ok(!texto.includes('0192a3b4-0000-7000-8000-00000000e001'), texto);
  });

  void it('a galeria vazia e ZERO na trilha, e nao campo ausente', () => {
    // Zero e um valor; ausente faria `diferenca` nao acusar a primeira foto.
    assert.equal(retratoDaEntrada(entrada([]))['images'], 0);
  });
});
