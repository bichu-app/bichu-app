/**
 * As três rotas de `/me/devices` sobre um Fastify de verdade.
 *
 * O servidor sobe em vez de o handler ser chamado direto porque três coisas que
 * as rotas prometem só existem com o framework no caminho: o 429 do teto (que é
 * gancho `onRequest`, não `if` de handler), a validação do corpo a partir do
 * schema do contrato, e a **serialização real da resposta** — que é onde o
 * token de push vazaria.
 *
 * ## As iscas deste arquivo, e como foram provadas
 *
 * Cada mecanismo foi desligado no código de produção, rodado e visto reprovar
 * em 22/09/2026, e depois restaurado:
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `comoResposta` trocado por `{ ...aparelho, ... }` | 5 casos |
 * | `push_token` acrescentado a `Device` no contrato | 1 caso |
 * | `remover()` devolvendo `true` quando o repositório não achou (404 virando 204) | 2 casos |
 * | a trilha deixando de gravar a revogação | 3 casos |
 * | o `400` de `deleteDevice` removido do contrato | 1 caso (a isca da subida) |
 * | `rateLimit` removido da declaração da rota | **não compila** |
 * | dimensão `account` declarada sem resolvedor | **não compila** (TS2345) |
 * | `app.post` direto, fora de `registrarRota` | o portão de registro reprova |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock } from '../../../../shared/ports/index.js';
import { RegistroDeAparelhosService } from '../../application/registro-de-aparelhos-service.js';
import { podeReceberPush, type Aparelho } from '../../domain/aparelho.js';
import type { RegistroDeAparelhos } from '../../ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../../ports/push-sender.js';
import { registrarRotasDeAparelho } from './device-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000 as Instant;
const CAMINHO = '/me/devices';
const TOKEN = 'fcm-token-do-aparelho-da-tutora' as TokenDeAparelho;

/**
 * Registro em memória que **guarda por dono** e reproduz as três invariantes
 * que o banco impõe: um token uma conta, uma linha sem token por plataforma, e
 * a autorização no endereçamento.
 *
 * Reproduzir as invariantes é deliberado: um dublê frouxo aqui faria os casos
 * de reivindicação e de 404 passarem por acidente, medindo o dublê em vez do
 * código. O que ele **não** reproduz — a corrida do `ON CONFLICT` e o índice
 * parcial de fato existir — é justamente o que está em
 * `tests/integration/aparelho-e-token-de-push.test.ts`.
 */
function registro(): RegistroDeAparelhos & { readonly linhas: Map<string, Aparelho> } {
  const linhas = new Map<string, Aparelho>();
  let proximo = 0;

  return {
    linhas,
    registrar: (dono, entrada, agora) => {
      let anterior: Aparelho | undefined;
      if (entrada.pushToken !== null) {
        anterior = [...linhas.values()].find((a) => a.pushToken === entrada.pushToken);
      } else {
        anterior = [...linhas.values()].find(
          (a) => a.dono === dono && a.plataforma === entrada.plataforma && a.pushToken === null,
        );
      }
      const id = anterior?.id ?? `aparelho-${String((proximo += 1))}`;
      const aparelho: Aparelho = {
        id,
        dono,
        plataforma: entrada.plataforma,
        pushToken: entrada.pushToken,
        permissao: entrada.permissao,
        versaoDoApp: entrada.versaoDoApp,
        versaoDoSistema: entrada.versaoDoSistema,
        registradoEm: anterior?.registradoEm ?? agora,
        vistoEm: agora,
      };
      linhas.set(id, aparelho);
      if (entrada.pushToken !== null) {
        for (const [chave, linha] of linhas) {
          if (chave !== id && linha.dono === dono && linha.plataforma === entrada.plataforma && linha.pushToken === null) {
            linhas.delete(chave);
          }
        }
      }
      const reivindicadoDe =
        anterior === undefined || anterior.dono === dono ? null : anterior.dono;
      return Promise.resolve({ aparelho, reivindicadoDe });
    },
    listarDoDono: (dono) =>
      Promise.resolve([...linhas.values()].filter((aparelho) => aparelho.dono === dono)),
    revogarDoDono: (dono, aparelhoId) => {
      const linha = linhas.get(aparelhoId);
      // O dono no "WHERE" do dublê: sem esta conjunção, o caso do 404 passaria
      // por acidente e o critério da ADR-0021 ficaria sem medida.
      if (linha === undefined || linha.dono !== dono) return Promise.resolve(null);
      linhas.delete(aparelhoId);
      return Promise.resolve(linha);
    },
    revogarTodosDoDono: (dono) => {
      const alvos = [...linhas.values()].filter((a) => a.dono === dono);
      for (const alvo of alvos) linhas.delete(alvo.id);
      return Promise.resolve(alvos.length);
    },
    revogarPorToken: (token) => {
      const linha = [...linhas.values()].find((aparelho) => aparelho.pushToken === token);
      if (linha === undefined) return Promise.resolve(null);
      linhas.delete(linha.id);
      return Promise.resolve(linha);
    },
    contasAlcancaveisPorPush: (candidatos) =>
      Promise.resolve(
        new Set(
          [...linhas.values()]
            .filter((aparelho) => candidatos.includes(aparelho.dono) && podeReceberPush(aparelho))
            .map((aparelho) => aparelho.dono),
        ),
      ),
    enderecoDeEnvio: (aparelhoId) => {
      const linha = linhas.get(aparelhoId);
      if (linha === undefined || !podeReceberPush(linha)) return Promise.resolve(null);
      return Promise.resolve(linha.pushToken);
    },
  };
}

interface Cenario {
  readonly contador?: RateLimitStore;
}

function montar(cenario: Cenario = {}): {
  app: RegistradorDeRotas;
  repo: ReturnType<typeof registro>;
  eventos: AuditEvent[];
} {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });

  const repo = registro();
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => AGORA };

  registrarRotasDeAparelho(app, {
    aparelhos: new RegistroDeAparelhosService({ repositorio: repo, clock, trilha }),
    // O token É o id da conta neste dublê: cada caso diz de quem é a sessão.
    autenticador: {
      autenticar: (token: string) => Promise.resolve({ userId: token as UserId }),
    },
    // O contrato DE VERDADE: é ele que decide o schema do corpo, e uma cópia
    // aqui deixaria de acusar mudança na especificação.
    contrato: carregarContrato('api/openapi.yaml'),
  });

  return { app, repo, eventos };
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: {
    metodo: 'GET' | 'POST' | 'DELETE';
    caminho?: string;
    como?: UserId | null;
    corpo?: unknown;
  },
): Promise<{ status: number; bruto: string; corpo: unknown }> {
  const cabecalhos: Record<string, string> =
    opcoes.como === null ? {} : { authorization: `Bearer ${opcoes.como ?? DONO}` };
  const url = opcoes.caminho ?? CAMINHO;
  const resposta =
    opcoes.corpo === undefined
      ? await app.inject({ method: opcoes.metodo, url, headers: cabecalhos })
      : await app.inject({
          method: opcoes.metodo,
          url,
          headers: cabecalhos,
          payload: opcoes.corpo as Record<string, unknown>,
        });
  return {
    status: resposta.statusCode,
    bruto: resposta.body,
    corpo: resposta.body === '' ? undefined : (JSON.parse(resposta.body) as unknown),
  };
}

const REGISTRO_CONCEDIDO = {
  platform: 'android',
  push_token: TOKEN,
  push_permission: 'granted',
  app_version: '1.4.0',
  os_version: '14',
};

void describe('POST /me/devices registra o aparelho', () => {
  void it('responde 200 com os campos de Device, e NENHUM além', async () => {
    const { app } = montar();
    const { status, corpo } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(corpo as Record<string, unknown>).sort(), [
      'app_version',
      'id',
      'last_seen_at',
      'platform',
      'push_permission',
    ]);
  });

  void it('o token de push NÃO está na resposta, nem sob outro nome', async () => {
    // O corpo bruto e não as chaves: um `push_token` aninhado, ou renomeado
    // para `token`, passaria por uma conferência que só olhasse o primeiro
    // nível de chaves. O que não pode aparecer é o VALOR.
    const { app } = montar();
    const { bruto } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();

    assert.ok(
      !bruto.includes(TOKEN),
      `o token de push saiu na resposta de registro. Corpo: ${bruto}`,
    );
    assert.ok(!bruto.includes('push_token'), `o nome do campo saiu na resposta. Corpo: ${bruto}`);
  });

  void it('`os_version` é gravado e NÃO sai: o contrato não o declara em Device', async () => {
    const { app, repo } = montar();
    const { bruto } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();

    assert.ok(!bruto.includes('os_version'), `Corpo: ${bruto}`);
    assert.equal([...repo.linhas.values()][0]?.versaoDoSistema, '14');
  });

  void it('quem negou a permissão continua REGISTRADO (ADR-0008)', async () => {
    const { app, repo } = montar();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      corpo: { platform: 'android', push_token: TOKEN, push_permission: 'denied' },
    });
    await app.close();

    assert.equal(status, 200);
    assert.equal((corpo as { push_permission: string }).push_permission, 'denied');
    assert.equal(repo.linhas.size, 1, 'o aparelho de quem negou não foi registrado');
  });

  void it('sem token e sem responder a antessala: `not_asked` (critério 2)', async () => {
    const { app, repo } = montar();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      corpo: { platform: 'ios', push_permission: 'not_asked' },
    });
    await app.close();

    assert.equal(status, 200);
    assert.equal((corpo as { push_permission: string }).push_permission, 'not_asked');
    const gravado = [...repo.linhas.values()][0];
    assert.equal(gravado?.pushToken, null);
    assert.equal(gravado?.permissao, 'not_asked');
  });

  void it('é idempotente pelo token: dois registros, um aparelho', async () => {
    const { app, repo } = montar();
    const primeiro = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    const segundo = await pedir(app, {
      metodo: 'POST',
      corpo: { ...REGISTRO_CONCEDIDO, app_version: '1.5.0' },
    });
    await app.close();

    assert.equal(repo.linhas.size, 1, 'a rotação de versão criou um aparelho fantasma');
    assert.equal(
      (primeiro.corpo as { id: string }).id,
      (segundo.corpo as { id: string }).id,
      'o identificador do aparelho mudou entre dois registros do mesmo token',
    );
    assert.equal((segundo.corpo as { app_version: string }).app_version, '1.5.0');
  });

  void it('a trilha grava `device.registered` SEM o token', async () => {
    const { app, eventos } = montar();
    await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();

    const evento = eventos.find((e) => e.action === 'device.registered');
    assert.ok(evento !== undefined, 'o registro não foi para a trilha');
    assert.ok(
      !JSON.stringify(evento).includes(TOKEN),
      'o token de push entrou na trilha, que sobrevive à exclusão da conta de propósito',
    );
    assert.equal(evento.metadata?.['push_permission'], 'granted');
    assert.equal(evento.metadata?.['has_push_token'], true);
  });

  void it('corpo sem `platform` reprova com 400 pelo schema do contrato', async () => {
    const { app } = montar();
    const { status } = await pedir(app, {
      metodo: 'POST',
      corpo: { push_permission: 'granted' },
    });
    await app.close();
    assert.equal(status, 400);
  });

  void it('`platform` fora da enumeração reprova com 400', async () => {
    const { app } = montar();
    const { status } = await pedir(app, {
      metodo: 'POST',
      corpo: { platform: 'web', push_permission: 'granted' },
    });
    await app.close();
    assert.equal(status, 400);
  });

  void it('sem `Authorization` responde 401 e não registra nada', async () => {
    const { app, repo } = montar();
    const { status } = await pedir(app, {
      metodo: 'POST',
      como: null,
      corpo: REGISTRO_CONCEDIDO,
    });
    await app.close();
    assert.equal(status, 401);
    assert.equal(repo.linhas.size, 0);
  });
});

void describe('o token que muda de conta é reivindicado (critério 3, sem depender do app)', () => {
  void it('a conta anterior perde o aparelho, e a trilha diz por quê', async () => {
    // O caso real: a ADR-0002 §5 registra que o logout sem rede apaga no
    // aparelho e NÃO revoga no servidor. Se o token ficasse preso à conta
    // antiga, o aviso do pet dela chegaria em quem está com o aparelho agora.
    const { app, repo, eventos } = montar();
    await pedir(app, { metodo: 'POST', como: DONO, corpo: REGISTRO_CONCEDIDO });
    await pedir(app, { metodo: 'POST', como: OUTRO, corpo: REGISTRO_CONCEDIDO });
    await app.close();

    assert.equal(repo.linhas.size, 1, 'o mesmo token ficou vivo em duas contas');
    assert.equal([...repo.linhas.values()][0]?.dono, OUTRO);

    const revogacao = eventos.find(
      (e) => e.action === 'device.revoked' && e.metadata?.['reason'] === 'reclaimed_by_other_account',
    );
    assert.ok(
      revogacao !== undefined,
      'a conta anterior perdeu o aparelho em silêncio: não há como responder depois ' +
        'por que ela parou de receber',
    );
    assert.equal(revogacao.metadata?.['owner_user_id'], DONO);
  });

  void it('a conta que perdeu o aparelho deixa de ser alcançável', async () => {
    const { app, repo } = montar();
    await pedir(app, { metodo: 'POST', como: DONO, corpo: REGISTRO_CONCEDIDO });
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([DONO, OUTRO]))], [DONO]);

    await pedir(app, { metodo: 'POST', como: OUTRO, corpo: REGISTRO_CONCEDIDO });
    await app.close();
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([DONO, OUTRO]))], [OUTRO]);
  });

  void it('o MESMO dono registrando o mesmo token não é revogação de nada', async () => {
    // É o caminho comum: o app registra a cada abertura. Um `device.revoked` a
    // cada abertura encheria a trilha de ruído e faria o evento perder o
    // significado que ele tem.
    const { app, eventos } = montar();
    await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();

    assert.equal(eventos.filter((e) => e.action === 'device.revoked').length, 0);
  });
});

void describe('GET /me/devices lista só os aparelhos do dono (critério 5)', () => {
  void it('a lista de um não traz o aparelho do outro', async () => {
    const { app } = montar();
    await pedir(app, { metodo: 'POST', como: DONO, corpo: REGISTRO_CONCEDIDO });
    await pedir(app, {
      metodo: 'POST',
      como: OUTRO,
      corpo: { ...REGISTRO_CONCEDIDO, push_token: 'outro-token' },
    });

    const { status, corpo } = await pedir(app, { metodo: 'GET', como: DONO });
    await app.close();

    assert.equal(status, 200);
    const itens = (corpo as { items: { id: string }[] }).items;
    assert.equal(itens.length, 1);
  });

  void it('nenhum token de push sai na listagem', async () => {
    const { app } = montar();
    await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    const { bruto } = await pedir(app, { metodo: 'GET' });
    await app.close();

    assert.ok(!bruto.includes(TOKEN), `o token saiu na listagem. Corpo: ${bruto}`);
  });

  void it('conta sem aparelho responde 200 com lista vazia, e não 404', async () => {
    const { app } = montar();
    const { status, corpo } = await pedir(app, { metodo: 'GET' });
    await app.close();
    assert.equal(status, 200);
    assert.deepEqual(corpo, { items: [] });
  });

  void it('sem `Authorization` responde 401', async () => {
    const { app } = montar();
    const { status } = await pedir(app, { metodo: 'GET', como: null });
    await app.close();
    assert.equal(status, 401);
  });
});

void describe('DELETE /me/devices/{deviceId} revoga, e responde 404 nunca 403', () => {
  async function comUmAparelho(): Promise<{
    app: RegistradorDeRotas;
    repo: ReturnType<typeof registro>;
    eventos: AuditEvent[];
    id: string;
  }> {
    const montado = montar();
    const { corpo } = await pedir(montado.app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    return { ...montado, id: (corpo as { id: string }).id };
  }

  void it('o dono remove o próprio aparelho: 204, e a linha some', async () => {
    const { app, repo, id } = await comUmAparelho();
    const { status } = await pedir(app, { metodo: 'DELETE', caminho: `${CAMINHO}/${id}` });
    await app.close();

    assert.equal(status, 204);
    assert.equal(repo.linhas.size, 0);
  });

  void it('**o aparelho revogado deixa de ser alcançável** (critério 6)', async () => {
    const { app, repo, id } = await comUmAparelho();
    assert.deepEqual(
      [...(await repo.contasAlcancaveisPorPush([DONO]))],
      [DONO],
      'o aparelho registrado não tornou a conta alcançável: o caso abaixo mediria nada',
    );

    await pedir(app, { metodo: 'DELETE', caminho: `${CAMINHO}/${id}` });
    await app.close();

    assert.deepEqual(
      [...(await repo.contasAlcancaveisPorPush([DONO]))],
      [],
      'a conta continuou alcançável depois de o único aparelho dela ter sido revogado',
    );
  });

  void it('**o envio em curso não encontra mais endereço** depois da revogação', async () => {
    const { app, repo, id } = await comUmAparelho();
    assert.equal(
      await repo.enderecoDeEnvio(id),
      TOKEN,
      'o endereço de envio não resolveu antes da revogação: o caso abaixo mediria nada',
    );

    await pedir(app, { metodo: 'DELETE', caminho: `${CAMINHO}/${id}` });
    await app.close();

    assert.equal(
      await repo.enderecoDeEnvio(id),
      null,
      'um disparo já em andamento continuaria mandando para o aparelho revogado',
    );
  });

  void it('outra conta tentando remover: 404, e a linha NÃO some', async () => {
    const { app, repo, id } = await comUmAparelho();
    const { status, corpo } = await pedir(app, {
      metodo: 'DELETE',
      caminho: `${CAMINHO}/${id}`,
      como: OUTRO,
    });
    await app.close();

    assert.equal(status, 404, 'a resposta distinguiu "existe e é de outro" de "não existe"');
    assert.notEqual(status, 403, 'ADR-0021: 404 nunca 403');
    assert.equal((corpo as { type?: string }).type?.endsWith('not-found'), true);
    assert.equal(repo.linhas.size, 1, 'a conta alheia conseguiu apagar o aparelho');
  });

  void it('identificador que nunca existiu: o MESMO 404', async () => {
    // A indistinguibilidade é o ponto. Se os dois casos respondessem diferente,
    // a rota viraria oráculo de existência de aparelho de terceiro.
    const { app } = montar();
    const { status, corpo } = await pedir(app, {
      metodo: 'DELETE',
      caminho: `${CAMINHO}/018f3a2b-0000-7000-8000-00000000ffff`,
    });
    await app.close();
    assert.equal(status, 404);
    assert.equal((corpo as { type?: string }).type?.endsWith('not-found'), true);
  });

  void it('a trilha grava `device.revoked` com o motivo `user_removed`', async () => {
    const { app, eventos, id } = await comUmAparelho();
    await pedir(app, { metodo: 'DELETE', caminho: `${CAMINHO}/${id}` });
    await app.close();

    const evento = eventos.find((e) => e.action === 'device.revoked');
    assert.ok(evento !== undefined, 'a revogação não foi para a trilha, que é a única memória dela');
    assert.equal(evento.metadata?.['reason'], 'user_removed');
    assert.equal(evento.resourceId, id);
    assert.ok(!JSON.stringify(evento).includes(TOKEN), 'o token entrou na trilha');
  });

  void it('a tentativa recusada NÃO grava revogação nenhuma', async () => {
    const { app, eventos, id } = await comUmAparelho();
    await pedir(app, { metodo: 'DELETE', caminho: `${CAMINHO}/${id}`, como: OUTRO });
    await app.close();
    assert.equal(eventos.filter((e) => e.action === 'device.revoked').length, 0);
  });

  void it('sem `Authorization` responde 401 e não remove', async () => {
    const { app, repo, id } = await comUmAparelho();
    const { status } = await pedir(app, {
      metodo: 'DELETE',
      caminho: `${CAMINHO}/${id}`,
      como: null,
    });
    await app.close();
    assert.equal(status, 401);
    assert.equal(repo.linhas.size, 1);
  });
});

void describe('o teto declarado é o teto aplicado', () => {
  void it('a 61ª chamada de registro na mesma hora responde 429', async () => {
    const { app } = montar();
    for (let i = 0; i < 60; i += 1) {
      const { status } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
      assert.equal(status, 200, `a chamada ${String(i + 1)} já falhou`);
    }
    const { status } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();
    assert.equal(status, 429);
  });

  void it('ISCA: com o contador desligado, a 61ª passa', async () => {
    // Sem este caso, o anterior mediria a capacidade de contar até 61 em vez do
    // limite: um servidor que respondesse 429 sempre passaria nele.
    const { app } = montar({ contador: criarContadorDesligado() });
    for (let i = 0; i < 60; i += 1) {
      await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    }
    const { status } = await pedir(app, { metodo: 'POST', corpo: REGISTRO_CONCEDIDO });
    await app.close();
    assert.equal(status, 200);
  });
});

/**
 * A SUBIDA, exercitada pelo caminho real.
 *
 * `vigiarParametrosDasRotas` instala `schema.params` a partir do contrato e
 * devolve uma conferência que **derruba o boot** em quatro casos. O terceiro é
 * o que mais aparece em rota nova: operação com parâmetro que pode recusar e
 * que não declara 400. Uma bancada que registra a rota sem esta fiação mede
 * outra coisa e diz que mediu esta.
 *
 * Foi por aqui que a BICHUS-63 descobriu o assunto, e é por aqui que a rota do
 * aparelho ia descobrir: `deviceId` é `format: uuid`, então `deleteDevice`
 * precisava ganhar `400` no contrato — e ganhou, nesta história.
 */
function montarComBorda(contrato: Contrato): {
  app: RegistradorDeRotas;
  conferirParametros: () => void;
} {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });

  const trilha: AuditLog = { record: () => Promise.resolve() };
  const clock: Clock = { now: () => AGORA };

  // O mesmo par de `src/bin/api.ts`: o gancho `onRoute` só enxerga o que for
  // registrado depois dele, e a conferência só faz sentido no fim.
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, '/v1');

  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeAparelho(escopo, {
        aparelhos: new RegistroDeAparelhosService({ repositorio: registro(), clock, trilha }),
        autenticador: {
          autenticar: (token: string) => Promise.resolve({ userId: token as UserId }),
        },
        contrato,
      });
      pronto();
    },
    { prefix: '/v1' },
  );

  return { app, conferirParametros };
}

/**
 * O contrato real, com o `400` de `deleteDevice` arrancado.
 *
 * Um objeto novo e não uma cópia do arquivo em disco: o que a conferência lê é
 * `operacao.raw['responses']`, e é exatamente isso que precisa mudar. Mexer no
 * YAML de verdade para provar a isca deixaria o repositório num estado que a
 * própria suíte reprova.
 */
function semOQuatrocentosDoDelete(): Contrato {
  const real = carregarContrato('api/openapi.yaml');
  const operacoes = new Map(real.operacoes);
  const original = operacoes.get('deleteDevice');
  assert.ok(original !== undefined, '`deleteDevice` sumiu do contrato');

  const respostas = { ...(original.raw['responses'] as Record<string, unknown>) };
  delete respostas['400'];
  operacoes.set('deleteDevice', { ...original, raw: { ...original.raw, responses: respostas } });

  return { ...real, operacoes };
}

void describe('a rota sobe pelo caminho real, com a validação de parâmetro do contrato', () => {
  void it('`conferirParametros()` aprova as três rotas do aparelho', async () => {
    const { app, conferirParametros } = montarComBorda(carregarContrato('api/openapi.yaml'));
    await app.ready();
    assert.doesNotThrow(conferirParametros);
    await app.close();
  });

  void it('`deviceId` malformado responde 400, e não 500 vindo do Postgres', async () => {
    // Sem `schema.params`, o texto torto atravessaria a borda e o domínio e
    // chegaria ao banco, que responde `invalid input syntax for type uuid` —
    // ou seja, 500, um erro NOSSO para uma requisição do cliente.
    const { app } = montarComBorda(carregarContrato('api/openapi.yaml'));
    await app.ready();
    const resposta = await app.inject({
      method: 'DELETE',
      url: '/v1/me/devices/nao-e-um-uuid',
      headers: { authorization: `Bearer ${DONO}` },
    });
    await app.close();

    assert.equal(resposta.statusCode, 400);
    assert.equal(
      (JSON.parse(resposta.body) as { type: string }).type.endsWith('validation-failed'),
      true,
    );
  });

  void it('ISCA: sem o `400` declarado, a MESMA conferência derruba a subida', async () => {
    // É isto que a história acrescentou ao contrato. Sem a isca, o caso acima
    // mediria só que a aplicação sobe — e continuaria verde no dia em que o
    // `400` fosse removido junto com a conferência que o exige.
    const { app, conferirParametros } = montarComBorda(semOQuatrocentosDoDelete());
    await app.ready();
    assert.throws(
      conferirParametros,
      /deleteDevice/,
      'a conferência aprovou uma operação que pode recusar parâmetro e não declara 400. ' +
        'A aplicação passaria a responder um status que a especificação não promete.',
    );
    await app.close();
  });
});
