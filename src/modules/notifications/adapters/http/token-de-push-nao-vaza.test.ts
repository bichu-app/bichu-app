/** O token de push não atravessa a borda de saída, em resposta nenhuma. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  inspecionarContrato,
  lerColunasQueNaoSaem,
} from '../../../../tools/portao-colunas-que-nao-saem.js';
import { ehOperacaoSemConta } from '../../../../tools/portao-contrato-publico.js';
import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';
const CAMINHO_DA_ROTA = 'src/modules/notifications/adapters/http/device-routes.ts';

/** `push_token text` na migração, com ou sem espaço, em qualquer arquivo. */
const COLUNA_DE_TOKEN = /^\s*(push_token)\s+text\b/gim;

/** O nome da coluna do token, lido do disco. */
function colunasDeToken(): readonly string[] {
  const diretorio = 'migrations';
  const achadas: string[] = [];
  for (const arquivo of readdirSync(diretorio)) {
    if (!arquivo.endsWith('.sql')) continue;
    const conteudo = readFileSync(join(diretorio, arquivo), 'utf8');
    for (const achado of conteudo.matchAll(COLUNA_DE_TOKEN)) {
      const nome = achado[1];
      if (nome !== undefined && !achadas.includes(nome)) achadas.push(nome);
    }
  }
  return achadas;
}

/** As respostas do contrato, embrulhadas na forma que `inspecionarContrato` lê. */
function respostasComoSpec(contrato: Contrato): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operacao of contrato.operacoes.values()) {
    const respostas = (operacao.raw['responses'] ?? {}) as Record<string, unknown>;
    const conteudo: Record<string, unknown> = {};
    for (const status of Object.keys(respostas)) {
      const schema = contrato.responseSchema(operacao.operationId, status);
      if (schema === undefined) continue;
      conteudo[status] = { content: { 'application/json': { schema } } };
    }
    paths[`/${operacao.operationId}`] = {
      get: { operationId: operacao.operationId, responses: conteudo },
    };
  }
  return { paths };
}

void describe('o alvo existe, e a ausência dele é reprovação', () => {
  void it('a migração da BICHUS-91 declara a coluna do token', () => {
    assert.deepEqual(
      colunasDeToken(),
      ['push_token'],
      'a coluna do token de push sumiu da migração, ou a forma da declaração mudou. ' +
        'Nos dois casos este arquivo passaria a aprovar tudo, e é por isso que ele ' +
        'reprova aqui.',
    );
  });

  void it('a varredura das respostas enxerga alguma coisa, e não um objeto vazio', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const montada = respostasComoSpec(contrato) as { paths: Record<string, unknown> };
    assert.ok(
      Object.keys(montada.paths).length > 20,
      `a montagem das respostas achou ${String(Object.keys(montada.paths).length)} operações. ` +
        'Filtro que não filtra termina verde e ninguém desconfia.',
    );
    const achados = inspecionarContrato(montada, new Set(['push_permission']));
    assert.ok(
      achados.length > 0,
      'a montagem não alcançou nem `push_permission`, que o contrato declara em ' +
        '`Device`: ela parou de percorrer as respostas.',
    );
  });
});

void describe('a coluna NÃO carrega a marca do portão de saída, e isso é verificado', () => {
  void it('`push_token` não aparece na lista de colunas marcadas', () => {
    const migracoes = readdirSync('migrations')
      .filter((nome) => nome.endsWith('.sql'))
      .map((nome) => ({ caminho: nome, conteudo: readFileSync(join('migrations', nome), 'utf8') }));

    const marcadas = lerColunasQueNaoSaem(migracoes).map((coluna) => coluna.coluna);
    assert.ok(
      marcadas.length > 0,
      'nenhuma coluna marcada em migração nenhuma: o portão de saída ficou sem lista e ' +
        'passa a aprovar tudo calado. Não é este arquivo que conserta, mas é aqui que aparece.',
    );
    assert.ok(
      !marcadas.includes('push_token'),
      '`push_token` entrou na lista de colunas marcadas como "não saem". Se foi de ' +
        'propósito, o portão vai reprovar `DeviceRegistration` (que é ENTRADA e está ' +
        'certa) e todo arquivo de `src/` que grava a coluna. Se foi a frase do ' +
        'comentário, reescreva-a: o portão casa o texto, não a intenção.',
    );
  });
});

void describe('o token de push não aparece em RESPOSTA nenhuma do contrato', () => {
  void it('zero ocorrências, em qualquer operação e qualquer status', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const proibidas = new Set(colunasDeToken());
    const achados = inspecionarContrato(respostasComoSpec(contrato), proibidas);
    assert.deepEqual(
      achados.map((a) => `${a.onde}: ${a.coluna}`),
      [],
      'o token de push entrou numa resposta do contrato. Ele é credencial de ENTREGA: ' +
        'quem o tem manda notificação para aquele aparelho.',
    );
  });

  void it('ISCA: a mesma varredura ACUSA quando o token está numa resposta', () => {
    const proibidas = new Set(colunasDeToken());
    const iscaDoContrato = parseYaml(`
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /isca:
    get:
      operationId: iscaQueDeveReprovar
      security:
        - bearerAuth: []
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  ${[...proibidas][0] ?? 'push_token'}: { type: string }
                  inocente: { type: string }
`) as Record<string, unknown>;

    const achados = inspecionarContrato(iscaDoContrato, proibidas);
    assert.ok(
      achados.length > 0,
      'a isca passou: a varredura do portão parou de enxergar a coluna em resposta, ' +
        'e a partir daí o caso anterior estaria medindo o silêncio dela',
    );
  });

  void it('`DeviceRegistration` continua declarando o token na ENTRADA', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const corpo = contrato.requestBodySchema('registerDevice');
    assert.ok(corpo !== undefined, '`registerDevice` perdeu o corpo de requisição');
    const propriedades = (corpo['properties'] ?? {}) as Record<string, unknown>;
    assert.ok(
      'push_token' in propriedades,
      '`DeviceRegistration` deixou de declarar `push_token`: não há mais caminho para ' +
        'o token entrar, e o push inteiro deixa de ter endereço.',
    );
  });
});

void describe('a rota monta a resposta campo a campo, e não por espalhamento', () => {
  void it('`device-routes.ts` não espalha o objeto do domínio numa resposta', () => {
    const fonte = readFileSync(CAMINHO_DA_ROTA, 'utf8');
    const semComentarios = fonte.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(
      semComentarios,
      /\.\.\.\s*aparelho\b/,
      `${CAMINHO_DA_ROTA} espalha o objeto do domínio numa resposta. A montagem é campo ` +
        'a campo de propósito: é a única coisa que separa `push_token` do fio.',
    );
  });

  void it('a rota não cita `pushToken` fora da leitura do corpo da requisição', () => {
    const fonte = readFileSync(CAMINHO_DA_ROTA, 'utf8');
    const semComentarios = fonte.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
    const citacoes = [...semComentarios.matchAll(/pushToken/g)];
    assert.equal(
      citacoes.length,
      1,
      `${CAMINHO_DA_ROTA} cita \`pushToken\` ${String(citacoes.length)} vezes. A única ` +
        'citação legítima é a que traduz o corpo da requisição para o domínio; qualquer ' +
        'outra está no caminho da saída.',
    );
  });

  void it('ISCA: a mesma varredura ACUSA um arquivo que espalha o domínio', () => {
    const iscaDeCodigo = `
      function comoResposta(aparelho) { return { ...aparelho }; }
    `;
    assert.match(
      iscaDeCodigo.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, ''),
      /\.\.\.\s*aparelho\b/,
      'a varredura passou num arquivo que espalha o objeto do domínio: ela parou de ' +
        'enxergar, e o caso anterior virou silêncio',
    );
  });
});

void describe('as rotas do aparelho exigem sessão', () => {
  void it('listDevices, registerDevice e deleteDevice não são públicas', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    for (const id of ['listDevices', 'registerDevice', 'deleteDevice']) {
      const operacao = contrato.operacoes.get(id);
      assert.ok(operacao !== undefined, `${id} sumiu do contrato`);
      assert.equal(
        ehOperacaoSemConta(operacao),
        false,
        `${id} virou operação sem conta: a lista de aparelhos de alguém passou a sair ` +
          'para quem não tem sessão, e com ela o identificador de cada um.',
      );
      assert.ok(
        operacao.securitySchemes.includes('bearerAuth'),
        `${id} deixou de exigir bearerAuth`,
      );
    }
  });
});
