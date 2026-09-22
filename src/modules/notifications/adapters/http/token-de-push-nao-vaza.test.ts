/**
 * O token de push não atravessa a borda de saída, em resposta nenhuma.
 *
 * ## Por que este arquivo existe
 *
 * `push_token` é **credencial de entrega**: quem o tem, junto da credencial do
 * projeto FCM, manda notificação para aquele aparelho — e notificação aparece
 * na tela bloqueada, ao lado de quem estiver junto da pessoa. Ele entra no
 * sistema pelo corpo de `POST /v1/me/devices` e não pode sair por lugar nenhum,
 * nem para o próprio dono: o dono já o tem, e devolvê-lo só acrescenta cópias
 * em log de proxy, em histórico de ferramenta e na tela de quem depura.
 *
 * ## Por que a coluna não leva a marca `NUNCA sai do servidor`
 *
 * A marca de `src/tools/portao-colunas-que-nao-saem.ts` parece feita para este
 * caso, e não serve — pelo mesmo motivo estrutural que fez a BICHUS-92 não
 * marcar `reference_point`, com um detalhe a mais:
 *
 * - aquele portão percorre o contrato INTEIRO, e o percurso de `components` não
 *   distingue requisição de resposta. `DeviceRegistration.push_token` é campo
 *   de **entrada**, e precisa ser: é por ele que o token chega. Marcar a coluna
 *   reprovaria o portão por um campo que está certo;
 * - o mesmo portão reprova o nome em QUALQUER arquivo de `src/`, e o adaptador
 *   de persistência precisa escrever `push_token` para gravar a coluna. Marcar
 *   obrigaria o adaptador a entrar na lista de dispensa, que é o furo que o
 *   portão existe para impedir.
 *
 * Em lugar da marca, esta conferência — que é mais estreita e, por ser mais
 * estreita, é a que de fato responde a pergunta: **o nome aparece em alguma
 * RESPOSTA?**
 *
 * Três coisas fazem este arquivo valer mais que uma revisão atenta:
 *
 * 1. **O nome da coluna é LIDO DA MIGRAÇÃO**, não escrito aqui. Quem renomear
 *    a coluna amanhã continua coberto, e quem a apagar derruba este arquivo com
 *    o motivo na mensagem: não achar alvo é reprovação.
 * 2. **A varredura é a DO PORTÃO** (`inspecionarContrato`), aplicada às
 *    respostas resolvidas por `responseSchema` — e não uma segunda
 *    implementação da mesma ideia, que divergiria em silêncio.
 * 3. **A isca roda em toda execução.** Hoje o contrato tem zero ocorrência do
 *    nome em resposta, e "não achei nada" tem exatamente a mesma cor de
 *    "conferi e está limpo".
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas, rodadas e vistas reprovar em 22/09/2026, e depois restauradas:
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `push_token` acrescentado a `Device` em `api/openapi.yaml` | 1 caso aqui, e 1 no arquivo de rotas |
 * | `comoResposta` trocado por `{ ...aparelho, ... }` | 2 casos aqui, e 5 no arquivo de rotas |
 * | `bearerAuth` retirado de `listDevices` no contrato | 1 caso |
 * | a coluna `push_token` renomeada na migração | 2 casos, por não ter o que conferir |
 *
 * A segunda linha é a que mais importa: o espalhamento do objeto do domínio é a
 * forma mais curta e mais provável de o token sair, e ela reprova nos dois
 * lugares — aqui pelo código-fonte, lá pelo corpo da resposta serializada.
 */
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

/**
 * O nome da coluna do token, lido do disco.
 *
 * Não achar é falha, e não silêncio: uma varredura sem alvo termina verde e
 * ninguém desconfia. É o defeito que este repositório mais persegue.
 */
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

/**
 * As respostas do contrato, embrulhadas na forma que `inspecionarContrato` lê.
 *
 * Por que embrulhar em vez de passar a especificação inteira: aquela função
 * percorre `components` por atacado, e é lá que mora `DeviceRegistration` — o
 * schema de ENTRADA, onde `push_token` está certo. Passando a spec crua, o
 * resultado seria um achado verdadeiro sobre um campo que não é violação, e
 * uma conferência que acusa o que está certo é uma conferência que alguém
 * desliga.
 *
 * `responseSchema` devolve o schema **já resolvido** (sem `$ref`), então o
 * percurso do portão o atravessa inteiro sem precisar de `components`.
 */
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
    // Se `respostasComoSpec` devolvesse `{ paths: {} }` — por um `responseSchema`
    // que mudou de forma, por exemplo — todos os casos abaixo ficariam verdes
    // sem nunca ter olhado para uma resposta.
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const montada = respostasComoSpec(contrato) as { paths: Record<string, unknown> };
    assert.ok(
      Object.keys(montada.paths).length > 20,
      `a montagem das respostas achou ${String(Object.keys(montada.paths).length)} operações. ` +
        'Filtro que não filtra termina verde e ninguém desconfia.',
    );
    // E ela precisa achar a coluna quando ela ESTÁ lá: o contrato de isca
    // abaixo prova a varredura, este caso prova a montagem.
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
    // A armadilha é literal e ela já aconteceu nesta história: o portão lê
    // `/nunca sai do servidor/i` contra o TEXTO do `COMMENT ON COLUMN`, então
    // um comentário que EXPLICA por que a coluna não leva a marca acaba
    // carregando a marca. O portão reprovou com nove achados, todos corretos,
    // por uma frase explicativa.
    //
    // Este caso trava a redação: quem reescrever o comentário e reintroduzir a
    // frase descobre aqui, em segundos, e não no passo do portão da esteira.
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
    // O oposto da isca acima, e ele importa: um portão que reprovasse o campo
    // de entrada seria desligado na primeira semana, e com ele iria a
    // conferência de saída. A entrada é o único caminho pelo qual o token
    // chega, e ela precisa existir.
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
    // `Aparelho` carrega `pushToken` porque `podeReceberPush` precisa dele. Um
    // `...aparelho` publicaria a credencial na primeira vez que alguém achasse
    // o espalhamento mais curto — e o contrato não acusaria, porque propriedade
    // A MAIS na resposta não quebra nenhum cliente.
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
