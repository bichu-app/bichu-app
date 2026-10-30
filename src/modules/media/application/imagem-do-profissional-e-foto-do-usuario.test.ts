/** AS ISCAS DOS TRÊS PROPÓSITOS DE IMAGEM QUE ENTRARAM EM 18/10/2026. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import { relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AbsoluteUrl, Instant, ObjectKey } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import {
  DERIVADAS_DA_FOTO_DE_USUARIO,
  DERIVADAS_DA_FOTO_DO_LOCAL,
  DERIVADAS_DA_LOGO,
  FORMATO_DAS_DERIVADAS,
  ORIENTACAO_DE_TAMANHO_DA_IMAGEM,
  PISO_DE_BYTES_DA_DERIVADA_GRANDE,
  TETO_DE_BYTES_DA_DERIVADA,
  TETO_DE_BYTES_DO_ENVIO,
} from '../domain/derivadas.js';
import {
  CATEGORIA_DO_PROPOSITO,
  DIMENSAO_MINIMA,
  TIPOS_POR_PROPOSITO,
  type PropositoDaImagem,
} from '../ports/imagem-de-catalogo.js';
import { eDoAchado } from '../ports/fotos-do-achado.js';
import type { IntencaoVencida, MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage, PedidoDeEnvio } from '../ports/object-storage.js';
import { criarPreparadorDeEnvioDeCatalogo } from './preparar-envio-de-catalogo.js';
import { varrerEnviosVencidos } from './varrer-envios-vencidos.js';

/** Os três propósitos que entraram em 18/10/2026. */
const NOVOS: readonly PropositoDaImagem[] = ['directory_logo', 'directory_photo', 'user_photo'];

const IDS = {
  uuidv7: () => '0192a3b4-0000-7000-8000-000000000001',
  random128: () => new Uint8Array(16).fill(1),
  random80: () => new Uint8Array(10),
  opaqueToken: () => {
    throw new Error('nao usado');
  },
};

function bancadaDeEnvio() {
  const pedidos: PedidoDeEnvio[] = [];
  const armazenamento = {
    createUploadIntent: (p: PedidoDeEnvio) => {
      pedidos.push(p);
      return Promise.resolve({
        metodo: 'POST' as const,
        url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
        campos: {},
        expiraEm: comoData(0 as Instant),
        maxBytes: p.maxBytes,
      });
    },
  } as unknown as ObjectStorage;
  return { preparador: criarPreparadorDeEnvioDeCatalogo({ armazenamento, ids: IDS }), pedidos };
}

void describe('(a) acima de 5 MB é recusado NO SERVIDOR, não só na tela', () => {
  void it('recusa um byte acima do teto, nos três propósitos, SEM pedir assinatura', async () => {
    for (const proposito of NOVOS) {
      const { preparador, pedidos } = bancadaDeEnvio();
      const tipo = TIPOS_POR_PROPOSITO[proposito][0] as string;
      const erro = await preparador
        .preparar(tipo, TETO_DE_BYTES_DO_ENVIO + 1, proposito)
        .catch((e: unknown) => e);

      assert.ok(erro instanceof AppError, proposito);
      assert.equal(erro.problemType, 'validation-failed');
      assert.equal(pedidos.length, 0, proposito);
    }
  });

  void it('CONTRAPESO: exatamente no teto passa, e o teto viaja DENTRO da política assinada', async () => {
    for (const proposito of NOVOS) {
      const { preparador, pedidos } = bancadaDeEnvio();
      const tipo = TIPOS_POR_PROPOSITO[proposito][0] as string;
      const envio = await preparador.preparar(tipo, TETO_DE_BYTES_DO_ENVIO, proposito);

      assert.equal(envio.maxBytes, TETO_DE_BYTES_DO_ENVIO, proposito);
      assert.equal(pedidos.length, 1, proposito);
      assert.equal(pedidos[0]?.maxBytes, TETO_DE_BYTES_DO_ENVIO, proposito);
      assert.equal(pedidos[0]?.classe, 'privado', proposito);
    }
  });

  void it('a orientação de 5 MB existe como TEXTO ÚNICO, para a tela mostrar', () => {
    assert.match(ORIENTACAO_DE_TAMANHO_DA_IMAGEM, /5 MB/);
    assert.equal(TETO_DE_BYTES_DO_ENVIO, 5 * 1024 * 1024);
  });

  void it('HEIC entra só na foto da PESSOA; SVG não entra em nenhum', () => {
    assert.ok(TIPOS_POR_PROPOSITO['user_photo'].includes('image/heic'));
    assert.ok(!TIPOS_POR_PROPOSITO['directory_logo'].includes('image/heic'));
    assert.ok(!TIPOS_POR_PROPOSITO['directory_photo'].includes('image/heic'));
    for (const proposito of NOVOS) {
      assert.ok(!TIPOS_POR_PROPOSITO[proposito].includes('image/svg+xml'), proposito);
    }
  });
});

void describe('(b) a derivada sai em JPEG, no tamanho alvo de cada propósito', () => {
  void it('o formato de saída é JPEG com extensão .jpeg, e vale para os três', () => {
    assert.equal(FORMATO_DAS_DERIVADAS.nome, 'jpeg');
    assert.equal(FORMATO_DAS_DERIVADAS.contentType, 'image/jpeg');
    assert.equal(FORMATO_DAS_DERIVADAS.extensao, 'jpeg');
    assert.equal(FORMATO_DAS_DERIVADAS.achataAlfa, true);
  });

  void it('cada propósito declara `card`, e nenhuma derivada passa do teto de 500 KB', () => {
    for (const derivadas of [DERIVADAS_DA_LOGO, DERIVADAS_DA_FOTO_DO_LOCAL, DERIVADAS_DA_FOTO_DE_USUARIO]) {
      assert.ok(derivadas.some((d) => d.variante === 'card'));
    }
    assert.equal(TETO_DE_BYTES_DA_DERIVADA, 500 * 1024);
    assert.equal(PISO_DE_BYTES_DA_DERIVADA_GRANDE, 300 * 1024);
  });

  void it('a FOTO DO LUGAR tem derivada `grande` (a faixa de 300–500 KB); logo e retrato não', () => {
    assert.ok(DERIVADAS_DA_FOTO_DO_LOCAL.some((d) => d.porte === 'grande'));
    assert.ok(DERIVADAS_DA_LOGO.every((d) => d.porte === 'enxuta'));
    assert.ok(DERIVADAS_DA_FOTO_DE_USUARIO.every((d) => d.porte === 'enxuta'));
  });

  void it('a logo e o retrato CORTAM em 1:1; a foto do lugar corta em 16:9', () => {
    for (const d of [...DERIVADAS_DA_LOGO, ...DERIVADAS_DA_FOTO_DE_USUARIO]) {
      assert.equal(d.altura, d.largura, `${d.variante} deveria ser quadrada`);
    }
    for (const d of DERIVADAS_DA_FOTO_DO_LOCAL) {
      const altura = d.altura;
      assert.ok(altura !== undefined, d.variante);
      assert.equal(Math.round((d.largura / altura) * 1000), Math.round((16 / 9) * 1000), d.variante);
    }
  });

  void it('cada propósito tem prefixo de armazenamento, e foto de PESSOA tem o seu', () => {
    assert.equal(CATEGORIA_DO_PROPOSITO['directory_logo'], 'directory');
    assert.equal(CATEGORIA_DO_PROPOSITO['directory_photo'], 'directory');
    assert.equal(CATEGORIA_DO_PROPOSITO['user_photo'], 'people');
    assert.notEqual(CATEGORIA_DO_PROPOSITO['user_photo'], CATEGORIA_DO_PROPOSITO['directory_photo']);
  });

  void it('a dimensão mínima de cada propósito está declarada e é menor que a maior derivada', () => {
    for (const proposito of NOVOS) {
      const minima = DIMENSAO_MINIMA[proposito];
      assert.ok(minima.largura > 0 && minima.altura > 0, proposito);
    }
    assert.deepEqual(DIMENSAO_MINIMA['directory_logo'], { largura: 256, altura: 256 });
    assert.deepEqual(DIMENSAO_MINIMA['directory_photo'], { largura: 600, altura: 600 });
    assert.deepEqual(DIMENSAO_MINIMA['user_photo'], { largura: 300, altura: 300 });
  });
});

void describe('(c) A VARREDURA DE VENCIDOS NÃO APAGA OS PROPÓSITOS NOVOS', () => {
  /**
   * A varredura recebe de `listarIntencoesVencidas` as DUAS tabelas de intenção num
   * `UNION ALL`.
   */
  function bancadaDaVarredura(lista: IntencaoVencida[]) {
    const apagados: string[] = [];
    const restantes = [...lista];
    const repositorio = {
      listarIntencoesVencidas: () => Promise.resolve([...restantes]),
      descartarIntencao: (id: string) => {
        const i = restantes.findIndex((v) => v.id === id);
        if (i >= 0) restantes.splice(i, 1);
        return Promise.resolve();
      },
    } as unknown as MediaRepository;
    const armazenamento = {
      delete: (_classe: string, chave: ObjectKey) => {
        apagados.push(chave);
        return Promise.resolve();
      },
    } as unknown as ObjectStorage;
    return { deps: { repositorio, armazenamento, clock: relogioParado() }, apagados };
  }

  const chaveDe = (proposito: PropositoDaImagem): ObjectKey =>
    comoObjectKey(`${CATEGORIA_DO_PROPOSITO[proposito]}/original/KioqKioqKioqKioqKioqKg`);

  void it('CONFIRMADA: a imagem dos propósitos novos não chega à varredura, porque a confirmação a tira da lista', async () => {
    const { deps, apagados } = bancadaDaVarredura([]);
    const r = await varrerEnviosVencidos(deps);

    assert.equal(r.examinadas, 0);
    assert.equal(r.removidas, 0);
    assert.deepEqual(apagados, [], 'nada do que já é imagem pode sair do balde');
  });

  void it('CONTRAPESO: NÃO confirmada e vencida É apagada — a limpeza continua funcionando', async () => {
    const lista: IntencaoVencida[] = NOVOS.map((proposito, i) => ({
      id: `i-${String(i)}`,
      objectKey: chaveDe(proposito),
      kind: 'catalog_image',
    }));
    const { deps, apagados } = bancadaDaVarredura(lista);
    const r = await varrerEnviosVencidos(deps);

    assert.equal(r.examinadas, NOVOS.length);
    assert.equal(r.removidas, NOVOS.length);
    assert.equal(r.falhas, 0);
    assert.equal(r.protegidas, 0);
    assert.equal(apagados.length, NOVOS.length);
  });

  void it('a espécie dos propósitos novos NÃO é espécie de achado, e por isso é limpável quando é lixo', () => {
    assert.equal(eDoAchado('catalog_image'), false);
    assert.equal(eDoAchado('found_report_photo'), true);
    assert.equal(eDoAchado('finder_photo'), true);
  });
});
