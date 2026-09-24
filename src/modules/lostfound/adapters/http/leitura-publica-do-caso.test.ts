/**
 * `GET /v1/public/lost-cases/{shareToken}` e `.../poster`, pela borda HTTP.
 *
 * ## O teste de não-vazamento, que é o motivo deste arquivo
 *
 * Regra inviolável do produto: **resposta pública nunca expõe telefone,
 * endereço, e-mail nem id interno do tutor** (ADR-0021, SEC-001, SEC-002). Para
 * que "não expõe" seja verificável, o dublê da porta aqui é HOSTIL: além do
 * `CasoPublico` legítimo, ele devolve o e-mail, o telefone, o endereço e os UUIDs
 * do tutor, do pet e do caso como propriedades a mais, e planta os mesmos dados
 * dentro do texto livre (descrição, cuidados, marcas, nome). É o cenário de
 * alguém um dia acrescentar `...linha` à projeção, ou juntar `users` na consulta
 * "porque já está na mão".
 *
 * A resposta então passa pelo detector `shared/http/vazamento-publico.ts`, que
 * reprova por quatro caminhos: propriedade que o contrato não declara (lida de
 * `api/openapi.yaml` em tempo de execução, não copiada aqui), nome proibido em
 * qualquer profundidade, valor plantado em qualquer campo, e qualquer UUID. As
 * iscas do detector estão no teste dele; aqui se prova a ROTA.
 *
 * O que este arquivo NÃO cobre: a consulta SQL. Com dublê no lugar da porta,
 * uma consulta que juntasse `users` passaria aqui. Quem cobre é
 * `adapters/persistence/leitura-publica-do-caso-sem-dado-do-tutor.test.ts`, que
 * lê o SQL compilado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  achadosDeVazamento,
  propriedadesDeclaradas,
  type ValorPlantado,
} from '../../../../shared/http/vazamento-publico.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import { LeituraPublicaDoCasoService } from '../../application/leitura-publica-do-caso.js';
import type { CasoPublico, LeituraPublicaDoCaso } from '../../ports/leitura-publica-do-caso.js';
import { registrarRotasDaLeituraPublicaDoCaso } from './leitura-publica-do-caso-routes.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const VIZINHO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';
const CASO_ID = '018f3a2b-0000-7000-8000-0000000000dd';
const TOKEN = 'k3J9-share-token-opaco-0001';
const TOKEN_DO_TUTOR = 'acesso-do-tutor';
const TOKEN_DO_VIZINHO = 'acesso-do-vizinho';

const EMAIL_DO_TUTOR = 'tutor.privado@exemplo.com';
const TELEFONE_DO_TUTOR = '+55 11 98765-4321';
const ENDERECO_DO_TUTOR = 'Rua das Acácias, 120';

const PLANTADOS: readonly ValorPlantado[] = [
  { rotulo: 'e-mail do tutor', valor: EMAIL_DO_TUTOR },
  { rotulo: 'telefone do tutor', valor: TELEFONE_DO_TUTOR, porDigitos: true },
  { rotulo: 'endereço do tutor', valor: 'Acácias' },
  { rotulo: 'UUID do tutor', valor: TUTOR },
  { rotulo: 'UUID do pet', valor: PET_ID },
  { rotulo: 'UUID do caso', valor: CASO_ID },
];

/**
 * O caso legítimo, com os dados sensíveis plantados no texto livre, e as
 * propriedades a mais que uma porta descuidada carregaria. O `as` é o ponto: a
 * interface não admite esses campos, e o dublê os força para provar que a
 * projeção é lista branca e não cópia.
 */
function casoHostil(parcial: Partial<CasoPublico> = {}): CasoPublico {
  const legitimo: CasoPublico = {
    shareToken: TOKEN,
    aberto: true,
    petNome: `Thor ${TELEFONE_DO_TUTOR}`,
    especie: 'dog',
    porte: 'M',
    racaRotulo: `Vira-lata, fala com ${EMAIL_DO_TUTOR}`,
    corRotulo: 'Caramelo',
    marcas: `Coleira com o telefone ${TELEFONE_DO_TUTOR}`,
    cuidados: `Pode levar na ${ENDERECO_DO_TUTOR}`,
    descricao: `Fugiu. Me liga no ${TELEFONE_DO_TUTOR} ou escreve para ${EMAIL_DO_TUTOR}. Moro na ${ENDERECO_DO_TUTOR}.`,
    vistoPorUltimoEm: new Date('2026-09-20T18:30:00.000Z'),
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    chaveDaFoto: 'pets/abc/card/f00d.webp',
    doChamador: false,
    ...parcial,
  };
  return {
    ...legitimo,
    id: CASO_ID,
    petId: PET_ID,
    ownerUserId: TUTOR,
    owner_user_id: TUTOR,
    email: EMAIL_DO_TUTOR,
    phone: TELEFONE_DO_TUTOR,
    address: ENDERECO_DO_TUTOR,
    lat: -23.56,
    lon: -46.68,
  } as unknown as CasoPublico;
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly contrato: Contrato;
  readonly chamadas: { token: string; chamador: UserId | undefined }[];
}

function montar(resposta: (chamador: UserId | undefined) => CasoPublico | undefined): Bancada {
  const chamadas: { token: string; chamador: UserId | undefined }[] = [];
  const porta: LeituraPublicaDoCaso = {
    porShareToken: (token, chamador) => {
      chamadas.push({ token, chamador });
      return Promise.resolve(resposta(chamador));
    },
  };
  const contrato = carregarContrato('api/openapi.yaml');
  const app = criarServidor({
    problemBaseUrl: 'https://api.exemplo.invalid/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDaLeituraPublicaDoCaso(escopo, {
        leitura: new LeituraPublicaDoCasoService(porta, {
          baseDaWeb: 'https://web.exemplo.invalid' as AbsoluteUrl,
          baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
        }),
        autenticador: {
          autenticar: (token) => {
            if (token === TOKEN_DO_TUTOR) return Promise.resolve({ userId: TUTOR });
            if (token === TOKEN_DO_VIZINHO) return Promise.resolve({ userId: VIZINHO });
            return Promise.reject(problemas.sessaoExpirada());
          },
        },
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, contrato, chamadas };
}

interface Resposta {
  readonly status: number;
  readonly tipo: string | undefined;
  readonly cabecalhos: Record<string, unknown>;
  readonly corpo: Record<string, unknown>;
}

async function pedir(bancada: Bancada, url: string, token?: string): Promise<Resposta> {
  const resposta = await bancada.app.inject({
    method: 'GET',
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return {
    status: resposta.statusCode,
    tipo: resposta.headers['content-type']?.toString(),
    cabecalhos: resposta.headers,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
  };
}

function declaradas(contrato: Contrato, operationId: string): ReadonlySet<string> {
  const schema = contrato.responseSchema(operationId, '200');
  if (schema === undefined) {
    throw new Error(`O contrato não declara o corpo 200 de ${operationId}: não há contra o que comparar.`);
  }
  return propriedadesDeclaradas(schema);
}

const URL_DO_CASO = `/v1/public/lost-cases/${TOKEN}`;
const URL_DO_CARTAZ = `/v1/public/lost-cases/${TOKEN}/poster`;

void describe('não-vazamento: a resposta pública não carrega dado do tutor nem id interno', () => {
  for (const [rotulo, token] of [
    ['anônimo', undefined],
    ['vizinho autenticado', TOKEN_DO_VIZINHO],
    ['o próprio tutor', TOKEN_DO_TUTOR],
  ] as const) {
    void it(`getPublicLostCase, chamador ${rotulo}: zero achados`, async () => {
      const bancada = montar((chamador) => casoHostil({ doChamador: chamador === TUTOR }));
      const resposta = await pedir(bancada, URL_DO_CASO, token);
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.deepEqual(
        achadosDeVazamento(resposta.corpo, {
          declaradas: declaradas(bancada.contrato, 'getPublicLostCase'),
          plantados: PLANTADOS,
        }),
        [],
      );
    });
  }

  void it('getLostCasePoster: zero achados', async () => {
    const bancada = montar(() => casoHostil());
    const resposta = await pedir(bancada, URL_DO_CARTAZ);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(
      achadosDeVazamento(resposta.corpo, {
        declaradas: declaradas(bancada.contrato, 'getLostCasePoster'),
        plantados: PLANTADOS,
      }),
      [],
    );
  });

  void it('o 410 também não carrega nada do caso encerrado', async () => {
    const bancada = montar(() => casoHostil({ aberto: false }));
    for (const url of [URL_DO_CASO, URL_DO_CARTAZ]) {
      const resposta = await pedir(bancada, url);
      assert.equal(resposta.status, 410);
      assert.deepEqual(achadosDeVazamento(resposta.corpo, { plantados: PLANTADOS }), []);
      assert.equal(JSON.stringify(resposta.corpo).includes('Thor'), false);
    }
  });
});

void describe('getPublicLostCase: o que o contrato declara', () => {
  void it('200 com a projeção pública e os links do site', async () => {
    const bancada = montar(() => casoHostil({ petNome: 'Thor', descricao: null }));
    const resposta = await pedir(bancada, URL_DO_CASO);
    assert.equal(resposta.status, 200);
    assert.match(resposta.tipo ?? '', /^application\/json/);
    assert.equal(resposta.corpo['share_token'], TOKEN);
    assert.equal(resposta.corpo['pet_display_name'], 'Thor');
    assert.equal(resposta.corpo['area_label'], 'Pinheiros, São Paulo');
    assert.equal(resposta.corpo['share_url'], `https://web.exemplo.invalid/p/${TOKEN}`);
    assert.equal(resposta.corpo['poster_url'], `https://web.exemplo.invalid/cartaz/${TOKEN}`);
    assert.equal(resposta.corpo['description'], null);
  });

  void it('anônimo e vizinho podem reportar avistamento; o tutor não', async () => {
    const bancada = montar((chamador) => casoHostil({ doChamador: chamador === TUTOR }));
    assert.equal((await pedir(bancada, URL_DO_CASO)).corpo['can_report_sighting'], true);
    assert.equal((await pedir(bancada, URL_DO_CASO, TOKEN_DO_VIZINHO)).corpo['can_report_sighting'], true);
    assert.equal((await pedir(bancada, URL_DO_CASO, TOKEN_DO_TUTOR)).corpo['can_report_sighting'], false);
    assert.deepEqual(
      bancada.chamadas.map((c) => c.chamador),
      [undefined, VIZINHO, TUTOR],
    );
  });

  void it('caso encerrado: 410 em problem+json, com next_action', async () => {
    const resposta = await pedir(montar(() => casoHostil({ aberto: false })), URL_DO_CASO);
    assert.equal(resposta.status, 410);
    assert.match(resposta.tipo ?? '', /^application\/problem\+json/);
    assert.equal(resposta.corpo['type'], 'https://api.exemplo.invalid/problems/conversation-closed');
    assert.equal(resposta.corpo['status'], 410);
    assert.equal(resposta.corpo['next_action'], 'register_stray_found_report');
  });

  void it('token desconhecido: o MESMO 410, e não 404', async () => {
    const desconhecido = await pedir(montar(() => undefined), URL_DO_CASO);
    const encerrado = await pedir(montar(() => casoHostil({ aberto: false })), URL_DO_CASO);
    assert.equal(desconhecido.status, 410);
    // `correlation_id` identifica a requisição e muda a cada chamada; o resto
    // do corpo precisa ser idêntico.
    const semCorrelacao = (corpo: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(corpo).filter(([chave]) => chave !== 'correlation_id'));
    assert.deepEqual(semCorrelacao(desconhecido.corpo), semCorrelacao(encerrado.corpo));
  });

  void it('token de acesso inválido recusa, em vez de rebaixar para anônimo', async () => {
    const resposta = await pedir(montar(() => casoHostil()), URL_DO_CASO, 'token-vencido');
    assert.equal(resposta.status, 401);
  });

  void it('a resposta não fica em cache compartilhado e não é indexada', async () => {
    const resposta = await pedir(montar(() => casoHostil()), URL_DO_CASO);
    assert.equal(resposta.cabecalhos['cache-control'], 'no-store');
    assert.equal(resposta.cabecalhos['x-robots-tag'], 'noindex, nofollow');
  });
});

void describe('getLostCasePoster: o que o contrato declara', () => {
  void it('200 com o cartaz e o link curto da página do caso', async () => {
    const resposta = await pedir(montar(() => casoHostil({ petNome: 'Thor' })), URL_DO_CARTAZ);
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['pet_display_name'], 'Thor');
    assert.equal(resposta.corpo['short_url'], `https://web.exemplo.invalid/p/${TOKEN}`);
    assert.equal(resposta.corpo['reward_note'], null);
  });

  void it('o cartaz ignora quem chama: a porta recebe chamador indefinido mesmo com token', async () => {
    const bancada = montar(() => casoHostil());
    await pedir(bancada, URL_DO_CARTAZ, TOKEN_DO_TUTOR);
    assert.deepEqual(bancada.chamadas, [{ token: TOKEN, chamador: undefined }]);
  });

  void it('caso encerrado e token desconhecido: 410 com next_action', async () => {
    for (const resposta of [
      await pedir(montar(() => casoHostil({ aberto: false })), URL_DO_CARTAZ),
      await pedir(montar(() => undefined), URL_DO_CARTAZ),
    ]) {
      assert.equal(resposta.status, 410);
      assert.equal(resposta.corpo['next_action'], 'register_stray_found_report');
    }
  });
});
