/**
 * `POST /directory/suggestions`, sobre um Fastify de verdade e com o CONTRATO
 * de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque quatro coisas que esta
 * operacao promete so existem com o framework no caminho: o **401** de quem nao
 * tem conta (a credencial e lida na borda), o **429** do teto (gancho, e nao um
 * `if`), a **recusa do campo desconhecido** (um `preValidation`, antes do Ajv) e
 * a **serializacao real** da resposta -- que e onde um `id` vazaria.
 *
 * O esquema do corpo e o do `api/openapi.yaml` carregado do disco, e nao um
 * objeto inline: e esse carregamento que faz estes casos reprovarem quando a
 * operacao sai da especificacao ou muda de forma la.
 *
 * ## O limite deste arquivo, dito em voz alta
 *
 * O detector de D59 de verdade (`errosDeTextoDeUsuario`, de
 * `modules/network/domain`) **nao pode ser importado daqui**:
 * `arquitetura/fronteira-de-modulo` reprova, inclusive em `.test.ts`. Em
 * producao ele chega por `src/bin/api.ts`. Entao os casos de D59 aqui provam o
 * CAMINHO -- que os dois textos vao ao detector e que a recusa dele vira um
 * `400` com campo e `code` --, e nao o detector. Um caso de ponta a ponta com o
 * texto real precisa morar em `tests/`, que nao tem essa fronteira.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { ProblemFieldError } from '../../../../shared/http/problem.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import { SugestaoDoDiretorio } from '../../application/sugestao-do-diretorio.js';
import type { CanalDeContatoDoChamador } from '../../application/sugestao-do-diretorio.js';
import type { ConferenciasDeTexto } from '../../ports/conferencias-de-texto.js';
import type {
  DirectorySuggestionRepository,
  SugestaoAGravar,
} from '../../ports/directory-suggestion-repository.js';
import {
  registrarRotaDeSugestaoDoDiretorio,
  rotaDaSugestaoDoDiretorio,
} from './directory-suggestion-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRA_CONTA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000;
const CRIADO_EM = comoData(Date.UTC(2026, 9, 17, 12, 0, 0) as Instant);
const REF = 'u7YkQwE2tLm9ZpR4sAbC';

const CORPO_VALIDO = {
  display_name: 'Clínica Veterinária Santa Bárbara',
  kind: 'clinic',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  public_contact: { kind: 'phone', value: '+551130612200' },
  note: 'Atenderam meu cão de madrugada.',
};

interface Cenario {
  readonly contador?: RateLimitStore;
  /** Campos que o detector de texto deve recusar, com o `code` de D59. */
  readonly recusarTexto?: readonly string[];
  /**
   * A conta que chama tem canal de contato verificado? **O padrao e `true`**,
   * e o padrao e que torna o caso da isca honesto: todo outro cenario deste
   * arquivo mede outra coisa, e com o padrao `false` eles passariam a medir a
   * trava de validacao sem dizer.
   */
  readonly validada?: boolean;
}

/** O que o repositorio recebeu, por cenario. Zerado em cada `servidor()`. */
let gravadas: SugestaoAGravar[] = [];
let trilhaDeTeste: AuditEvent[] = [];

function repositorio(): DirectorySuggestionRepository {
  return {
    registrar: (sugestao) => {
      gravadas.push(sugestao);
      // **`tipo: 'gravada'` desde 29/10/2026.** `registrar` passou a poder
      // RECUSAR, porque com o logotipo ela confirma o envio na mesma transacao
      // -- e um `upload_id` de outra conta, de outro proposito, vencido ou ja
      // usado devolve `envio_nao_serve`. Este dobre sempre GRAVA: o caminho de
      // recusa e medido contra a pilha de verdade, onde existe envio para
      // conferir.
      return Promise.resolve({
        tipo: 'gravada' as const,
        sugestao: { ref: REF, createdAt: CRIADO_EM },
      });
    },
    // Este arquivo nao mede a LEITURA: o dobre recusa em voz alta em vez de
    // devolver pagina vazia, que passaria por resultado legitimo. Quem mede
    // `listarDoAutor` e `minhas-indicacoes-routes.test.ts`.
    listarDoAutor: () =>
      Promise.reject(new Error('cenario de escrita: listarDoAutor nao e exercitado aqui')),
  };
}

/** Quais contas o servidor considera VALIDADAS, por cenario. */
let consultasDeCanal: UserId[] = [];

function canal(cenario: Cenario): CanalDeContatoDoChamador {
  return {
    temCanalVerificado: (conta) => {
      consultasDeCanal.push(conta);
      return Promise.resolve(cenario.validada ?? true);
    },
  };
}

/** Ver o cabecalho: o detector de verdade nao e importavel daqui. */
function conferencias(cenario: Cenario): ConferenciasDeTexto {
  return {
    errosDeTextoDeUsuario: (campo): ProblemFieldError[] =>
      (cenario.recusarTexto ?? []).includes(campo)
        ? [
            {
              field: campo,
              code: 'contact_or_payment_detected',
              message: 'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
            },
          ]
        : [],
    handleDoInstagram: (valor): string | null => {
      const texto = valor.trim().startsWith('@') ? valor.trim().slice(1) : valor.trim();
      return /^[A-Za-z0-9._]{1,30}$/.test(texto) ? texto.toLowerCase() : null;
    },
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  gravadas = [];
  trilhaDeTeste = [];
  consultasDeCanal = [];
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotaDeSugestaoDoDiretorio(app, {
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    sugestoes: new SugestaoDoDiretorio({
      sugestoes: repositorio(),
      trilha: {
        record: (evento) => {
          trilhaDeTeste.push(evento);
          return Promise.resolve();
        },
      },
      conferencias: conferencias(cenario),
      canal: canal(cenario),
    }),
    // O CONTRATO DE VERDADE, do disco.
    contrato: carregarContrato(resolve(process.cwd(), 'api/openapi.yaml')),
  });
  return app;
}

interface Resposta {
  readonly status: number;
  readonly cache: string | string[] | number | undefined;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function sugerir(
  app: RegistradorDeRotas,
  opcoes: { corpo?: Record<string, unknown>; como?: UserId | null } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? QUEM_CHAMA : opcoes.como;
  const resposta = await app.inject({
    method: 'POST',
    url: '/directory/suggestions',
    payload: opcoes.corpo ?? CORPO_VALIDO,
    ...(como === null ? {} : { headers: { authorization: `Bearer ${como}` } }),
  });
  return {
    status: resposta.statusCode,
    cache: resposta.headers['cache-control'],
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

function errosDe(resposta: Resposta): { field: string; code: string }[] {
  return (resposta.corpo['errors'] ?? []) as { field: string; code: string }[];
}

void describe('a rota esta REGISTRADA, e com o teto que o contrato declara', () => {
  void it('a operacao do contrato e a rota declaram o MESMO caminho, metodo e efeito', () => {
    const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
    const operacao = contrato.operacoes.get('suggestDirectoryEntry');
    assert.notEqual(operacao, undefined, 'a operacao saiu do contrato');
    assert.equal(operacao?.method, rotaDaSugestaoDoDiretorio.method);
    assert.equal(operacao?.path, rotaDaSugestaoDoDiretorio.path);
    assert.deepEqual([...(operacao?.effects ?? [])], ['human_work']);
    assert.equal(operacao?.hasRateLimit, true);
    assert.deepEqual([...(operacao?.securitySchemes ?? [])], ['bearerAuth']);
  });

  void it('o teto da rota e COPIA do `x-rate-limit` do contrato: 5 por conta em 24h, `deny_429`', () => {
    const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
    const declarado = contrato.operacoes.get('suggestDirectoryEntry')?.raw['x-rate-limit'] as {
      dimension: string[];
      limit: number;
      window: string;
      on_exceed: string;
    }[];
    assert.equal(declarado.length, rotaDaSugestaoDoDiretorio.rateLimit.length);
    assert.deepEqual(declarado[0]?.dimension, [...rotaDaSugestaoDoDiretorio.rateLimit[0].dimension]);
    assert.equal(declarado[0]?.limit, rotaDaSugestaoDoDiretorio.rateLimit[0].limit);
    assert.equal(declarado[0]?.window, rotaDaSugestaoDoDiretorio.rateLimit[0].window);
    assert.equal(declarado[0]?.on_exceed, rotaDaSugestaoDoDiretorio.rateLimit[0].onExceed);
  });

  void it('a 6a sugestao da mesma conta em 24h e recusada com 429', async () => {
    const app = servidor({ contador: criarContadorEmMemoria(() => AGORA) });
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await sugerir(app)).status, 201, `a sugestao ${String(i + 1)} deveria passar`);
    }
    assert.equal(
      (await sugerir(app)).status,
      429,
      'ISCA: com `log_and_alert` no lugar de `deny_429`, esta chamada responde 201.',
    );
  });

  void it('com o contador desligado, a 6a passa -- e e isso que prova que o caso mede LIMITE', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    for (let i = 0; i < 5; i += 1) await sugerir(app);
    assert.equal(
      (await sugerir(app)).status,
      201,
      'o mesmo caminho com o mecanismo desligado precisa deixar passar. Sem este controle, o caso acima mediria a capacidade de contar ate 6.',
    );
  });

  void it('o teto e POR CONTA: a conta vizinha nao herda o balde da primeira', async () => {
    const app = servidor({ contador: criarContadorEmMemoria(() => AGORA) });
    for (let i = 0; i < 5; i += 1) await sugerir(app);
    assert.equal((await sugerir(app, { como: OUTRA_CONTA })).status, 201);
  });

  void it('o teto nao e por `ip`: no CGNAT das operadoras isso pegaria vizinho inocente', () => {
    // `dimension.includes('ip')` aqui **nao compila**: `defineRoute` preserva a
    // tupla, entao a dimensao e o literal `'account'` e perguntar por `'ip'` e
    // erro de tipo. O caso confere o conteudo, que e o que resta para conferir.
    for (const entrada of rotaDaSugestaoDoDiretorio.rateLimit) {
      assert.deepEqual([...entrada.dimension], ['account']);
    }
  });
});

void describe('a rota exige conta', () => {
  void it('sem cabecalho de credencial, 401 -- e nada e gravado', async () => {
    const app = servidor();
    const resposta = await sugerir(app, { como: null });
    assert.equal(resposta.status, 401);
    assert.equal(gravadas.length, 0, 'uma sugestao sem autor nao e sugestao');
  });
});

void describe('a sugestao nasce PENDENTE, e a autoria e gravada', () => {
  void it('201, e o recibo diz `pending`: nada aparece no `Perto` ate alguem olhar', async () => {
    const resposta = await sugerir(servidor());
    assert.equal(resposta.status, 201);
    assert.equal(resposta.corpo['state'], 'pending');
  });

  void it('a AUTORIA gravada e a conta que chamou, e nao o que o corpo disser', async () => {
    const app = servidor();
    await sugerir(app, { como: OUTRA_CONTA });
    assert.equal(gravadas.length, 1);
    assert.equal(gravadas[0]?.autor, OUTRA_CONTA);
  });

  void it('`review_status` NAO e escrito pela borda: ele nao existe no que se grava', async () => {
    await sugerir(servidor());
    assert.equal(
      Object.keys(gravadas[0] ?? {}).some((chave) => chave.toLowerCase().includes('status')),
      false,
      'estado inicial que viaja em argumento e estado que um dia chega diferente: ele vem do DEFAULT da tabela',
    );
  });

  void it('o texto e gravado APARADO, e bairro e recado ausentes viram nulo', async () => {
    const app = servidor();
    await sugerir(app, {
      corpo: {
        display_name: '  Pet Shop do Bairro  ',
        kind: 'groomer',
        city: '  Santos ',
        state: 'SP',
        public_contact: { kind: 'phone', value: '+551330612200' },
      },
    });
    assert.equal(gravadas[0]?.displayName, 'Pet Shop do Bairro');
    assert.equal(gravadas[0]?.city, 'Santos');
    assert.equal(gravadas[0]?.neighborhood, null);
    assert.equal(gravadas[0]?.note, null);
  });

  void it('`Cache-Control: private, no-store`: recibo de fila nao e resposta cacheavel', async () => {
    assert.equal((await sugerir(servidor())).cache, 'private, no-store');
  });
});

void describe('o recibo nao entrega identidade interna', () => {
  void it('traz `reference`, `state` e `created_at`, e MAIS NADA', async () => {
    const resposta = await sugerir(servidor());
    assert.deepEqual(Object.keys(resposta.corpo).sort(), ['created_at', 'reference', 'state']);
    assert.equal(resposta.corpo['reference'], REF);
    assert.equal(resposta.corpo['created_at'], CRIADO_EM.toISOString());
  });

  void it('ISCA: nenhum UUID no corpo da resposta, em nenhuma forma', async () => {
    const resposta = await sugerir(servidor());
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
      `ADR-0010 item 6: o recibo e o \`ref\`, e nunca o \`id\`. Corpo: ${resposta.bruto}`,
    );
  });

  void it('ISCA: a resposta NAO devolve o texto sugerido -- recibo nao e publicacao', async () => {
    const resposta = await sugerir(servidor());
    for (const vazamento of ['Santa Bárbara', 'Pinheiros', '+551130612200', 'madrugada']) {
      assert.equal(resposta.bruto.includes(vazamento), false, vazamento);
    }
  });

  void it('ISCA: a resposta nao diz quem sugeriu -- vinculo entre duas pessoas nao sai', async () => {
    const resposta = await sugerir(servidor(), { como: QUEM_CHAMA });
    assert.equal(resposta.bruto.includes(QUEM_CHAMA), false);
  });
});

void describe('o corpo e FECHADO: campo desconhecido e RECUSADO, e nao apagado em silencio', () => {
  void it('ISCA: cada campo que esta operacao nao aceita responde 400 `unknown_field`', async () => {
    for (const extra of [
      { verification_level: 'document_verified' },
      { status: 'published' },
      { crmv_number: '12345' },
      { cnpj: '12345678901234' },
      { slug: 'clinica-escolhida' },
      { about: 'Texto do perfil' },
      { source: 'community' },
      { street_address: 'Avenida Brasil, 200' },
      { geo: { lat: -23.5, lon: -46.6 } },
      { review_status: 'approved' },
      // A tentativa de escrever a AUTORIA pelo corpo. O nome real da coluna nao
      // pode ser escrito aqui -- `portao-colunas-que-nao-saem` reprova o nome
      // literal em qualquer `.ts` de `src/`, comentario incluido --, e essa
      // impossibilidade e parte da protecao: o campo nao existe no contrato, e
      // o nome dele nao existe no codigo do servidor.
      { suggested_by: QUEM_CHAMA },
    ]) {
      const resposta = await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, ...extra } });
      const nome = Object.keys(extra)[0] ?? '';
      assert.equal(resposta.status, 400, `${nome}: ${resposta.bruto}`);
      assert.equal(
        errosDe(resposta).some((e) => e.field === nome && e.code === 'unknown_field'),
        true,
        `o Ajv do Fastify roda com \`removeAdditional: true\`: sem o guarda, ${nome} seria APAGADO e a resposta sairia 201`,
      );
      assert.equal(gravadas.length, 0, `${nome} chegou a ser gravado`);
    }
  });
});

void describe('as conferencias de texto, que sao a unica coisa que olha antes da fila', () => {
  void it('`display_name` com contato ou pagamento responde 400, com o campo e `code` de D59', async () => {
    const resposta = await sugerir(servidor({ recusarTexto: ['display_name'] }));
    assert.equal(resposta.status, 400);
    assert.deepEqual(errosDe(resposta), [
      {
        field: 'display_name',
        code: 'contact_or_payment_detected',
        message: 'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
      },
    ]);
    assert.equal(gravadas.length, 0);
  });

  void it('`note` com contato ou pagamento responde 400, com o campo e `code` de D59', async () => {
    const resposta = await sugerir(servidor({ recusarTexto: ['note'] }));
    assert.equal(resposta.status, 400);
    assert.equal(errosDe(resposta)[0]?.field, 'note');
    assert.equal(errosDe(resposta)[0]?.code, 'contact_or_payment_detected');
  });

  void it('o tamanho vem do CONTRATO, pelo Ajv: nome de 1 caractere e recado de 281 reprovam', async () => {
    assert.equal(
      (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, display_name: 'C' } })).status,
      400,
    );
    assert.equal(
      (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, note: 'a'.repeat(281) } })).status,
      400,
    );
  });

  void it('`state` fora de duas letras maiusculas reprova pelo contrato', async () => {
    for (const state of ['sp', 'São Paulo', 'S']) {
      assert.equal(
        (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, state } })).status,
        400,
        state,
      );
    }
  });

  void it('`kind` fora da lista fechada de `professionals.kind` reprova pelo contrato', async () => {
    for (const kind of ['ong', 'petshop', 'vet ']) {
      assert.equal(
        (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, kind } })).status,
        400,
        kind,
      );
    }
  });
});

void describe('o contato publico: cada `kind` aceita o SEU formato e recusa o dos outros', () => {
  const aceitos: [string, string][] = [
    ['phone', '+551130612200'],
    ['website', 'https://clinicasantabarbara.com.br/contato'],
    ['instagram', '@bichu.app'],
  ];

  void it('cada `kind` aceita o proprio formato, e o valor vai gravado com o tipo', async () => {
    for (const [kind, value] of aceitos) {
      const app = servidor();
      const resposta = await sugerir(app, { corpo: { ...CORPO_VALIDO, public_contact: { kind, value } } });
      assert.equal(resposta.status, 201, `${kind}=${value}: ${resposta.bruto}`);
      assert.equal(gravadas[0]?.contatoKind, kind);
      assert.equal(gravadas[0]?.contatoValue, value);
    }
  });

  void it('ISCA: cada `kind` RECUSA o formato dos outros dois, nomeando `public_contact.value`', async () => {
    for (const [kind] of aceitos) {
      for (const [outro, value] of aceitos) {
        if (outro === kind) continue;
        const resposta = await sugerir(servidor(), {
          corpo: { ...CORPO_VALIDO, public_contact: { kind, value } },
        });
        assert.equal(resposta.status, 400, `${kind} aceitou o valor de ${outro}: ${value}`);
        assert.equal(errosDe(resposta)[0]?.field, 'public_contact.value', `${kind} / ${value}`);
        assert.equal(gravadas.length, 0, `${kind} gravou o valor de ${outro}`);
      }
    }
  });

  void it('o corpo do contato tambem e fechado: `kind` desconhecido e campo extra reprovam', async () => {
    assert.equal(
      (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, public_contact: { kind: 'whatsapp', value: '+551130612200' } } })).status,
      400,
    );
    assert.equal(
      (await sugerir(servidor(), { corpo: { ...CORPO_VALIDO, public_contact: { kind: 'phone', value: '+551130612200', label: 'comercial' } } })).status,
      400,
    );
  });
});

void describe('a trilha: `directory_suggestion.submitted`', () => {
  void it('grava a acao, o ator e o `ref` -- e NAO o `id` interno', async () => {
    await sugerir(servidor(), { como: QUEM_CHAMA });
    assert.equal(trilhaDeTeste.length, 1);
    const evento = trilhaDeTeste[0];
    assert.equal(evento?.action, 'directory_suggestion.submitted');
    assert.equal(evento?.actorKind, 'user');
    assert.equal(evento?.actorUserId, QUEM_CHAMA);
    assert.equal(evento?.resourceKind, 'directory_suggestion');
    assert.equal(evento?.resourceId, REF);
  });

  void it('o IP vai EM CLARO para a porta, que o transforma em HMAC (SEC-010)', async () => {
    await sugerir(servidor());
    // A porta da trilha e quem aplica o HMAC. Um hash aplicado tambem aqui
    // seria uma segunda implementacao da mesma regra, e duas divergem.
    assert.equal(typeof trilhaDeTeste[0]?.actorIp, 'string');
    assert.equal(trilhaDeTeste[0]?.actorIp?.includes('127.0.0.1'), true);
  });

  void it('ISCA: o metadado nao carrega o nome sugerido, o contato nem o recado', async () => {
    await sugerir(servidor());
    const metadados = JSON.stringify(trilhaDeTeste[0]?.after ?? {});
    for (const vazamento of ['Santa Bárbara', '+551130612200', 'madrugada']) {
      assert.equal(metadados.includes(vazamento), false, vazamento);
    }
    assert.equal((trilhaDeTeste[0]?.after as Record<string, unknown>)['contact_kind'], 'phone');
    assert.equal((trilhaDeTeste[0]?.after as Record<string, unknown>)['review_status'], 'pending');
  });

  void it('corpo recusado nao gera trilha: nao houve sugestao para registrar', async () => {
    await sugerir(servidor({ recusarTexto: ['display_name'] }));
    assert.equal(trilhaDeTeste.length, 0);
  });
});

/**
 * A ISCA DA TRAVA DE CONTA VALIDADA (regra do cliente, dita duas vezes).
 *
 * ## Por que ela existe, e por que ela nao mede a tela
 *
 * A tela esconde o icone de sugerir de quem nao validou, e isso e cortesia --
 * nao e recusa. Estes casos chamam a rota **direto**, sem passar pela tela, que
 * e exatamente o que um cliente curioso, um script ou uma versao antiga do app
 * fazem. A trava que vive so no app nao recusa nada aqui.
 *
 * ## O contrapeso NAO e enfeite
 *
 * O segundo caso e o que torna o primeiro uma medicao: um `temCanalVerificado`
 * fixo em `false` passaria no caso da recusa, e passaria pelo motivo errado. Os
 * dois casos sao o mesmo caminho com o mecanismo nos dois estados.
 *
 * ESCRITA E NAO RODADA nesta sessao (ordem do cliente: nada de suite unitaria
 * nem de integracao). O que foi rodado esta no relatorio.
 */
void describe('ISCA: so conta VALIDADA sugere, e a recusa e do SERVIDOR', () => {
  void it('conta valida e NAO validada, chamando a rota direto, recebe 409 `contact-channel-unverified`', async () => {
    const app = servidor({ validada: false });
    const resposta = await sugerir(app, { como: QUEM_CHAMA });
    assert.equal(
      resposta.status,
      409,
      `com a trava apenas no app, esta chamada responde 201: ${resposta.bruto}`,
    );
    assert.equal(resposta.corpo['type'], `${BASE_DE_PROBLEMA}/contact-channel-unverified`);
    assert.equal(
      resposta.corpo['next_action'],
      'verify_email',
      'sem `next_action` a tela le "confirme seu e-mail" e nao tem caminho para fazer isso agora',
    );
    assert.equal(gravadas.length, 0, 'nada entrou na fila de revisao');
    assert.equal(trilhaDeTeste.length, 0, 'nao houve sugestao para registrar na trilha');
  });

  void it('CONTRAPESO: a MESMA chamada com a conta validada passa (201)', async () => {
    const resposta = await sugerir(servidor({ validada: true }), { como: QUEM_CHAMA });
    assert.equal(resposta.status, 201, resposta.bruto);
    assert.equal(gravadas.length, 1);
  });

  void it('a pergunta e feita sobre a conta do TOKEN, e nao sobre o que o corpo disser', async () => {
    await sugerir(servidor({ validada: false }), { como: OUTRA_CONTA });
    assert.deepEqual(consultasDeCanal, [OUTRA_CONTA]);
  });

  void it('o tipo e o MESMO de criar encontro: uma regua so para "validado" no produto', () => {
    assert.equal(
      problemas.canalDeContatoNaoVerificadoParaSugestao().problemType,
      problemas.canalDeContatoNaoVerificadoParaEncontro().problemType,
      'um `type` novo para a mesma pergunta faria o app decidir por tres onde ha um conceito',
    );
  });

  void it('o 409 esta DECLARADO na operacao do contrato, e nao so no codigo', () => {
    const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
    const respostas = (contrato.operacoes.get('suggestDirectoryEntry')?.raw['responses'] ??
      {}) as Record<string, unknown>;
    assert.equal(
      Object.keys(respostas).includes('409'),
      true,
      'resposta que o servidor manda e o contrato nao declara e contrato que mente',
    );
  });
});

/**
 * A MODERACAO DE PALAVRAS, medida **pela rota** e nao pelo dominio.
 *
 * Este bloco existe separado das conferencias de D59 por um motivo de prova: as
 * iscas de `shared/texto/moderacao.test.ts` provam a FUNCAO, e uma funcao certa
 * que ninguem chama nao protege nada. O que falta provar e que a recusa
 * acontece **no caminho de escrita**, com `app.inject` falando HTTP direto --
 * sem aplicativo, sem tela e sem nenhum aviso de formulario no meio. E essa a
 * unica forma da pergunta "um `curl` escreveria isto?".
 *
 * **Desligamento**: tire `errosDeModeracao` de `errosDaSugestao` e os tres
 * primeiros casos viram `201`.
 */
void describe('ISCA: a moderacao de palavras vale CHAMANDO A API DIRETO', () => {
  void it('xingamento em `display_name` responde 400 e NAO grava na fila', async () => {
    const resposta = await sugerir(servidor(), {
      corpo: { ...CORPO_VALIDO, display_name: 'Clínica dos Babacas' },
    });
    assert.equal(resposta.status, 400);
    assert.equal(errosDe(resposta)[0]?.field, 'display_name');
    assert.equal(errosDe(resposta)[0]?.code, 'inappropriate_language');
    assert.equal(gravadas.length, 0);
    assert.equal(trilhaDeTeste.length, 0);
  });

  void it('xingamento no `note` responde 400, e o corpo nao devolve a palavra nem a lista', async () => {
    const resposta = await sugerir(servidor(), {
      corpo: { ...CORPO_VALIDO, note: 'Atendimento de merda, não voltem lá.' },
    });
    assert.equal(resposta.status, 400);
    assert.equal(errosDe(resposta)[0]?.code, 'inappropriate_language');
    // A palavra medida nao volta em NENHUMA posicao da resposta, e a lista
    // tambem nao: o `400` nao e oraculo de quem quer descobri-la.
    for (const vazamento of ['merda', 'babaca', 'otario']) {
      assert.equal(resposta.bruto.toLowerCase().includes(vazamento), false, vazamento);
    }
    assert.equal(gravadas.length, 0);
  });

  void it('a troca obvia de caractere nao escapa pela borda', async () => {
    const resposta = await sugerir(servidor(), {
      corpo: { ...CORPO_VALIDO, note: 'esse lugar é um b@b4c4 só' },
    });
    assert.equal(resposta.status, 400);
    assert.equal(errosDe(resposta)[0]?.code, 'inappropriate_language');
  });

  void it('A ISCA MAIS IMPORTANTE: `Clínica Pinto` e `cadela` entram pela rota, com 201', async () => {
    const resposta = await sugerir(servidor(), {
      corpo: {
        ...CORPO_VALIDO,
        display_name: 'Clínica Pinto',
        note: 'Cuidaram da minha cadela e do gato preto com paciência.',
      },
    });
    assert.equal(resposta.status, 201, resposta.bruto);
    assert.equal(gravadas.length, 1);
  });

  void it('critica negativa dura entra pela rota: avaliacao ruim nao e ofensa', async () => {
    const resposta = await sugerir(servidor(), {
      corpo: {
        ...CORPO_VALIDO,
        note: 'Achei caro, o lugar estava sujo e nojento, e demoraram três horas.',
      },
    });
    assert.equal(resposta.status, 201, resposta.bruto);
  });
});
