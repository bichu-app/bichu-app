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
import * as passkey from '../../modules/identity/adapters/http/passkey-routes.js';
import * as localizacao from '../../modules/identity/adapters/http/localizacao-de-referencia-routes.js';
import * as pets from '../../modules/pets/adapters/http/pet-routes.js';
import * as referencia from '../../modules/pets/adapters/http/reference-data-routes.js';
import * as midia from '../../modules/media/adapters/http/media-routes.js';
import * as casos from '../../modules/lostfound/adapters/http/lost-case-routes.js';
import * as casoPublico from '../../modules/lostfound/adapters/http/leitura-publica-do-caso-routes.js';
import * as perdidosPublicos from '../../modules/lostfound/adapters/http/listagem-publica-de-perdidos-routes.js';
import * as perfilPublico from '../../modules/pets/adapters/http/perfil-publico-routes.js';
import * as achados from '../../modules/found/adapters/http/found-report-routes.js';
import * as tags from '../../modules/tags/adapters/http/tag-routes.js';
import * as conversas from '../../modules/messaging/adapters/http/conversation-routes.js';
import * as conversaDoAchador from '../../modules/messaging/adapters/http/finder-conversation-routes.js';
import * as avisoDoAchador from '../../modules/found/adapters/http/finder-found-report-routes.js';
import * as transferencias from '../../modules/transfers/adapters/http/transfer-routes.js';
import * as webhook from '../../modules/notifications/adapters/http/webhook-de-entrega.js';
import * as aparelhos from '../../modules/notifications/adapters/http/device-routes.js';
import * as diretorio from '../../modules/professionals/adapters/http/directory-routes.js';
import * as vitrine from '../../modules/store/adapters/http/store-routes.js';
import * as lojaAdministrativa from '../../modules/store/adapters/http/admin-store-routes.js';
import * as rede from '../../modules/network/adapters/http/network-routes.js';
import * as redeAdministrativa from '../../modules/network/adapters/http/admin-network-routes.js';
import * as conexoes from '../../modules/connections/adapters/http/connection-routes.js';
import * as convites from '../../modules/connections/adapters/http/invite-routes.js';
import * as pessoas from '../../modules/people/adapters/http/person-profile-routes.js';
import * as buscaDePessoas from '../../modules/people/adapters/http/people-search-routes.js';
import * as saude from './health.js';
import * as sessaoAdministrativa from '../../modules/admin-access/adapters/http/admin-session-routes.js';
import * as cep from '../../modules/addresses/adapters/http/postal-code-routes.js';
import * as sugestaoDoDiretorio from '../../modules/professionals/adapters/http/directory-suggestion-routes.js';
import * as diretorioAdministrativo from '../../modules/professionals/adapters/http/admin-directory-routes.js';
import * as indicacoesAdministrativas from '../../modules/professionals/adapters/http/admin-directory-suggestion-routes.js';
import * as vitrineDeFotos from '../../modules/showcase/adapters/http/showcase-routes.js';
import * as mural from '../../modules/publications/adapters/http/publicacao-routes.js';
import * as pedidoDePlaquinha from '../../modules/tags/adapters/http/pedido-de-plaquinha-routes.js';
import * as plaquinhasAdministrativas from '../../modules/tags/adapters/http/admin-pedido-de-plaquinha-routes.js';
import * as enderecoGuardado from '../../modules/tags/adapters/http/endereco-guardado-routes.js';
import * as enderecoDoPet from '../../modules/tags/adapters/http/endereco-do-pet-routes.js';
import * as moderacaoAdministrativa from '../../modules/moderation/adapters/http/admin-moderation-routes.js';
import * as caixaDeNotificacoes from '../../modules/notifications/adapters/http/caixa-de-notificacoes-routes.js';
import * as contadoresDeSecao from '../../modules/sections/adapters/http/section-counter-routes.js';
import * as ajuda from '../../modules/support/adapters/http/help-request-routes.js';
import * as filaDeAjuda from '../../modules/support/adapters/http/admin-help-request-routes.js';
import * as comunicadosAdministrativos from '../../modules/notifications/adapters/http/admin-comunicado-routes.js';
import * as seguranca from '../../modules/safety/adapters/http/safety-routes.js';
import * as vereditoDeVersao from '../../modules/app-release/adapters/http/version-status-routes.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

const MODULOS: readonly Record<string, unknown>[] = [
  identidade,
  passkey,
  localizacao,
  pets,
  referencia,
  midia,
  casos,
  casoPublico,
  perdidosPublicos,
  perfilPublico,
  vitrineDeFotos,
  achados,
  tags,
  conversas,
  conversaDoAchador,
  avisoDoAchador,
  transferencias,
  webhook,
  aparelhos,
  diretorio,
  vitrine,
  sessaoAdministrativa,
  lojaAdministrativa,
  rede,
  redeAdministrativa,
  conexoes,
  pessoas,
  convites,
  buscaDePessoas,
  mural,
  cep,
  sugestaoDoDiretorio,
  diretorioAdministrativo,
  indicacoesAdministrativas,
  pedidoDePlaquinha,
  plaquinhasAdministrativas,
  enderecoGuardado,
  enderecoDoPet,
  moderacaoAdministrativa,
  seguranca,
  saude,
  caixaDeNotificacoes,
  contadoresDeSecao,
  ajuda,
  filaDeAjuda,
  comunicadosAdministrativos,
  vereditoDeVersao,
];

const OPERACOES_ADMINISTRATIVAS_AINDA_SEM_ROTA: readonly string[] = [
];

const OPERACOES_SERVIDAS_PELA_BORDA: readonly string[] = [
  'wellKnownAssetLinks',
  'wellKnownAppleAppSiteAssociation',
];

const OPERACOES_AINDA_SEM_ROTA: readonly string[] = [
  'requestDataExport',
  'updatePetPublicProfile',
  'revokePetTag',
  'snoozeLostCaseReminder',
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

function comoNoContrato(caminho: string): string {
  return caminho.replace(/:([^/]+)/g, '{$1}');
}

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

interface EntradaComparavel {
  readonly dimension: readonly unknown[];
  readonly counts: unknown;
  readonly appliesTo: unknown;
  readonly when: unknown;
  readonly limit: unknown;
  readonly window: unknown;
  readonly onExceed: unknown;
}

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
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const divergentes: string[] = [];

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue;

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
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const divergentes: string[] = [];
    const camposDesconhecidos: string[] = [];
    let conferidas = 0;

    for (const rota of rotasDeclaradas()) {
      const operacao = contrato.operacoes.get(rota.operationId);
      if (operacao === undefined) continue;

      const doContrato = operacao.raw['x-rate-limit'];
      const bruto: unknown[] = Array.isArray(doContrato) ? doContrato : [];
      const declarado = rota.rateLimit ?? [];

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
        if (daRota === undefined) continue;
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
      if (operacao === undefined) continue;
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

  void it('TODA operacao do contrato tem rota, exceto as servidas pela borda e as listadas como sem codigo', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const comRota = new Set(rotasDeclaradas().map((rota) => rota.operationId));
    const doContrato = [...contrato.operacoes.values()].map((operacao) => operacao.operationId);

    assert.ok(doContrato.length > 0, 'nenhuma operacao lida do contrato: a leitura deixou de casar');

    const conhecidas = [...OPERACOES_SERVIDAS_PELA_BORDA, ...OPERACOES_AINDA_SEM_ROTA];
    const semRotaNemLista = doContrato.filter((id) => !comRota.has(id) && !conhecidas.includes(id));
    const listadasComRota = conhecidas.filter((id) => comRota.has(id));
    const listadasForaDoContrato = conhecidas.filter((id) => !doContrato.includes(id));

    assert.deepEqual(
      semRotaNemLista,
      [],
      'operacao do contrato SEM CODIGO e fora das duas listas deste arquivo: ou implemente a ' +
        'rota, ou tire a operacao do contrato (decisao do cliente), ou registre a divida em ' +
        '`OPERACOES_AINDA_SEM_ROTA` com o motivo',
    );
    assert.deepEqual(listadasComRota, [], 'operacao listada como sem codigo ja tem rota: tire-a da lista');
    assert.deepEqual(
      listadasForaDoContrato,
      [],
      'operacao listada aqui que o contrato nao declara mais: tire-a da lista',
    );
  });

  void it('a lista de módulos acima cobre TODAS as `defineRoute` de src/', () => {
    const saida = execFileSync(
      '/bin/sh',
      [
        '-c',
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
