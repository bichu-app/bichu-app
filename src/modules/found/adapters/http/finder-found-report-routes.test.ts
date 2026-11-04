import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse as parseYaml } from 'yaml';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import { redigirCanalMediado } from '../../../../shared/redaction/redigir.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock, IdGenerator } from '../../../../shared/ports/index.js';
import type {
  AbsoluteUrl,
  FoundReportId,
  Instant,
  OpaqueToken,
} from '../../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../../../media/ports/object-storage.js';
import { AvisoDoAchadorService } from '../../application/aviso-do-achador.js';
import { TETO_DE_BYTES_DA_FOTO_DO_ACHADO } from '../../application/found-report-service.js';
import type {
  AvisoDoAchador,
  EnriquecimentoDoAchador,
  FoundReportRepository,
  NovaIntencaoDeFotoDoAchadorSemConta,
} from '../../ports/found-report-repository.js';
import type {
  AcessoDoAchador,
  ConversaDoAchadorParaAviso,
} from '../../ports/conversa-do-achador.js';
import { registrarRotasDoAvisoDoAchador } from './finder-found-report-routes.js';
import { problemaDaResposta, respostaDeclarada } from '../../../../shared/http/problema-do-contrato.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DA_WEB = 'https://bichu.test' as AbsoluteUrl;
const AGORA = Date.parse('2026-09-23T12:00:00Z') as Instant;
const TOKEN = 'T'.repeat(21) + 'o'.repeat(22);
const AVISO = '018f3a2b-0000-7000-8000-00000000f0a1' as FoundReportId;
const REF_VALIDA = 'r'.repeat(22);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const DO_TUTOR = {
  userId: '018f3a2b-0000-7000-8000-0000000000aa',
  email: 'leandro.tutor@exemplo.invalid',
  telefone: '+5511987654321',
  endereco: 'Rua das Acácias, 742',
};

interface Cenario {
  readonly acesso?: AcessoDoAchador;
  readonly statusDoAviso?: AvisoDoAchador['status'];
  readonly fotosJaPedidas?: number;
}

/**
 * O que o serviço pediu para DIVULGAR ao tutor, como a bancada o recebeu.
 *
 * Guardado como dado solto de propósito: o que esta bancada mede é a
 * responsabilidade do módulo `found` — quais dados ele entrega e com que texto de
 * consentimento. O recado que o TUTOR lê é montado dentro da transação do módulo
 * `messaging`, a partir da linha gravada, e é medido lá e na integração.
 */
interface Divulgacao {
  readonly pedido: Record<string, unknown>;
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly mudancas: EnriquecimentoDoAchador[];
  readonly recados: string[];
  readonly intencoes: NovaIntencaoDeFotoDoAchadorSemConta[];
  readonly argumentos: unknown[];
  readonly divulgacoes: Divulgacao[];
}

function bancada(cenario: Cenario = {}): Bancada {
  const mudancas: EnriquecimentoDoAchador[] = [];
  const recados: string[] = [];
  const intencoes: NovaIntencaoDeFotoDoAchadorSemConta[] = [];
  const argumentos: unknown[] = [];
  const divulgacoes: Divulgacao[] = [];
  const resumoCerto = hashDeToken(TOKEN);
  let temPonto = false;
  let temFoto = false;

  const aviso = (): AvisoDoAchador =>
    ({
      id: AVISO,
      status: cenario.statusDoAviso ?? 'open',
      achadoEm: new Date(AGORA - 3_600_000),
      temFoto,
      temPonto,
      recado: 'Estou com ela na padaria, liga 11 98765-4321',
      nomeDoPet: 'Aurora',
      resumoDoToken: new Uint8Array(resumoCerto),
      ...{
        tutorUserId: DO_TUTOR.userId,
        emailDoTutor: DO_TUTOR.email,
        telefoneDoTutor: DO_TUTOR.telefone,
        petId: '018f3a2b-0000-7000-8000-000000000be7',
      },
    });
  const eDoToken = (resumo: Uint8Array): boolean => Buffer.from(resumo).equals(resumoCerto);

  const repositorio = {
    avisoPeloTokenDoAchador: (resumo: Uint8Array) => {
      argumentos.push(resumo);
      return Promise.resolve(eDoToken(resumo) ? aviso() : undefined);
    },
    enriquecerPeloTokenDoAchador: (resumo: Uint8Array, mudanca: EnriquecimentoDoAchador) => {
      argumentos.push(resumo, mudanca);
      if (!eDoToken(resumo) || cenario.statusDoAviso === 'closed') return Promise.resolve(undefined);
      mudancas.push(mudanca);
      if (mudanca.lat !== undefined) temPonto = true;
      if (mudanca.fotoUploadId !== undefined) temFoto = true;
      return Promise.resolve(aviso());
    },
    intencaoDeFotoDoAchadorPelaReferencia: (resumo: Uint8Array, ref: string) => {
      argumentos.push(resumo, ref);
      return Promise.resolve(
        eDoToken(resumo) && ref === REF_VALIDA ? '018f3a2b-0000-7000-8000-0000000f0707' : undefined,
      );
    },
    contarIntencoesDeFotoPeloTokenDoAchador: (resumo: Uint8Array) => {
      argumentos.push(resumo);
      return Promise.resolve((cenario.fotosJaPedidas ?? 0) + intencoes.length);
    },
    registrarIntencaoDeFotoDoAchadorSemConta: (nova: NovaIntencaoDeFotoDoAchadorSemConta) => {
      argumentos.push(nova);
      intencoes.push(nova);
      return Promise.resolve();
    },
  } as unknown as FoundReportRepository;

  const armazenamento: ObjectStorage = {
    createUploadIntent: (pedido): Promise<AutorizacaoDeEnvio> =>
      Promise.resolve({
        metodo: 'POST',
        url: 'https://objetos.bichu.test/privado' as AbsoluteUrl,
        campos: { key: pedido.chave, 'Content-Type': pedido.contentType },
        expiraEm: new Date(AGORA + 300_000),
        maxBytes: pedido.maxBytes,
      }),
    getSignedReadUrl: () => {
      throw new Error('fora desta bancada');
    },
    head: () => Promise.resolve(null),
    get: () => {
      throw new Error('fora desta bancada');
    },
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };

  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => `018f3a2b-0000-7000-8000-0000000${String(10_000 + (sequencia += 1))}`,
    opaqueToken: () => 'nao-usado' as OpaqueToken,
    random128: () => new Uint8Array(randomBytes(16)),
    random80: () => new Uint8Array(randomBytes(10)),
  };
  const clock: Clock = { now: () => AGORA };

  /**
   * O dublê da conversa. Vai por `as unknown as` de propósito: a divulgação do
   * contato é gravada e entregue pelo módulo `messaging`, e esta bancada só
   * precisa registrar O QUE o `found` pediu — não a forma final da porta.
   */
  const conversa = {
    acesso: (token: string) =>
      Promise.resolve(
        token === TOKEN
          ? (cenario.acesso ?? { situacao: 'valido', aceitaMensagem: true })
          : { situacao: 'recusado' },
      ),
    entregarRecado: (_token: string, recado: string) => {
      recados.push(recado);
      return Promise.resolve(redigirCanalMediado(recado).texto);
    },
    divulgarContatoComConsentimento: (_token: string, pedido: Record<string, unknown>) => {
      divulgacoes.push({ pedido });
      return Promise.resolve({
        consentidoEm: new Date(AGORA),
        finalidade: 'owner_contact',
        versao: pedido['versaoDoConsentimento'],
        texto: pedido['textoDoConsentimento'],
      });
    },
  } as unknown as ConversaDoAchadorParaAviso;

  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDoAvisoDoAchador(app, {
    avisos: new AvisoDoAchadorService({
      repositorio,
      conversa,
      armazenamento,
      ids,
      clock,
      baseDaWeb: BASE_DA_WEB,
    }),
    contrato: carregarContrato('api/openapi.yaml'),
  });

  return { app, mudancas, recados, intencoes, argumentos, divulgacoes };
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
  readonly cabecalhos: Record<string, unknown>;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { metodo: 'PATCH' | 'POST'; url: string; token?: string | null | undefined; corpo: unknown },
): Promise<Resposta> {
  const token = opcoes.token === undefined ? TOKEN : opcoes.token;
  const resposta = await app.inject({
    method: opcoes.metodo,
    url: opcoes.url,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    payload: opcoes.corpo as object,
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
    cabecalhos: resposta.headers,
  };
}

function corpoSemCorrelacao(resposta: Resposta): string {
  const resto = { ...resposta.corpo };
  delete resto['correlation_id'];
  delete resto['instance'];
  return JSON.stringify(resto);
}

const OPERACOES = [
  {
    operationId: 'enrichFinderFoundReport',
    pedido: { metodo: 'PATCH' as const, url: '/finder/found-report', corpo: { message: 'oi' } },
  },
  {
    operationId: 'createFinderPhotoUploadIntent',
    pedido: {
      metodo: 'POST' as const,
      url: '/media/finder-photo-intents',
      corpo: { content_type: 'image/jpeg', byte_size: 1000 },
    },
  },
];

function tipoDe(corpo: Record<string, unknown>): string | undefined {
  const { type } = corpo;
  return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
}

function propriedadesDoContrato(nome: string): Set<string> {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  const schema = spec.components.schemas[nome];
  assert.ok(schema?.properties !== undefined, `o contrato não declara ${nome}`);
  return new Set(Object.keys(schema.properties));
}

function geoPointDoContrato(): {
  lat: { minimo: number; maximo: number };
  lon: { minimo: number; maximo: number };
} {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: {
      schemas: Record<string, { properties?: Record<string, { minimum?: number; maximum?: number }> }>;
    };
  };
  const props = spec.components.schemas['GeoPoint']?.properties;
  const lat = props?.['lat'];
  const lon = props?.['lon'];
  assert.ok(
    lat?.minimum !== undefined && lat.maximum !== undefined && lon?.minimum !== undefined && lon.maximum !== undefined,
    'o contrato não declara a faixa de GeoPoint: não há contra o que comparar',
  );
  return {
    lat: { minimo: lat.minimum, maximo: lat.maximum },
    lon: { minimo: lon.minimum, maximo: lon.maximum },
  };
}

function exigirQueNaoVaza(resposta: Resposta, onde: string): void {
  for (const proibido of [DO_TUTOR.email, DO_TUTOR.telefone, DO_TUTOR.endereco, '98765-4321']) {
    assert.ok(!resposta.bruto.includes(proibido), `${onde}: \`${proibido}\` vazou: ${resposta.bruto}`);
  }
  const semCorrelacao = { ...resposta.corpo };
  delete semCorrelacao['correlation_id'];
  const texto = JSON.stringify(semCorrelacao);
  assert.doesNotMatch(texto, UUID, `${onde}: um UUID interno saiu para o achador: ${texto}`);
  for (const chave of ['"id"', '"upload_id"', '"case_id"', '"pet_id"', '"user_id"', '"lat"', '"lon"']) {
    assert.ok(!texto.includes(`${chave}:`), `${onde}: a chave ${chave} saiu para o achador: ${texto}`);
  }
}

void describe('enrichFinderFoundReport: "Contar mais", sem id e sem coordenada de volta', () => {
  void it('200 com `FinderFoundReportView` exato, e o recado entregue NA CONVERSA, redigido', async () => {
    const { app, mudancas, recados } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: {
        message: 'Ela está calma. Me liga 11 99876-5432',
        location: { lat: -23.5614, lon: -46.656, accuracy_m: 30 },
        finder_contact: { display_name: 'Ana Paula', email: 'ana@exemplo.invalid' },
        photo_upload_ref: REF_VALIDA,
      },
    });
    await app.close();

    assert.equal(resposta.status, 200, resposta.bruto);
    const declaradas = propriedadesDoContrato('FinderFoundReportView');
    for (const chave of Object.keys(resposta.corpo)) {
      assert.ok(declaradas.has(chave), `\`${chave}\` não está em FinderFoundReportView`);
    }
    assert.equal(resposta.corpo['has_location'], true);
    assert.equal(resposta.corpo['has_photo'], true);
    assert.equal(resposta.corpo['conversation_url'], `${BASE_DA_WEB}/c/${TOKEN}`);
    assert.ok(!resposta.bruto.includes('99876-5432'), 'o telefone do recado voltou em claro');
    assert.deepEqual(recados, ['Ela está calma. Me liga 11 99876-5432']);

    assert.equal(mudancas.length, 1);
    assert.equal(mudancas[0]?.nome, 'Ana Paula');
    assert.equal(mudancas[0]?.email, 'ana@exemplo.invalid');
    assert.ok(!('recado' in (mudancas[0] ?? {})) && !('notes' in (mudancas[0] ?? {})));
    exigirQueNaoVaza(resposta, 'PATCH /finder/found-report');
  });

  void it('sem recado novo, o recado que sai é o do aviso, REDIGIDO', async () => {
    const { app } = bancada();
    const resposta = await pedir(app, { metodo: 'PATCH', url: '/finder/found-report', corpo: {} });
    await app.close();
    assert.equal(resposta.status, 200);
    assert.ok(!resposta.bruto.includes('98765-4321'), '`notes` em claro saiu na resposta');
    exigirQueNaoVaza(resposta, 'PATCH sem recado');
  });

  void it('nome com telefone é recusado: o nome é mostrado ao tutor', async () => {
    const { app, mudancas, recados } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: { message: 'oi', finder_contact: { display_name: 'Ana 11987654321' } },
    });
    await app.close();
    assert.equal(resposta.status, 400);
    assert.equal(tipoDe(resposta.corpo), 'validation-failed');
    assert.equal(mudancas.length + recados.length, 0, 'algo foi gravado apesar da recusa');
  });

  void it('`location` é GeoPoint: fora da faixa do contrato, ou pela metade, é 400', async () => {
    const ponto = geoPointDoContrato();
    const foraDaFaixa = [
      { lat: ponto.lat.minimo - 1, lon: -46.6 },
      { lat: ponto.lat.maximo + 1, lon: -46.6 },
      { lat: -23.5, lon: ponto.lon.minimo - 1 },
      { lat: -23.5, lon: ponto.lon.maximo + 1 },
    ];
    for (const location of [...foraDaFaixa, { lat: -23.5 }, { lon: -46.6 }]) {
      const { app, mudancas } = bancada();
      const resposta = await pedir(app, { metodo: 'PATCH', url: '/finder/found-report', corpo: { location } });
      await app.close();
      assert.equal(resposta.status, 400, JSON.stringify(location));
      assert.equal(mudancas.length, 0);
    }
  });

  void it('referência de foto que não é deste aviso: `validation-failed`', async () => {
    const { app, mudancas } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: { photo_upload_ref: 's'.repeat(22) },
    });
    await app.close();
    assert.equal(resposta.status, 400);
    assert.equal(mudancas.length, 0);
  });

  void it('conversa fechada ou aviso encerrado: 410 `conversation-closed`, nada gravado', async () => {
    const encerrado = problemaDaResposta('FinderAccessEnded');
    for (const cenario of [
      { acesso: { situacao: 'valido', aceitaMensagem: false } } as Cenario,
      { statusDoAviso: 'closed' } as Cenario,
    ]) {
      const { app, mudancas, recados } = bancada(cenario);
      const resposta = await pedir(app, { metodo: 'PATCH', url: '/finder/found-report', corpo: { message: 'oi' } });
      await app.close();
      assert.equal(resposta.status, encerrado.status, JSON.stringify(cenario));
      assert.equal(tipoDe(resposta.corpo), encerrado.slug);
      assert.equal(mudancas.length + recados.length, 0);
    }
  });
});

/**
 * O CONTATO DE QUEM ACHOU CHEGA AO TUTOR, E SÓ COM CONSENTIMENTO.
 *
 * Decisão do cliente, 03/11/2026, literal: *"o achador vai enviar os dados e ter
 * um botão de 'aceito compartilhar meus dados com o tutor do pet' com o objetivo
 * exclusivamente dele conseguir entrar em contato para recuperar seu pet"*.
 *
 * Os quatro casos são os quatro que a decisão exige, e cada um mede uma coisa que
 * a ausência do mecanismo não produz. Medidos contra `fb8e5c2d` antes do
 * conserto — ver o relatório do PR.
 */
void describe('o contato do achador só chega ao tutor com consentimento', () => {
  const VERSAO = '2026-11-03';
  const DO_ACHADOR = {
    nome: 'Ana Paula',
    email: 'ana.paula@exemplo.invalid',
    telefone: '+5511912345678',
  };
  const consentimento = { accepted: true, consent_version: VERSAO };

  void it('CASO 1 — SEM consentimento o contato não chega, e a recusa de hoje segue de pé', async () => {
    // 1a. telefone sem consentimento é RECUSADO, e não ignorado em silêncio:
    // campo aceito e descartado é a forma mais discreta de um vazamento nascer.
    const comTelefone = bancada();
    const recusa = await pedir(comTelefone.app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: { finder_contact: { phone_e164: DO_ACHADOR.telefone } },
    });
    await comTelefone.app.close();
    assert.equal(recusa.status, 400, `telefone sem consentimento passou: ${recusa.bruto}`);
    assert.equal(tipoDe(recusa.corpo), 'validation-failed');
    assert.equal(comTelefone.divulgacoes.length, 0, 'divulgou sem consentimento');
    assert.equal(comTelefone.mudancas.length, 0, 'gravou apesar da recusa');

    // 1b. e-mail e nome SEM consentimento continuam valendo como antes: eles são
    // gravados, e nada deles é divulgado ao tutor por esta decisão.
    const semConsentir = bancada();
    const aceito = await pedir(semConsentir.app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: { finder_contact: { display_name: DO_ACHADOR.nome, email: DO_ACHADOR.email } },
    });
    await semConsentir.app.close();
    assert.equal(aceito.status, 200, aceito.bruto);
    assert.equal(semConsentir.divulgacoes.length, 0, 'divulgou sem o ato de consentir');
    assert.equal(
      aceito.corpo['contact_shared_at'] ?? null,
      null,
      'a resposta afirma divulgação que não houve',
    );

    // 1c. a trava de hoje NÃO foi trocada por bandeira: nome com telefone dentro
    // continua recusado, porque agora existe campo próprio para o telefone.
    const nomeComTelefone = bancada();
    const travada = await pedir(nomeComTelefone.app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: { finder_contact: { display_name: 'Ana 11987654321' } },
    });
    await nomeComTelefone.app.close();
    assert.equal(travada.status, 400, `a trava de hoje caiu: ${travada.bruto}`);
    assert.equal(nomeComTelefone.divulgacoes.length, 0);
  });

  void it('CASO 2 — COM consentimento, nome, e-mail e telefone são entregues para o tutor', async () => {
    const { app, divulgacoes, recados } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: {
        message: 'Ela está comigo, calma e bem.',
        finder_contact: { ...contatoDoAchador(DO_ACHADOR), share_consent: consentimento },
      },
    });
    await app.close();

    assert.equal(resposta.status, 200, resposta.bruto);
    assert.equal(divulgacoes.length, 1, `o contato não foi divulgado: ${resposta.bruto}`);

    const { pedido } = divulgacoes[0]!;
    const contato = pedido['contato'] as Record<string, unknown>;
    assert.equal(contato['nome'], DO_ACHADOR.nome);
    assert.equal(contato['email'], DO_ACHADOR.email);
    assert.equal(contato['telefone'], DO_ACHADOR.telefone, 'o telefone não foi divulgado');

    // A resposta confirma ao PRÓPRIO achador que ele compartilhou.
    const quando = resposta.corpo['contact_shared_at'];
    assert.equal(typeof quando, 'string', `\`contact_shared_at\` não saiu: ${resposta.bruto}`);
    assert.equal(new Date(String(quando)).getTime(), AGORA);

    // O recado de "Contar mais" continua indo pela conversa pelo caminho de
    // sempre, e REDIGIDO: o consentimento abre o contato, e não o texto livre.
    assert.equal(recados.length, 1, 'o recado deixou de ir para a conversa');
    assert.ok(
      !recados[0]!.includes(DO_ACHADOR.telefone),
      'o recado livre passou a carregar telefone em claro',
    );
  });

  void it('CASO 3 — o registro guarda o texto lido, o instante e a finalidade', async () => {
    const { app, divulgacoes } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: {
        finder_contact: {
          ...contatoDoAchador(DO_ACHADOR),
          share_consent: {
            ...consentimento,
            // O cliente tenta ditar o texto. O servidor NÃO pode gravar isto: o
            // cliente é a parte interessada, e texto dele não prova nada.
            consent_text: 'eu concordo com tudo para sempre',
          },
        },
      },
    });
    await app.close();

    assert.equal(resposta.status, 200, resposta.bruto);
    assert.equal(divulgacoes.length, 1, `nada foi registrado: ${resposta.bruto}`);
    const { pedido } = divulgacoes[0]!;

    const texto = pedido['textoDoConsentimento'];
    assert.equal(typeof texto, 'string', 'o registro foi pedido sem o texto lido');
    const lido = String(texto);
    assert.notEqual(lido.trim(), '', 'texto vazio não demonstra consentimento nenhum');
    assert.ok(
      !lido.includes('para sempre'),
      `o servidor gravou o texto que o CLIENTE mandou: ${lido}`,
    );
    // As três coisas que fazem o consentimento existir estão escritas no texto.
    for (const exigido of ['finalidade exclusiva', 'tutor', 'opcional']) {
      assert.ok(lido.includes(exigido), `o texto lido não diz \`${exigido}\`: ${lido}`);
    }
    assert.equal(pedido['versaoDoConsentimento'], VERSAO, 'a versão do texto não foi registrada');
    assert.equal(
      new Date(String(resposta.corpo['contact_shared_at'])).getTime(),
      AGORA,
      'o instante do consentimento não é o da requisição',
    );

    // Versão que não é nossa não resolve para texto nenhum, e por isso é recusada:
    // gravar "consentiu" sem saber o que ele leu é gravar nada.
    const desconhecida = bancada();
    const recusa = await pedir(desconhecida.app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: {
        finder_contact: {
          ...contatoDoAchador(DO_ACHADOR),
          share_consent: { accepted: true, consent_version: '1999-01-01' },
        },
      },
    });
    await desconhecida.app.close();
    assert.equal(recusa.status, 400, `versão desconhecida foi aceita: ${recusa.bruto}`);
    assert.equal(desconhecida.divulgacoes.length, 0, 'divulgou sob versão que não existe');
  });

  void it('CASO 4 — divulgar o contato do achador não abre nada do tutor para ele', async () => {
    const { app, divulgacoes } = bancada();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: '/finder/found-report',
      corpo: {
        finder_contact: { ...contatoDoAchador(DO_ACHADOR), share_consent: consentimento },
      },
    });
    await app.close();

    assert.equal(resposta.status, 200, resposta.bruto);
    assert.equal(divulgacoes.length, 1, 'sem divulgação não há o que medir nesta direção');

    // O sentido é UM. A página diz "quem acha nunca vê telefone nem endereço do
    // tutor", e esta decisão não a emenda.
    exigirQueNaoVaza(resposta, 'PATCH com consentimento');
    const divulgado = JSON.stringify(divulgacoes[0]!.pedido);
    for (const doTutor of [DO_TUTOR.email, DO_TUTOR.telefone, DO_TUTOR.endereco, DO_TUTOR.userId]) {
      assert.ok(
        !divulgado.includes(doTutor),
        `dado do TUTOR entrou no pedido de divulgação: ${doTutor}`,
      );
    }
  });
});

/** `finder_contact` com os três campos de contato, sem o consentimento. */
function contatoDoAchador(de: {
  nome: string;
  email: string;
  telefone: string;
}): Record<string, unknown> {
  return { display_name: de.nome, email: de.email, phone_e164: de.telefone };
}

void describe('o token nas duas operações, pelo que o CONTRATO declara', () => {
  const invalido = problemaDaResposta('FinderLinkInvalid');
  const vencido = problemaDaResposta('FinderAccessEnded');

  void it('as duas declaram FinderLinkInvalid e FinderAccessEnded nos status do contrato', () => {
    for (const { operationId } of OPERACOES) {
      assert.equal(respostaDeclarada(operationId, invalido.status), 'FinderLinkInvalid');
      assert.equal(respostaDeclarada(operationId, vencido.status), 'FinderAccessEnded');
    }
  });

  void it('ausente, malformado ou desconhecido: o MESMO corpo de FinderLinkInvalid, com WWW-Authenticate', async () => {
    const casos: { rotulo: string; token?: string | null; cenario?: Cenario }[] = [
      { rotulo: 'ausente', token: null },
      { rotulo: 'malformado', token: 'curto' },
      { rotulo: 'desconhecido', token: 'X'.repeat(43) },
      { rotulo: 'recusado pela conversa', cenario: { acesso: { situacao: 'recusado' } } },
    ];
    const corpos = new Set<string>();
    for (const operacao of OPERACOES) {
      for (const caso of casos) {
        const { app, mudancas, recados, intencoes } = bancada(caso.cenario);
        const resposta = await pedir(app, { ...operacao.pedido, token: caso.token });
        await app.close();
        const onde = `${operacao.operationId}, token ${caso.rotulo}`;
        assert.equal(resposta.status, invalido.status, `${onde}: ${resposta.bruto}`);
        assert.equal(tipoDe(resposta.corpo), invalido.slug, onde);
        if (invalido.cabecalhos.includes('www-authenticate')) {
          assert.equal(resposta.cabecalhos['www-authenticate'], 'Bearer', `${onde}: sem WWW-Authenticate`);
        }
        assert.equal(mudancas.length + recados.length + intencoes.length, 0, `${onde}: algo foi gravado`);
        corpos.add(corpoSemCorrelacao(resposta));
        exigirQueNaoVaza(resposta, onde);
      }
    }
    assert.equal(corpos.size, 1, `os corpos de ${invalido.slug} diferem: ${[...corpos].join(' | ')}`);
  });

  void it('token vencido: FinderAccessEnded nas duas, com corpo fixo e nada gravado', async () => {
    const corpos = new Set<string>();
    for (const operacao of OPERACOES) {
      const { app, mudancas, recados, intencoes } = bancada({ acesso: { situacao: 'vencido' } });
      const resposta = await pedir(app, operacao.pedido);
      await app.close();
      assert.equal(resposta.status, vencido.status, `${operacao.operationId}: ${resposta.bruto}`);
      assert.equal(tipoDe(resposta.corpo), vencido.slug, operacao.operationId);
      assert.ok(!resposta.bruto.includes('Aurora'), `${operacao.operationId}: o nome do pet saiu no 410`);
      assert.equal(mudancas.length + recados.length + intencoes.length, 0);
      corpos.add(corpoSemCorrelacao(resposta));
    }
    assert.equal(corpos.size, 1, `o 410 do link vencido varia entre as operações: ${[...corpos].join(' | ')}`);
  });
});

void describe('createFinderPhotoUploadIntent: referência opaca, nunca o id', () => {
  void it('201 com `FinderUploadIntent` exato, `upload_ref` de 22 caracteres e nenhum UUID', async () => {
    const { app, intencoes } = bancada();
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: '/media/finder-photo-intents',
      corpo: { content_type: 'image/jpeg', byte_size: 1_500_000 },
    });
    await app.close();

    assert.equal(resposta.status, 201, resposta.bruto);
    const declaradas = propriedadesDoContrato('FinderUploadIntent');
    for (const chave of Object.keys(resposta.corpo)) {
      assert.ok(declaradas.has(chave), `\`${chave}\` não está em FinderUploadIntent`);
    }
    assert.match(String(resposta.corpo['upload_ref']), /^[A-Za-z0-9_-]{22}$/);
    assert.equal(intencoes.length, 1);
    assert.equal(intencoes[0]?.uploadRef, resposta.corpo['upload_ref']);
    assert.equal(intencoes[0]?.foundReportId, AVISO, 'a intenção não ficou ligada ao aviso do token');
    assert.ok(!String(intencoes[0]?.objectKey).includes(AVISO), 'a chave do objeto carrega o id do aviso');
    exigirQueNaoVaza(resposta, 'POST /media/finder-photo-intents');
  });

  void it('acima do teto único de envio é recusado, e a quarta foto do aviso não sai', async () => {
    const grande = bancada();
    const acima = await pedir(grande.app, {
      metodo: 'POST',
      url: '/media/finder-photo-intents',
      corpo: { content_type: 'image/jpeg', byte_size: TETO_DE_BYTES_DA_FOTO_DO_ACHADO + 1 },
    });
    await grande.app.close();
    assert.ok(
      acima.status === 400 || acima.status === 415,
      `acima do teto passou: ${String(acima.status)}`,
    );
    assert.equal(grande.intencoes.length, 0);

    const cheio = bancada({ fotosJaPedidas: 3 });
    const quarta = await pedir(cheio.app, {
      metodo: 'POST',
      url: '/media/finder-photo-intents',
      corpo: { content_type: 'image/jpeg', byte_size: 1000 },
    });
    await cheio.app.close();
    assert.equal(quarta.status, 429);
    assert.equal(cheio.intencoes.length, 0);
  });

  void it('conversa fechada ou aviso encerrado: 410, e nenhuma autorização de escrita sai', async () => {
    const encerrado = problemaDaResposta('FinderAccessEnded');
    for (const cenario of [
      { acesso: { situacao: 'valido', aceitaMensagem: false } } as Cenario,
      { statusDoAviso: 'closed' } as Cenario,
    ]) {
      const { app, intencoes } = bancada(cenario);
      const resposta = await pedir(app, {
        metodo: 'POST',
        url: '/media/finder-photo-intents',
        corpo: { content_type: 'image/jpeg', byte_size: 1000 },
      });
      await app.close();
      assert.equal(resposta.status, encerrado.status, JSON.stringify(cenario));
      assert.equal(tipoDe(resposta.corpo), encerrado.slug);
      assert.equal(intencoes.length, 0);
    }
  });

  void it('o token em claro não chega ao repositório do aviso: só o resumo', async () => {
    const { app, argumentos } = bancada();
    await pedir(app, {
      metodo: 'POST',
      url: '/media/finder-photo-intents',
      corpo: { content_type: 'image/jpeg', byte_size: 1000 },
    });
    await pedir(app, { metodo: 'PATCH', url: '/finder/found-report', corpo: { finder_contact: { display_name: 'Ana' } } });
    await app.close();
    const tudo = JSON.stringify(argumentos, (_chave, valor: unknown) =>
      valor instanceof Uint8Array ? Buffer.from(valor).toString('utf8') : valor,
    );
    assert.ok(!tudo.includes(TOKEN), 'o token em claro chegou ao repositório');
  });
});
