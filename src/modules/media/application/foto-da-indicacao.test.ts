import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DbExecutor } from '../../../shared/db/pool.js';
import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import {
  DIMENSAO_MINIMA,
  PROPOSITO_DA_FOTO_DA_INDICACAO,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  type EnvioPreparado,
  type PreparadorDeEnvioDeCatalogo,
  type PropositoDaImagem,
} from '../ports/imagem-de-catalogo.js';
import { FotoDaIndicacao, type CorpoDaIntencaoDaFoto } from './foto-da-indicacao.js';

const AUTOR = '0192a3b4-0000-7000-8000-00000000aaaa' as UserId;
const ID_DO_ENVIO = '0192a3b4-0000-7000-8000-00000000bbbb';
const CHAVE = comoObjectKey('directory/original/0192a3b40000700080000000000000cc');
const EXPIRA_EM = 1_770_000_000_000 as Instant;
const TETO_DE_BYTES = 6_000_000;

const DB = { marcaDoExecutorInjetado: 'o-de-quem-chama' } as unknown as DbExecutor;

const CORPO_BOM: CorpoDaIntencaoDaFoto = {
  content_type: 'image/jpeg',
  byte_size: 900_000,
  width: 1280,
  height: 720,
};

interface IntencaoGravada {
  readonly db: DbExecutor;
  readonly id: string;
  readonly userId: string;
  readonly objectKey: string;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
  readonly purpose: PropositoDaImagem;
}

function bancada() {
  const assinaturas: { contentType: string; byteSize: number; proposito: PropositoDaImagem }[] = [];
  const gravadas: IntencaoGravada[] = [];
  const ordem: ('assinar' | 'gravar')[] = [];

  const envios: PreparadorDeEnvioDeCatalogo = {
    preparar: (contentType: string, byteSize: number, proposito: PropositoDaImagem) => {
      ordem.push('assinar');
      assinaturas.push({ contentType, byteSize, proposito });
      const preparado: EnvioPreparado = {
        uploadId: ID_DO_ENVIO,
        chave: CHAVE,
        contentType,
        maxBytes: TETO_DE_BYTES,
        autorizacao: {
          metodo: 'POST',
          url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
          campos: { key: CHAVE },
          expiraEm: comoData(EXPIRA_EM),
          maxBytes: TETO_DE_BYTES,
        },
      };
      return Promise.resolve(preparado);
    },
  };

  const caso = new FotoDaIndicacao({
    envios,
    registrarIntencao: (db, nova) => {
      ordem.push('gravar');
      gravadas.push({ db, ...nova });
      return Promise.resolve();
    },
    db: DB,
  });

  return { caso, assinaturas, gravadas, ordem };
}

void describe('FotoDaIndicacao.autorizar', () => {
  void it('assina com `directory_suggestion_photo`, e esse e o proposito que vai a gravacao', async () => {
    const { caso, assinaturas, gravadas } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    assert.equal(assinaturas.length, 1);
    assert.equal(assinaturas[0]?.proposito, PROPOSITO_DA_FOTO_DA_INDICACAO);
    assert.equal(gravadas.length, 1);
    assert.equal(gravadas[0]?.purpose, PROPOSITO_DA_FOTO_DA_INDICACAO);
  });

  void it('NAO assina `directory_photo` (painel) nem `directory_suggestion_logo` (logo)', async () => {
    const { caso, assinaturas, gravadas } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    assert.notEqual(assinaturas[0]?.proposito, 'directory_photo');
    assert.notEqual(gravadas[0]?.purpose, 'directory_photo');
    assert.notEqual(assinaturas[0]?.proposito, PROPOSITO_DO_LOGOTIPO_DA_INDICACAO);
    assert.notEqual(gravadas[0]?.purpose, PROPOSITO_DO_LOGOTIPO_DA_INDICACAO);
  });

  void it('entrega a autorizacao do preparador, e o corpo declarado chega inteiro a assinatura', async () => {
    const { caso, assinaturas } = bancada();

    const saida = await caso.autorizar(AUTOR, CORPO_BOM);

    assert.equal(saida.uploadId, ID_DO_ENVIO);
    assert.equal(saida.autorizacao.metodo, 'POST');
    assert.equal(saida.autorizacao.maxBytes, TETO_DE_BYTES);
    assert.deepEqual(saida.autorizacao.expiraEm, comoData(EXPIRA_EM));
    assert.equal(assinaturas[0]?.contentType, CORPO_BOM.content_type);
    assert.equal(assinaturas[0]?.byteSize, CORPO_BOM.byte_size);
  });

  void it('grava a intencao com autor de `users`, os valores do envio e o executor de quem chama', async () => {
    const { caso, gravadas } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    const gravada = gravadas[0];
    assert.ok(gravada);
    assert.equal(gravada.id, ID_DO_ENVIO);
    assert.equal(gravada.userId, AUTOR);
    assert.equal(gravada.objectKey, CHAVE);
    assert.equal(gravada.declaredType, CORPO_BOM.content_type);
    assert.equal(gravada.maxBytes, TETO_DE_BYTES);
    assert.deepEqual(gravada.expiresAt, comoData(EXPIRA_EM));
    assert.equal(gravada.db, DB);
  });

  void it('assina ANTES de gravar, e a gravacao acontece uma vez so', async () => {
    const { caso, ordem } = bancada();

    await caso.autorizar(AUTOR, CORPO_BOM);

    assert.deepEqual(ordem, ['assinar', 'gravar']);
  });

  void it('a minima e 600 x 600, e 512 x 512 -- que passa no logotipo -- reprova aqui', async () => {
    assert.deepEqual(DIMENSAO_MINIMA[PROPOSITO_DA_FOTO_DA_INDICACAO], {
      largura: 600,
      altura: 600,
    });
    const { caso, assinaturas, gravadas } = bancada();

    const erro = await caso.autorizar(AUTOR, { ...CORPO_BOM, width: 512, height: 512 }).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'image-too-small');
    assert.deepEqual(
      (erro.errors ?? []).map((e) => ({ field: e.field, code: e.code })),
      [
        { field: 'width', code: 'minimum' },
        { field: 'height', code: 'minimum' },
      ],
    );
    assert.equal(assinaturas.length, 0);
    assert.equal(gravadas.length, 0);
  });

  void it('recusa a dimensao declarada abaixo da minima SEM assinar nem gravar', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DA_FOTO_DA_INDICACAO];
    const { caso, assinaturas, gravadas, ordem } = bancada();

    const erro = await caso
      .autorizar(AUTOR, { ...CORPO_BOM, width: minima.largura - 1, height: minima.altura - 1 })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'image-too-small');
    assert.deepEqual(ordem, []);
    assert.equal(assinaturas.length, 0);
    assert.equal(gravadas.length, 0);
  });

  void it('recusa quando SO a largura declarada e pequena, nomeando so ela', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DA_FOTO_DA_INDICACAO];
    const { caso, assinaturas } = bancada();

    const erro = await caso.autorizar(AUTOR, { ...CORPO_BOM, width: minima.largura - 1 }).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError);
    assert.deepEqual(
      (erro.errors ?? []).map((e) => e.field),
      ['width'],
    );
    assert.equal(assinaturas.length, 0);
  });

  void it('CONTRAPESO: a dimensao exatamente na minima passa, e a nao declarada tambem', async () => {
    const minima = DIMENSAO_MINIMA[PROPOSITO_DA_FOTO_DA_INDICACAO];

    const noPiso = bancada();
    const saidaNoPiso = await noPiso.caso.autorizar(AUTOR, {
      ...CORPO_BOM,
      width: minima.largura,
      height: minima.altura,
    });
    assert.equal(saidaNoPiso.uploadId, ID_DO_ENVIO);
    assert.equal(noPiso.gravadas.length, 1);

    const semDimensao = bancada();
    const saidaSemDimensao = await semDimensao.caso.autorizar(AUTOR, {
      content_type: CORPO_BOM.content_type,
      byte_size: CORPO_BOM.byte_size,
    });
    assert.equal(saidaSemDimensao.uploadId, ID_DO_ENVIO);
    assert.equal(semDimensao.gravadas.length, 1);
  });

  void it('nao grava intencao nenhuma quando a assinatura falha', async () => {
    const gravadas: IntencaoGravada[] = [];
    const envios: PreparadorDeEnvioDeCatalogo = {
      preparar: () => Promise.reject(new AppError('unsupported-media-type', 'tipo fora da lista')),
    };
    const caso = new FotoDaIndicacao({
      envios,
      registrarIntencao: (db, nova) => {
        gravadas.push({ db, ...nova });
        return Promise.resolve();
      },
      db: DB,
    });

    const erro = await caso.autorizar(AUTOR, CORPO_BOM).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'unsupported-media-type');
    assert.equal(gravadas.length, 0);
  });
});
