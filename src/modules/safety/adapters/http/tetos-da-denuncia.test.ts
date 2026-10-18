/**
 * ISCA (d): **OS TRÊS TETOS RECUSAM O EXCEDENTE, COM CONTRAPESO NO LIMITE
 * EXATO.**
 *
 * Os três tetos são de naturezas diferentes, e é por isso que moram em lugares
 * diferentes:
 *
 * | Teto | Onde vive | Por quê |
 * |---|---|---|
 * | 5 denúncias de perfil/dia | `x-rate-limit` da operação | é tráfego |
 * | 20 denúncias/dia no total | `x-rate-limit` com **balde compartilhado** | é tráfego somado entre operações |
 * | 1 denúncia **aberta** por par | índice único **parcial** no banco | é propriedade de DADO, e um teto de requisição não sabe dizer "aberta" |
 *
 * ## O contrapeso no limite exato
 *
 * Teto que recusa é fácil de acertar errado por um: o caso que importa é o que
 * prova que a chamada **número 5** passa e a **6** não. `aplicarTeto` já tem
 * esse caso para as outras rotas; aqui o contrapeso é sobre o balde — a quinta
 * denúncia de perfil ainda está dentro do total de 20, e a vigésima no total
 * ainda passa.
 *
 * ## O caso que pega o defeito real: o BALDE COMPARTILHADO
 *
 * Sem o balde, uma conta faria **5 de perfil + 20 de foto + 20 de publicação** e
 * o teto total que o desenho pediu simplesmente não existiria — cada operação
 * teria o seu. É o único balde compartilhado do app, e sem ele os três números
 * ficam verdes e o teto total é ficção.
 *
 * ## NÃO HÁ TETO POR ALVO, e a ausência é cobrada
 *
 * Quantas pessoas distintas denunciam o mesmo alvo é o SINAL e não o abuso, e um
 * teto por alvo protegeria justamente quem merece fila. Um caso abaixo reprova
 * se alguém acrescentar a dimensão.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { montarChave } from '../../../../shared/http/aplicacao-de-teto.js';
import type { RateLimitEntry } from '../../../../shared/http/route-definition.js';
import {
  rotaDeBloquear,
  rotaDeDenunciarFoto,
  rotaDeDenunciarPerfil,
  rotaDeDenunciarPublicacao,
} from './safety-routes.js';

const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));

/**
 * As entradas de teto de uma rota, no tipo da porta.
 *
 * `defineRoute` preserva os literais, e por isso `rota.rateLimit[0].bucket` nao
 * existe no TIPO quando aquela entrada nao o declara. A leitura aqui e pelo
 * contrato da porta, que e o que a aplicacao de teto le.
 */
function tetos(rota: { readonly rateLimit: readonly unknown[] }): readonly RateLimitEntry[] {
  return rota.rateLimit as readonly RateLimitEntry[];
}

function entradasDoContrato(operationId: string): readonly Record<string, unknown>[] {
  const operacao = contrato.operacoes.get(operationId);
  assert.ok(operacao !== undefined, `${operationId} não está no contrato`);
  const entradas = operacao.raw['x-rate-limit'];
  assert.ok(Array.isArray(entradas), `${operationId} não declara x-rate-limit`);
  return entradas as readonly Record<string, unknown>[];
}

void describe('(d) os três tetos da denúncia', () => {
  void it('perfil: 5 por dia, e é o mais apertado dos três', () => {
    const [proprio] = entradasDoContrato('reportUserProfile');
    assert.equal(proprio?.['limit'], 5);
    assert.equal(proprio?.['window'], '24h');
    assert.deepEqual(proprio?.['dimension'], ['account']);
    // Janela de 24h e não de 1h: o abuso aqui é volume no dia, não rajada no
    // minuto.
    assert.equal(tetos(rotaDeDenunciarPerfil)[0]?.limit, 5);
    assert.equal(tetos(rotaDeDenunciarPerfil)[0]?.window, '24h');
  });

  void it('O CASO QUE IMPORTA: as três somam no MESMO balde, e o total é 20', () => {
    const baldes = [rotaDeDenunciarPerfil, rotaDeDenunciarFoto, rotaDeDenunciarPublicacao].map(
      (rota) => tetos(rota).find((e) => e.bucket !== undefined),
    );
    for (const entrada of baldes) {
      assert.equal(entrada?.bucket, 'community_report');
      assert.equal(entrada?.limit, 20);
      assert.equal(entrada?.window, '24h');
    }

    // E a CHAVE do contador é a mesma nas três. É aqui que o teto total passa a
    // existir de verdade: três chaves diferentes seriam três contadores, e a
    // conta faria 5 + 20 + 20.
    const chaves = new Set(
      [rotaDeDenunciarPerfil, rotaDeDenunciarFoto, rotaDeDenunciarPublicacao].map((rota) => {
        const entrada = tetos(rota).find((e) => e.bucket !== undefined);
        assert.ok(entrada !== undefined);
        return montarChave(rota.operationId, entrada, ['conta-1']);
      }),
    );
    assert.equal(
      chaves.size,
      1,
      `as três operações montam ${String(chaves.size)} chaves: o teto total não existe. ` +
        `Chaves: ${[...chaves].join(' | ')}`,
    );
  });

  void it('ISCA POR DESLIGAMENTO: sem o balde, as chaves se separam', () => {
    // A mesma função, com a entrada SEM `bucket` — que é o que alguém escreveria
    // por descuido. As três chaves ficam diferentes, e é exatamente isso que o
    // caso acima impede de passar em silêncio.
    const semBalde = { dimension: ['account'], limit: 20, window: '24h', onExceed: 'deny_429' } as const;
    const chaves = new Set(
      ['reportUserProfile', 'reportPhoto', 'reportPublication'].map((op) =>
        montarChave(op, semBalde, ['conta-1']),
      ),
    );
    assert.equal(chaves.size, 3, 'a isca precisa produzir três chaves distintas');
  });

  void it('foto e publicação NÃO têm teto próprio, e a diferença é deliberada', () => {
    // Quem abre uma galeria encontra várias fotos de uma vez, e um teto de cinco
    // a faria escolher quais denunciar.
    for (const rota of [rotaDeDenunciarFoto, rotaDeDenunciarPublicacao]) {
      assert.equal(tetos(rota).length, 1, `${rota.operationId} ganhou um teto próprio`);
      assert.equal(tetos(rota)[0]?.bucket, 'community_report');
    }
  });

  void it('NENHUM teto por ALVO, em nenhuma das três', () => {
    // Contra brigada a defesa é PESO (`denunciante_ordena_a_fila`), não teto: um
    // teto por alvo protegeria justamente quem merece fila, porque quantas
    // pessoas distintas denunciam o mesmo alvo é o SINAL e não o abuso.
    for (const rota of [rotaDeDenunciarPerfil, rotaDeDenunciarFoto, rotaDeDenunciarPublicacao]) {
      for (const entrada of tetos(rota)) {
        assert.deepEqual(
          [...entrada.dimension],
          ['account'],
          `${rota.operationId} ganhou uma dimensão de alvo: a defesa contra brigada virou teto`,
        );
      }
    }
  });

  void it('1 denúncia ABERTA por par: índice único PARCIAL nas três tabelas', () => {
    const arquivo = readdirSync('migrations').find((n) => n.includes('denunciar-perfil-foto-e-publicacao'));
    assert.ok(arquivo !== undefined, 'a migração das denúncias sumiu');
    const texto = readFileSync(join('migrations', arquivo), 'utf8');

    // PARCIAL e não incondicional: resolvida, a denúncia LIBERA o par, e um
    // abuso novo depois da decisão é um item de fila novo. Impedir para sempre
    // daria a quem errou uma imunidade.
    for (const [indice, colunas] of [
      ['profile_reports_uma_aberta_por_par', '(subject_ref, reporter_user_id)'],
      ['photo_reports_uma_aberta_por_par', '(image_public_key, reporter_user_id)'],
      ['publication_reports_uma_aberta_por_par', '(publication_ref, reporter_user_id)'],
    ] as const) {
      const re = new RegExp(
        `CREATE UNIQUE INDEX ${indice}\\s+ON \\w+ ${colunas.replace(/[()]/g, '\\$&')}\\s+WHERE resolved_at IS NULL`,
      );
      assert.match(texto, re, `${indice} não é único E parcial sobre ${colunas}`);
    }
  });

  void it('a repetição SOMA em vez de duplicar, e o `ON CONFLICT` casa o índice parcial', () => {
    const fonte = readFileSync(
      join('src', 'modules', 'safety', 'adapters', 'persistence', 'kysely-safety-repository.ts'),
      'utf8',
    );
    // Sem o `WHERE resolved_at IS NULL` no `ON CONFLICT`, o Postgres não casa o
    // índice parcial e a segunda denúncia estoura em vez de somar.
    assert.equal(
      (fonte.match(/ON CONFLICT \([^)]+\) WHERE resolved_at IS NULL DO UPDATE SET/g) ?? []).length,
      3,
      'alguma das três escritas deixou de casar o índice parcial no ON CONFLICT',
    );
    assert.equal((fonte.match(/repeat_count\s*=\s*\w+\.repeat_count \+ 1/g) ?? []).length, 3);
  });

  void it('bloquear tem teto GENEROSO, e o número é deliberado', () => {
    // Bloquear é a ação de ALÍVIO desta fatia: quem está sendo assediado por
    // várias contas precisa poder bloquear todas, e um teto apertado puniria a
    // vítima.
    assert.equal(tetos(rotaDeBloquear)[0]?.limit, 60);
    assert.equal(tetos(rotaDeBloquear)[0]?.bucket, undefined);
  });
});
