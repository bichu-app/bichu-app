/**
 * Todas as rotas declaradas no código, conferidas contra o contrato.
 *
 * `vigiarParametrosDasRotas` derruba a **subida** quando uma rota registrada não
 * tem operação no contrato, ou quando uma operação pode recusar um parâmetro e
 * não declara 400. Isso é o comportamento certo, e é tarde demais para ser a
 * única rede: a subida acontece num contêiner, e o erro aparece como um serviço
 * que não sobe, num log que alguém precisa ir ler.
 *
 * Aqui a mesma conferência roda na suíte, sobre **todas** as `defineRoute` do
 * repositório, sem banco, sem servidor e sem Docker. Rota nova que nasça fora do
 * contrato reprova em segundos, na máquina de quem a escreveu.
 *
 * A lista de módulos abaixo é a única parte manual, e ela tem guarda própria: o
 * último caso confere que o número de rotas encontradas aqui bate com o número
 * de `defineRoute` que existem em `src/`. Um módulo novo que não entre na lista
 * reprova, em vez de passar despercebido — que é exatamente o modo de falhar de
 * uma lista escrita à mão.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { carregarContrato } from './contract.js';
import { _decisaoDeStatus } from './validacao-de-parametros.js';
import type { RouteDefinition } from './route-definition.js';

import * as identidade from '../../modules/identity/adapters/http/routes.js';
import * as localizacao from '../../modules/identity/adapters/http/localizacao-de-referencia-routes.js';
import * as pets from '../../modules/pets/adapters/http/pet-routes.js';
import * as referencia from '../../modules/pets/adapters/http/reference-data-routes.js';
import * as midia from '../../modules/media/adapters/http/media-routes.js';
import * as casos from '../../modules/lostfound/adapters/http/lost-case-routes.js';
import * as achados from '../../modules/found/adapters/http/found-report-routes.js';
import * as tags from '../../modules/tags/adapters/http/tag-routes.js';
import * as conversas from '../../modules/messaging/adapters/http/conversation-routes.js';
import * as webhook from '../../modules/notifications/adapters/http/webhook-de-entrega.js';
import * as aparelhos from '../../modules/notifications/adapters/http/device-routes.js';
import * as saude from './health.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

const MODULOS: readonly Record<string, unknown>[] = [
  identidade,
  localizacao,
  pets,
  referencia,
  midia,
  casos,
  // BICHUS-35. Modulo novo entra AQUI, e o terceiro caso deste arquivo e quem
  // cobra: sem esta linha ele reprova contando `defineRoute` no disco.
  achados,
  tags,
  conversas,
  webhook,
  aparelhos,
  saude,
];

function ehRota(valor: unknown): valor is RouteDefinition {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as Record<string, unknown>;
  return (
    typeof candidato['operationId'] === 'string' &&
    typeof candidato['method'] === 'string' &&
    typeof candidato['path'] === 'string' &&
    Array.isArray(candidato['effects'])
  );
}

function rotasDeclaradas(): RouteDefinition[] {
  return MODULOS.flatMap((modulo) => Object.values(modulo).filter(ehRota));
}

/** `/pets/:petId` na forma do contrato. Mesma tradução de `caminhoDoContrato`. */
function comoNoContrato(caminho: string): string {
  return caminho.replace(/:([^/]+)/g, '{$1}');
}

void describe('rotas declaradas no código contra api/openapi.yaml', () => {
  void it('toda rota tem operação no contrato, no mesmo método e caminho', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const orfas: string[] = [];
    const trocadas: string[] = [];

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) {
        orfas.push(`${rota.operationId} (${rota.method.toUpperCase()} ${rota.path})`);
        continue;
      }
      const esperado = `${operacao.method} ${operacao.path}`;
      const declarado = `${rota.method} ${comoNoContrato(rota.path)}`;
      if (esperado !== declarado) {
        trocadas.push(`${rota.operationId}: código diz '${declarado}', contrato diz '${esperado}'`);
      }
    }

    assert.deepEqual(orfas, [], `Rotas sem operação no contrato: ${orfas.join(', ')}`);
    assert.deepEqual(
      trocadas,
      [],
      'Rotas cujo método ou caminho não bate com o contrato. A subida reprova por ' +
        `isso, e o `+`\`operationId\` é a única chave de rastreio entre os dois:\n${trocadas.join('\n')}`,
    );
  });

  void it('toda rota cujos parâmetros podem recusar declara 400 no contrato', () => {
    // Erro é contrato também: responder 400 sem o contrato prometê-lo é a mesma
    // divergência que não validar, na direção oposta. É a terceira queixa do
    // portão de subida, antecipada para a suíte.
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const semQuatrocentos: string[] = [];

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue;
      const esquemas = contrato.parameterSchemas(rota.operationId);
      const grupos = [esquemas.params, esquemas.querystring].filter(
        (grupo): grupo is Record<string, unknown> => grupo !== undefined,
      );
      const podeRecusar = grupos.some((grupo) =>
        Object.values((grupo['properties'] ?? {}) as Record<string, unknown>).some(
          _decisaoDeStatus.podeRecusar,
        ),
      );
      if (!podeRecusar) continue;

      const respostas = (operacao.raw['responses'] ?? {}) as Record<string, unknown>;
      if (!('400' in respostas)) semQuatrocentos.push(rota.operationId);
    }

    assert.deepEqual(
      semQuatrocentos,
      [],
      'Operações registradas que podem recusar parâmetro e não declaram 400 em ' +
        `api/openapi.yaml: ${semQuatrocentos.join(', ')}. A aplicação não sobe assim.`,
    );
  });

  void it('a exigência de X-Reauth-Token bate nos dois sentidos: contrato e código', () => {
    // ===================================================================
    // ESTE É O CASO QUE IMPEDE UMA DAS SEIS DE FICAR SEM SENHA (BICHUS-48)
    // ===================================================================
    //
    // `registrarRota` instala a conferência a partir de `rota.reauthScope`.
    // Isso torna "esqueci de exigir a senha no manipulador" inexprimível, e
    // deixa UM buraco: esquecer o `reauthScope` na declaração. É esse buraco
    // que este caso fecha, e ele o fecha nos dois sentidos.
    //
    // A direção óbvia: operação que o contrato marca com `reauth: []` e cuja
    // rota existe em `src/` PRECISA declarar o escopo. Sem ela, `Desativar a
    // tag` poderia entrar sem senha nenhuma, que é o desfecho que esta
    // história existe para impedir.
    //
    // A direção que ninguém olha: rota que declara um escopo que o contrato
    // não exige. Ela não quebra ninguém — apenas pede uma senha que o
    // documento não promete — e é exatamente por isso que atravessaria a
    // revisão. Quem lê o contrato acreditaria numa coisa e quem chama a API
    // encontraria outra, os dois com razão.
    //
    // A comparação é do VALOR do escopo, e não da presença dele: um
    // `reauthScope: 'tag_revocation'` numa operação que o contrato marca como
    // `account_deletion` passaria por uma conferência que só perguntasse "tem
    // escopo?", e a janela aberta para revogar uma plaquinha valeria para
    // apagar a conta.
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const divergentes: string[] = [];

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue; // o primeiro caso já reprovou.

      const doContrato = operacao.raw['x-reauth-scope'];
      const doCodigo = rota.reauthScope;

      const exigidoNoContrato = typeof doContrato === 'string' ? doContrato : undefined;
      if (exigidoNoContrato === doCodigo) continue;

      divergentes.push(
        `${rota.operationId}: contrato diz ${exigidoNoContrato ?? 'nenhum escopo'}, ` +
          `código diz ${doCodigo ?? 'nenhum escopo'}`,
      );
    }

    assert.deepEqual(
      divergentes,
      [],
      'A exigência de reautenticação diverge entre api/openapi.yaml e a declaração da rota. ' +
        'Escopo no contrato e ausente no código é operação destrutiva servida sem senha; ' +
        'escopo no código e ausente no contrato é senha pedida sem o documento prometer.\n' +
        divergentes.join('\n'),
    );
  });

  void it('toda operação com `reauth: []` no contrato declara o mesmo escopo em `x-reauth-scope`', () => {
    // A metade do contrato que o caso acima não alcança: operação marcada com
    // `reauth: []` cuja rota ainda NÃO existe em `src/`. São quatro hoje
    // (excluir a conta, trocar o e-mail, exportar os dados, transferir o pet),
    // e elas precisam chegar ao código já com o escopo escrito — senão o caso
    // acima aprova por ausência, que é a forma de portão que este projeto já
    // pagou para aprender.
    const spec = parseYaml(readFileSync(CAMINHO_DA_SPEC, 'utf8')) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    const semEscopo: string[] = [];
    const comEscopoSemExigencia: string[] = [];
    let marcadas = 0;

    for (const [caminho, item] of Object.entries(spec.paths)) {
      for (const [metodo, operacao] of Object.entries(item)) {
        if (typeof operacao !== 'object' || operacao === null) continue;
        const seguranca = operacao['security'];
        const pedeReauth =
          Array.isArray(seguranca) &&
          seguranca.some(
            (req) => typeof req === 'object' && req !== null && 'reauth' in (req as object),
          );
        const escopo = operacao['x-reauth-scope'];
        const id = typeof operacao['operationId'] === 'string'
          ? operacao['operationId']
          : `${metodo.toUpperCase()} ${caminho}`;

        if (pedeReauth) {
          marcadas += 1;
          if (typeof escopo !== 'string') semEscopo.push(id);
        } else if (typeof escopo === 'string') {
          comEscopoSemExigencia.push(id);
        }
      }
    }

    // Portão que não acha alvo reprova. Um `security` que mudasse de forma
    // deixaria `marcadas` em zero e todas as asserções acima passariam por
    // percorrer lista vazia.
    assert.ok(
      marcadas >= 6,
      `só ${String(marcadas)} operações com \`reauth: []\` encontradas no contrato, e as seis ` +
        'ações sensíveis da BICHUS-48 estão marcadas. A leitura do `security` deixou de casar.',
    );
    assert.deepEqual(semEscopo, [], `operações com \`reauth: []\` e sem \`x-reauth-scope\`: ${semEscopo.join(', ')}`);
    assert.deepEqual(
      comEscopoSemExigencia,
      [],
      `operações com \`x-reauth-scope\` e sem \`reauth: []\`: ${comEscopoSemExigencia.join(', ')}. ` +
        'O escopo sozinho não exige nada — ele só diz QUAL janela serve.',
    );
  });

  void it('a lista de módulos acima cobre TODAS as `defineRoute` de src/', () => {
    // A guarda da lista escrita à mão. Sem ela, um módulo novo ficaria fora dos
    // dois casos acima e os dois continuariam verdes sem nunca tê-lo olhado —
    // que é a forma clássica de um portão passar a aprovar por ausência.
    //
    // `grep -rc` em vez de `--include`: o grep desta máquina é `ugrep` e o
    // `--include` filtra em silêncio, o que já produziu duas afirmações falsas
    // de "não existe" neste projeto.
    const saida = execFileSync(
      '/bin/sh',
      [
        '-c',
        // `route-definition.ts` fica de fora porque a ocorrência dele é o
        // EXEMPLO do próprio comentário de documentação da função, e não uma
        // rota. Conferido: é a única ocorrência daquele arquivo.
        "find src -name '*.ts' ! -name '*.test.ts' " +
          "! -path 'src/shared/http/route-definition.ts' " +
          "-exec grep -c 'defineRoute({' {} + | awk -F: '{s+=$2} END {print s+0}'",
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();

    const noCodigo = Number(saida);
    assert.ok(Number.isInteger(noCodigo) && noCodigo > 0, `varredura devolveu '${saida}'`);
    assert.equal(
      rotasDeclaradas().length,
      noCodigo,
      `A varredura achou ${String(noCodigo)} chamadas de \`defineRoute\` em src/ e esta ` +
        `bancada enxerga ${String(rotasDeclaradas().length)}. Falta um módulo na lista ` +
        'MODULOS deste arquivo, e as conferências acima estão cegas para ele.',
    );
  });
});
