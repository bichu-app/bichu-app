/**
 * ISCA (b, parte do serviço): A VITRINE CHEIA NÃO GANHA A DÉCIMA AUTORIZAÇÃO.
 *
 * O teto de nove é cobrado em três lugares, e cada um responde por uma coisa
 * diferente — o que é desenho, e não repetição:
 *
 * 1. **na escrita** (`conferirVitrinePedida`, medido em
 *    `domain/teto-da-vitrine.test.ts`): recusa um corpo com dez fotos;
 * 2. **aqui, no pedido de autorização**: com nove fotos já na vitrine, **nada é
 *    assinado**. Assinar a décima entregaria uma política de escrita válida por
 *    dez minutos que a vitrine nunca vai aceitar — o objeto subiria para o
 *    balde e ficaria lá, pago e invisível, até o varredor passar;
 * 3. **no banco**, pelo `CHECK (position BETWEEN 0 AND 8)` somado à unicidade
 *    por conta: é o que fecha qualquer caminho que contorne os dois primeiros.
 *
 * O teto de BYTES e a lista de tipos não são medidos aqui: eles vivem no
 * preparador, e são medidos contra o preparador de verdade em
 * `media/application/teto-de-bytes-da-vitrine.test.ts`. Um dublê de preparador
 * não tem como recusar tamanho, e um caso que o usasse mediria a si mesmo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VitrineDeFotos } from './vitrine-de-fotos-service.js';
import { TETO_DE_FOTOS_DA_VITRINE } from '../domain/vitrine-de-fotos.js';
import type { PreparadorDeEnvioDeCatalogo } from '../../media/ports/imagem-de-catalogo.js';
import type { VitrineRepository } from '../ports/vitrine-repository.js';
import type { UserId } from '../../../shared/types/brands.js';
import { dataFixa, relogioParado } from '../../../shared/time/relogio-de-teste.js';

const DONO = 'a0000000-0000-7000-8000-000000000001' as UserId;

interface Bancada {
  readonly servico: VitrineDeFotos;
  readonly assinaturas: string[];
}

function montar(vitrineAtual = 0): Bancada {
  const assinaturas: string[] = [];
  const envios: PreparadorDeEnvioDeCatalogo = {
    preparar: (contentType) => {
      assinaturas.push(contentType);
      return Promise.resolve({
        uploadId: '018f7c1e-7a2b-7c3d-9e4f-000000000001',
        chave: 'people/original/AAAAAAAAAAAAAAAAAAAAAA' as never,
        contentType,
        maxBytes: 5 * 1024 * 1024,
        autorizacao: {
          metodo: 'PUT',
          url: 'https://exemplo.invalid/x',
          expiraEm: dataFixa(0),
          maxBytes: 5 * 1024 * 1024,
        } as never,
      });
    },
  };
  const vitrine: VitrineRepository = {
    listar: () =>
      Promise.resolve(
        Array.from({ length: vitrineAtual }, (_, i) => ({
          uploadId: `018f7c1e-7a2b-7c3d-9e4f-${String(i).padStart(12, '0')}`,
          position: i,
          status: 'ready' as const,
          gradeKey: null,
          abertaKey: null,
          rejectionReason: null,
          altText: null,
        })),
      ),
    substituir: () => Promise.resolve([]),
  };
  const servico = new VitrineDeFotos({
    envios,
    vitrine,
    registrarIntencao: () => Promise.resolve(),
    db: {} as never,
    clock: relogioParado(),
  });
  return { servico, assinaturas };
}

async function erroDe(acao: () => Promise<unknown>): Promise<{ status: number; codes: string[] }> {
  try {
    await acao();
  } catch (erro) {
    const e = erro as { status?: number; errors?: readonly { code: string }[] };
    return { status: e.status ?? 0, codes: (e.errors ?? []).map((x) => x.code) };
  }
  throw new Error('A ação deveria ter lançado, e não lançou.');
}

void describe('o pedido de autorização respeita o teto de fotos da vitrine', () => {
  void it(`ISCA -- com a vitrine CHEIA (${String(TETO_DE_FOTOS_DA_VITRINE)}) nada é assinado`, async () => {
    const { servico, assinaturas } = montar(TETO_DE_FOTOS_DA_VITRINE);
    const { status, codes } = await erroDe(() =>
      servico.autorizarEnvio(DONO, { content_type: 'image/jpeg', byte_size: 1024 }),
    );
    assert.equal(status, 400);
    assert.deepEqual(codes, ['maximum']);
    assert.deepEqual(
      assinaturas,
      [],
      'a política assinada que a vitrine nunca aceita deixa o objeto pago e invisível no balde',
    );
  });

  void it(`CONTRAPESO -- com ${String(TETO_DE_FOTOS_DA_VITRINE - 1)} fotos, a próxima AINDA é assinada`, async () => {
    const { servico, assinaturas } = montar(TETO_DE_FOTOS_DA_VITRINE - 1);
    await servico.autorizarEnvio(DONO, { content_type: 'image/jpeg', byte_size: 1024 });
    assert.deepEqual(
      assinaturas,
      ['image/jpeg'],
      `o teto é ${String(TETO_DE_FOTOS_DA_VITRINE)}, e não ${String(TETO_DE_FOTOS_DA_VITRINE - 1)}`,
    );
  });

  void it('CONTRAPESO -- vitrine VAZIA assina sem reclamar: pedir uma é o caso comum', async () => {
    const { servico, assinaturas } = montar(0);
    await servico.autorizarEnvio(DONO, { content_type: 'image/jpeg', byte_size: 1024 });
    assert.deepEqual(assinaturas, ['image/jpeg']);
  });

  void it('ISCA -- dimensão declarada abaixo de 600 responde 422 ANTES de assinar', async () => {
    const { servico, assinaturas } = montar();
    const { status } = await erroDe(() =>
      servico.autorizarEnvio(DONO, {
        content_type: 'image/jpeg',
        byte_size: 1024,
        width: 320,
        height: 320,
      }),
    );
    assert.equal(status, 422);
    assert.deepEqual(
      assinaturas,
      [],
      'recusar depois deixaria política assinada de pé para um arquivo já sabido ruim',
    );
  });

  void it('CONTRAPESO -- 600 x 600 exatamente passa, e dimensão OMITIDA passa', async () => {
    const comDimensao = montar();
    await comDimensao.servico.autorizarEnvio(DONO, {
      content_type: 'image/jpeg',
      byte_size: 1024,
      width: 600,
      height: 600,
    });
    assert.equal(comDimensao.assinaturas.length, 1);

    // Declarar é OPCIONAL, e quem decide de verdade é o worker, nos bytes.
    const semDimensao = montar();
    await semDimensao.servico.autorizarEnvio(DONO, { content_type: 'image/jpeg', byte_size: 1024 });
    assert.equal(semDimensao.assinaturas.length, 1);
  });
});
