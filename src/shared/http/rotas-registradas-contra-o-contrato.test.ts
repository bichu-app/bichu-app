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
 *
 * O que cada caso confere: método e caminho, o 400 de parâmetro, o escopo de
 * reautenticação e — desde 22/09 — o **teto de chamada**, entrada por entrada.
 * O do teto tem cabeçalho próprio, no corpo do caso, com o motivo de ele não ser
 * tautologia e com o risco que ele deliberadamente não cobre.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { carregarContrato } from './contract.js';
import { _decisaoDeStatus } from './validacao-de-parametros.js';
import type { RateLimitEntry, RouteDefinition } from './route-definition.js';

import * as identidade from '../../modules/identity/adapters/http/routes.js';
import * as localizacao from '../../modules/identity/adapters/http/localizacao-de-referencia-routes.js';
import * as pets from '../../modules/pets/adapters/http/pet-routes.js';
import * as referencia from '../../modules/pets/adapters/http/reference-data-routes.js';
import * as midia from '../../modules/media/adapters/http/media-routes.js';
import * as casos from '../../modules/lostfound/adapters/http/lost-case-routes.js';
import * as achados from '../../modules/found/adapters/http/found-report-routes.js';
import * as tags from '../../modules/tags/adapters/http/tag-routes.js';
import * as conversas from '../../modules/messaging/adapters/http/conversation-routes.js';
import * as transferencias from '../../modules/transfers/adapters/http/transfer-routes.js';
import * as webhook from '../../modules/notifications/adapters/http/webhook-de-entrega.js';
import * as aparelhos from '../../modules/notifications/adapters/http/device-routes.js';
import * as diretorio from '../../modules/professionals/adapters/http/directory-routes.js';
import * as vitrine from '../../modules/store/adapters/http/store-routes.js';
import * as saude from './health.js';
import * as sessaoAdministrativa from '../../modules/admin-access/adapters/http/admin-session-routes.js';

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
  // BICHUS-66. Modulo novo entra AQUI, e o terceiro caso deste arquivo e quem
  // cobra: sem esta linha ele reprova contando `defineRoute` no disco.
  transferencias,
  webhook,
  aparelhos,
  // Modulo novo entra AQUI, e o terceiro caso deste arquivo e quem
  // cobra: sem esta linha ele reprova contando `defineRoute` no disco.
  diretorio,
  // Modulo novo entra AQUI, e o terceiro caso deste arquivo e quem
  // cobra: sem esta linha ele reprova contando `defineRoute` no disco.
  vitrine,
  // BICHUS-259. A sessao administrativa, primeira familia de `/v1/admin`.
  sessaoAdministrativa,
  saude,
];

/**
 * As operacoes de `/admin/` que o contrato ja declara e que ainda nao tem rota
 * (ADR-0027: a `Loja`, a `Rede` e a intencao de envio de imagem sao de outras
 * fatias). A lista e EXATA nos dois sentidos, e e ela que torna o caso de baixo
 * verificavel: operacao administrativa nova no contrato sem rota e fora daqui
 * reprova; operacao daqui que ganhou rota e continua listada reprova tambem.
 * Quem implementa uma delas tira a linha no mesmo commit.
 */
const OPERACOES_ADMINISTRATIVAS_AINDA_SEM_ROTA: readonly string[] = [
  'listAdminStorePartners',
  'createAdminStorePartner',
  'getAdminStorePartner',
  'updateAdminStorePartner',
  'listAdminStoreItems',
  'createAdminStoreItem',
  'getAdminStoreItem',
  'updateAdminStoreItem',
  'publishAdminStoreItem',
  'retireAdminStoreItem',
  'listAdminNetworkEvents',
  'createAdminNetworkEvent',
  'getAdminNetworkEvent',
  'updateAdminNetworkEvent',
  'removeAdminNetworkEvent',
  'relocateAdminNetworkEvent',
  'cancelAdminNetworkEvent',
  'createAdminCatalogImageIntent',
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

/**
 * Os campos que uma entrada de `x-rate-limit` pode ter no contrato.
 *
 * `note` e o unico ignorado, e e ignorado NOMEADAMENTE: ele e prosa para quem
 * le o documento (por exemplo "SEC-003, o desafio e verificado ANTES da consulta
 * de unicidade") e nao tem contrapartida em `RateLimitEntry`. Campo novo que
 * apareca aqui reprova em vez de ser comparado contra nada.
 */
const CAMPOS_DA_ENTRADA_DO_CONTRATO: ReadonlySet<string> = new Set([
  'dimension',
  'counts',
  'applies_to',
  'when',
  'limit',
  'window',
  'on_exceed',
  'note',
]);

/** A forma comparavel de uma entrada de teto. Os dois lados chegam nela. */
interface EntradaComparavel {
  readonly dimension: readonly unknown[];
  readonly counts: unknown;
  readonly appliesTo: unknown;
  readonly when: unknown;
  readonly limit: unknown;
  readonly window: unknown;
  readonly onExceed: unknown;
}

/**
 * A entrada do contrato na forma comparavel.
 *
 * O contrato escreve `on_exceed` e `applies_to`; o codigo escreve `onExceed` e
 * `appliesTo`. A traducao e so de grafia, e esta escrita num lugar so.
 *
 * `applies_to: all` vira ausencia, e esta e a unica equivalencia que esta
 * funcao declara. Motivo: `all` e o PADRAO no proprio contrato ("quais
 * requisicoes entram na conta. Padrao, todas", `info.description`), e
 * `RateLimitEntry.appliesTo` nao tem como expressa-lo — o tipo so admite
 * `invalid_attempts`. Sem a equivalencia, escrever o padrao explicitamente no
 * YAML reprovaria uma rota correta. Com ela, trocar `invalid_attempts` por
 * `all` continua reprovando, que e a direcao que importa: e essa troca que faz
 * a entrada passar a contar a tentativa VALIDA junto.
 */
function doContratoParaComparacao(entrada: Record<string, unknown>): EntradaComparavel {
  const appliesTo = entrada['applies_to'];
  return {
    dimension: Array.isArray(entrada['dimension']) ? [...(entrada['dimension'] as unknown[])] : entrada['dimension'] as never,
    counts: entrada['counts'],
    appliesTo: appliesTo === 'all' ? undefined : appliesTo,
    when: entrada['when'],
    limit: entrada['limit'],
    window: entrada['window'],
    onExceed: entrada['on_exceed'],
  };
}

/** A entrada da rota na mesma forma. `dimension` e copiada: a da rota e tupla. */
function daDeclaracaoParaComparacao(entrada: RateLimitEntry): EntradaComparavel {
  return {
    dimension: [...entrada.dimension],
    counts: entrada.counts,
    appliesTo: entrada.appliesTo,
    when: entrada.when,
    limit: entrada.limit,
    window: entrada.window,
    onExceed: entrada.onExceed,
  };
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

  void it('o teto de chamada bate entrada por entrada, nos dois sentidos', () => {
    // =====================================================================
    // POR QUE ISTO NAO E TAUTOLOGIA
    // =====================================================================
    //
    // O esperado sai de `api/openapi.yaml`, que e **artefato independente**:
    // ele tem portao proprio (`infra/verificacao/verificar-limite-de-chamada.mjs`,
    // BICHUS-25), vocabulario proprio (`x-rate-limit-vocabulary`) e caminho de
    // revisao proprio — mexer num numero la e mexer no contrato, e isso e lido
    // como contrato. A declaracao da rota sai de `src/`, e e ela que
    // `registrar-rota.ts` aplica de fato.
    //
    // **Hoje ninguem cruza os dois.** O verificador do contrato nunca abre
    // `src/` (esta escrito no cabecalho dele, e ele passou com "80 operacoes, 0
    // achados" durante todo o periodo em que nenhuma rota aplicava nada). E os
    // casos deste mesmo arquivo comparam metodo, caminho, 400 e escopo de
    // reautenticacao — nao o teto.
    //
    // =====================================================================
    // O QUE O COMPILADOR NAO VE, E QUE E O MOTIVO DESTE CASO
    // =====================================================================
    //
    // `defineRoute` recusa `rateLimit: []` numa rota com `effects`, entao APAGAR
    // o teto de 25 das 34 entradas aplicaveis nao compila. Isso nao e
    // vigilancia: e o tipo impedindo uma forma de escrever. O tipo continua
    // satisfeito quando a entrada MUDA:
    //
    //   - `onExceed: 'deny_429'` vira `'log_and_alert'` — tipo valido, a rota
    //     continua declarando teto, e `recusa()` simplesmente para de recusar;
    //   - `limit: 5` vira `limit: 500`;
    //   - `window: '10m'` vira `'24h'`;
    //   - `appliesTo: 'invalid_attempts'` some, e a entrada passa a contar toda
    //     requisicao em vez de so as invalidas.
    //
    // Medido em 22/09: trocar `deny_429` por `log_and_alert` em `deletePet`,
    // `updateMe` e `issuePetTag` deixou as duas suites VERDES. Tres de quatro
    // amostras passavam em silencio.
    //
    // =====================================================================
    // O RISCO RESIDUAL, E POR QUE ISTO NAO SUBSTITUI AS ISCAS DE POSICAO
    // =====================================================================
    //
    // Uma edicao COORDENADA nos dois arquivos passa aqui: quem baixar o teto no
    // contrato e na rota tem os dois lados concordando, e concordancia e tudo o
    // que este caso mede. Ele tambem nao alcanca COMPORTAMENTO: se
    // `aplicacao-de-teto.ts` parar de chamar `hit()`, ou se a ordem dos ganchos
    // de `registrar-rota.ts` inverter, as duas declaracoes continuam iguais e
    // este caso fica verde com o teto desligado.
    //
    // Quem cobre essas duas coisas sao as iscas de POSICAO, por rota, que medem
    // em qual chamada o 429 chega (`tests/integration/teto-da-troca-de-senha.test.ts`,
    // `tests/integration/teto-por-pet-achado-e-plaquinha.test.ts`,
    // `src/tools/portao-de-vigencia-do-teto.ts`). Este caso e o outro lado da
    // pinca: ele cobre as 65 entradas de uma vez, sem banco; elas cobrem o
    // mecanismo, uma rota de cada vez.
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const divergentes: string[] = [];
    const camposDesconhecidos: string[] = [];
    let conferidas = 0;

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue; // o primeiro caso ja reprovou.

      const doContrato = operacao.raw['x-rate-limit'];
      const bruto: unknown[] = Array.isArray(doContrato) ? doContrato : [];
      const declarado = rota.rateLimit ?? [];

      // Presenca, nos dois sentidos, antes de comparar valor: sem isto uma
      // lista vazia de um lado casaria por vacuidade com a do outro.
      if (bruto.length !== declarado.length) {
        divergentes.push(
          `${rota.operationId}: o contrato declara ${String(bruto.length)} entrada(s) de ` +
            `\`x-rate-limit\` e a rota declara ${String(declarado.length)}. ` +
            'Entrada a mais no codigo e teto que o documento nao promete; entrada a menos e ' +
            'teto que o documento promete e o servico nao aplica.',
        );
        continue;
      }

      for (const [indice, entradaBruta] of bruto.entries()) {
        if (typeof entradaBruta !== 'object' || entradaBruta === null) {
          divergentes.push(`${rota.operationId}: \`x-rate-limit[${String(indice)}]\` nao e um mapa no contrato.`);
          continue;
        }
        const desconhecidos = Object.keys(entradaBruta).filter(
          (campo) => !CAMPOS_DA_ENTRADA_DO_CONTRATO.has(campo),
        );
        if (desconhecidos.length > 0) {
          camposDesconhecidos.push(
            `${rota.operationId}: \`x-rate-limit[${String(indice)}]\` traz ${desconhecidos.join(', ')}`,
          );
        }

        const daRota = declarado[indice];
        if (daRota === undefined) continue; // impossivel: os tamanhos ja casaram.
        const esperado = doContratoParaComparacao(entradaBruta as Record<string, unknown>);
        const obtido = daDeclaracaoParaComparacao(daRota);
        conferidas += 1;
        try {
          assert.deepEqual(obtido, esperado);
        } catch {
          divergentes.push(
            `${rota.operationId}: \`x-rate-limit[${String(indice)}]\`\n` +
              `      contrato: ${JSON.stringify(esperado)}\n` +
              `      codigo:   ${JSON.stringify(obtido)}`,
          );
        }
      }
    }

    assert.deepEqual(
      camposDesconhecidos,
      [],
      'Entradas de `x-rate-limit` com campo que esta comparacao nao conhece:\n' +
        `${camposDesconhecidos.join('\n')}\n` +
        'Campo que ela nao conhece e campo que ela ignora, e comparacao que ignora aprova por ' +
        'nao ter olhado. O campo novo entra em `CAMPOS_DA_ENTRADA_DO_CONTRATO` e em ' +
        '`doContratoParaComparacao`, ou entra em `RateLimitEntry` — nunca so no YAML.',
    );

    // Comparacao que nao comparou nada aprova em silencio. `rotasDeclaradas()`
    // ja e guardado pelo ultimo caso deste arquivo, mas a lista de entradas nao:
    // uma mudanca na leitura de `x-rate-limit` deixaria `bruto` vazio em TODAS as
    // operacoes e os tamanhos casariam com as rotas que tambem nao declaram nada.
    assert.ok(
      conferidas > 0,
      'nenhuma entrada de `x-rate-limit` foi comparada. A leitura do contrato deixou de casar, ' +
        'e a partir daqui este caso aprovaria qualquer teto.',
    );

    assert.deepEqual(
      divergentes,
      [],
      `O teto declarado em src/ diverge de api/openapi.yaml (${String(conferidas)} entradas ` +
        'conferidas):\n' +
        `${divergentes.join('\n')}\n\n` +
        'O contrato e a fonte do numero e do comportamento. Divergencia aqui e uma das duas ' +
        'coisas, e nenhuma delas e refatoracao: ou o servico aplica um teto que o documento nao ' +
        'promete, ou ele promete um teto que nao aplica. `on_exceed` merece atencao especial — ' +
        'so `deny_429` recusa (`aplicacao-de-teto.ts`, `recusa()`), e trocar por qualquer outra ' +
        'palavra do vocabulario deixa a rota declarando teto e servindo sem teto.',
    );
  });

  void it('papel, trilha, reautenticacao e acesso publico de /admin/ batem com o contrato (ADR-0027 item 7)', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const divergentes: string[] = [];
    let administrativas = 0;

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue; // o primeiro caso ja reprovou.
      const bruto = operacao.raw;
      const ehAdministrativa = operacao.path.startsWith('/admin/');
      if (ehAdministrativa) administrativas += 1;

      const papeisDoContrato = bruto['x-admin-roles'];
      const papeisDoCodigo = rota.adminRoles === undefined ? undefined : [...rota.adminRoles];
      if (JSON.stringify(papeisDoContrato) !== JSON.stringify(papeisDoCodigo)) {
        divergentes.push(
          `${rota.operationId}: x-admin-roles ${JSON.stringify(papeisDoContrato)}, adminRoles ${JSON.stringify(papeisDoCodigo)}`,
        );
      }

      const trilha = bruto['x-audit'] as { action?: unknown; resource_kind?: unknown } | undefined;
      const trilhaDoContrato =
        trilha === undefined ? undefined : { action: trilha.action, resourceKind: trilha.resource_kind };
      if (JSON.stringify(trilhaDoContrato) !== JSON.stringify(rota.audit)) {
        divergentes.push(
          `${rota.operationId}: x-audit ${JSON.stringify(trilhaDoContrato)}, audit ${JSON.stringify(rota.audit)}`,
        );
      }

      const escopo = bruto['x-admin-reauth-scope'];
      if ((typeof escopo === 'string' ? escopo : undefined) !== rota.adminReauthScope) {
        divergentes.push(
          `${rota.operationId}: x-admin-reauth-scope ${String(escopo)}, adminReauthScope ${String(rota.adminReauthScope)}`,
        );
      }

      const publicaNoContrato = ehAdministrativa && operacao.security.length === 0;
      if (publicaNoContrato !== (rota.adminPublic === true)) {
        divergentes.push(
          `${rota.operationId}: security vazio sob /admin/ = ${String(publicaNoContrato)}, adminPublic = ${String(rota.adminPublic)}`,
        );
      }
    }

    assert.ok(administrativas > 0, 'nenhuma rota de /admin/ conferida: a leitura deixou de casar');
    assert.deepEqual(divergentes, [], `Declaracao administrativa divergente do contrato:\n${divergentes.join('\n')}`);
  });

  void it('toda operacao de /admin/ do contrato tem rota, exceto as listadas como ainda sem rota', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const comRota = new Set(rotasDeclaradas().map((rota) => rota.operationId));
    const doContrato = [...contrato.operacoes.values()]
      .filter((operacao) => operacao.path.startsWith('/admin/'))
      .map((operacao) => operacao.operationId);

    const semRotaNemLista = doContrato.filter(
      (id) => !comRota.has(id) && !OPERACOES_ADMINISTRATIVAS_AINDA_SEM_ROTA.includes(id),
    );
    const listadasComRota = OPERACOES_ADMINISTRATIVAS_AINDA_SEM_ROTA.filter((id) => comRota.has(id));
    const listadasForaDoContrato = OPERACOES_ADMINISTRATIVAS_AINDA_SEM_ROTA.filter((id) => !doContrato.includes(id));

    assert.deepEqual(semRotaNemLista, [], 'operacao administrativa do contrato sem rota e fora da lista de pendentes');
    assert.deepEqual(listadasComRota, [], 'operacao listada como pendente ja tem rota: tire-a da lista');
    assert.deepEqual(listadasForaDoContrato, [], 'operacao listada como pendente que o contrato nao declara');
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
