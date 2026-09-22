/**
 * O critério 4: o FCM recusou o token, o aparelho sai, e os outros continuam.
 *
 * ## Por que este caminho tem teste e não tem rota
 *
 * Quem chama `revogarPorTokenRecusado` é o caminho de **envio**, e ele ainda
 * não existe: é a BICHUS-18. Escrever a revogação agora, com teste próprio e
 * sob a revisão de segurança desta história, é preferível à alternativa —
 * a BICHUS-18 inventar a higiene de token junto com o disparo, no meio do
 * caminho mais crítico do produto.
 *
 * Isso é, reconhecidamente, um mecanismo sem chamador, que é a família de
 * defeito que este repositório já registrou três vezes (`invalidarTodasAsSessoes`,
 * a rota do webhook de entrega, o remetente de push). A diferença está dita em
 * voz alta em vez de descoberta depois: o chamador tem nome, tem número de
 * história e é a próxima da fila do PM (`92 → 20 → 24 → 91 → 18 → 46`).
 *
 * ## O desfecho vem da porta, e não de uma exceção
 *
 * `ResultadoDoEnvio` já declara `'aparelho-sumiu'` como **resposta**, com o
 * argumento escrito em `ports/push-sender.ts`: se `UNREGISTERED` virasse
 * exceção, ele cairia na mesma vala das falhas de rede e a fila o repetiria
 * para sempre contra um aparelho que não existe mais. Esta função é o outro
 * lado daquela decisão.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `registro-de-aparelhos-service.ts`, rodadas e vistas reprovar
 * em 22/09/2026, e depois restauradas:
 *
 * | o que foi desligado | reprovaram |
 * |---|---|
 * | `revogarPorTokenRecusado` deixando de chamar o repositório | 5 casos |
 * | `registrarRevogacao` deixando de gravar na trilha | 1 caso aqui, e 3 no arquivo de rotas |
 *
 * O mesmo par contra Postgres de verdade está em
 * `tests/integration/aparelho-e-token-de-push.test.ts`, e lá a revogação
 * transformada em `no-op` reprovou 3 casos — enquanto **a suíte unitária
 * inteira continuou verde**, porque o dublê em memória apaga do `Map` de
 * qualquer jeito. É a medida exata do que só o banco prova.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock } from '../../../shared/ports/index.js';
import { podeReceberPush, type Aparelho } from '../domain/aparelho.js';
import type { RegistroDeAparelhos } from '../ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';
import { RegistroDeAparelhosService } from './registro-de-aparelhos-service.js';

const TUTORA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

const TOKEN_MORTO = 'fcm-token-do-celular-que-desinstalou' as TokenDeAparelho;
const TOKEN_VIVO = 'fcm-token-do-tablet-que-continua' as TokenDeAparelho;

function aparelho(id: string, token: TokenDeAparelho): Aparelho {
  return {
    id,
    dono: TUTORA,
    plataforma: 'android',
    pushToken: token,
    permissao: 'granted',
    versaoDoApp: '1.4.0',
    versaoDoSistema: '14',
    registradoEm: AGORA,
    vistoEm: AGORA,
  };
}

/**
 * Registro em memória com **dois aparelhos da mesma conta**.
 *
 * Dois e não um: com um só, "não derrubou os outros aparelhos do mesmo
 * usuário" não tem como ser medido, e o caso passaria por vacuidade.
 */
function montar(): {
  servico: RegistroDeAparelhosService;
  linhas: Map<string, Aparelho>;
  eventos: AuditEvent[];
} {
  const linhas = new Map<string, Aparelho>([
    ['celular', aparelho('celular', TOKEN_MORTO)],
    ['tablet', aparelho('tablet', TOKEN_VIVO)],
  ]);
  const eventos: AuditEvent[] = [];

  const repositorio: RegistroDeAparelhos = {
    registrar: () => {
      throw new Error('não usado neste arquivo');
    },
    listarDoDono: (dono) =>
      Promise.resolve([...linhas.values()].filter((a) => a.dono === dono)),
    revogarDoDono: (dono, id) => {
      const linha = linhas.get(id);
      if (linha === undefined || linha.dono !== dono) return Promise.resolve(null);
      linhas.delete(id);
      return Promise.resolve(linha);
    },
    revogarPorToken: (token) => {
      const linha = [...linhas.values()].find((a) => a.pushToken === token);
      if (linha === undefined) return Promise.resolve(null);
      linhas.delete(linha.id);
      return Promise.resolve(linha);
    },
    contasAlcancaveisPorPush: (candidatos) =>
      Promise.resolve(
        new Set(
          [...linhas.values()]
            .filter((a) => candidatos.includes(a.dono) && podeReceberPush(a))
            .map((a) => a.dono),
        ),
      ),
    enderecoDeEnvio: (id) => {
      const linha = linhas.get(id);
      if (linha === undefined || !podeReceberPush(linha)) return Promise.resolve(null);
      return Promise.resolve(linha.pushToken);
    },
  };

  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => AGORA };

  return {
    servico: new RegistroDeAparelhosService({ repositorio, clock, trilha }),
    linhas,
    eventos,
  };
}

void describe('token recusado pelo FCM: o aparelho sai agora (critério 4)', () => {
  void it('a linha do token morto some', async () => {
    const { servico, linhas } = montar();
    const revogou = await servico.revogarPorTokenRecusado(TOKEN_MORTO);

    assert.equal(revogou, true);
    assert.equal(linhas.has('celular'), false);
  });

  void it('**o envio para os outros aparelhos da mesma conta não cai**', async () => {
    const { servico, linhas } = montar();
    await servico.revogarPorTokenRecusado(TOKEN_MORTO);

    assert.equal(linhas.has('tablet'), true, 'a revogação derrubou a conta inteira');
    assert.equal(
      await servico.enderecoDeEnvio('tablet'),
      TOKEN_VIVO,
      'o aparelho que continua vivo perdeu o endereço de envio',
    );
  });

  void it('a conta continua alcançável enquanto sobrar um aparelho', async () => {
    const { servico } = montar();
    await servico.revogarPorTokenRecusado(TOKEN_MORTO);

    assert.deepEqual(
      [...(await servico.contasAlcancaveisPorPush([TUTORA]))],
      [TUTORA],
      'a conta saiu da base de alerta por causa de UM aparelho desinstalado',
    );
  });

  void it('revogado o último, a conta deixa de ser alcançável (critério 6)', async () => {
    const { servico } = montar();
    await servico.revogarPorTokenRecusado(TOKEN_MORTO);
    await servico.revogarPorTokenRecusado(TOKEN_VIVO);

    assert.deepEqual(
      [...(await servico.contasAlcancaveisPorPush([TUTORA]))],
      [],
      'a conta sem nenhum aparelho vivo continuou entrando na lista de notificados',
    );
  });

  void it('**o aparelho revogado não resolve mais endereço de envio**', async () => {
    const { servico } = montar();
    assert.equal(
      await servico.enderecoDeEnvio('celular'),
      TOKEN_MORTO,
      'o endereço não resolveu antes da revogação: o caso abaixo mediria nada',
    );

    await servico.revogarPorTokenRecusado(TOKEN_MORTO);
    assert.equal(
      await servico.enderecoDeEnvio('celular'),
      null,
      'um disparo em curso continuaria mandando para o aparelho já revogado',
    );
  });

  void it('duas recusas do mesmo token: a segunda não erra e não grava duas vezes', async () => {
    // O envio é concorrente por aparelho. Duas mensagens contra o mesmo token
    // morto voltam com `UNREGISTERED` quase juntas, e a segunda não pode virar
    // 500 nem uma segunda linha de trilha dizendo que revogou de novo.
    const { servico, eventos } = montar();
    assert.equal(await servico.revogarPorTokenRecusado(TOKEN_MORTO), true);
    assert.equal(await servico.revogarPorTokenRecusado(TOKEN_MORTO), false);
    assert.equal(eventos.filter((e) => e.action === 'device.revoked').length, 1);
  });

  void it('a trilha diz `token_rejected`, com ator `system` e sem o token', async () => {
    const { servico, eventos } = montar();
    await servico.revogarPorTokenRecusado(TOKEN_MORTO, 'correlacao-de-teste');

    const evento = eventos.find((e) => e.action === 'device.revoked');
    assert.ok(evento !== undefined, 'a revogação não foi para a trilha, que é a única memória dela');
    assert.equal(evento.metadata?.['reason'], 'token_rejected');
    // Não há pessoa: quem decidiu foi o transporte. `actorUserId` é proibido
    // fora de `user` pela porta da trilha.
    assert.equal(evento.actorKind, 'system');
    assert.equal(evento.actorUserId, undefined);
    assert.equal(evento.metadata?.['owner_user_id'], TUTORA);
    assert.ok(
      !JSON.stringify(evento).includes(TOKEN_MORTO),
      'o token entrou na trilha, que sobrevive à exclusão da conta de propósito',
    );
  });
});
