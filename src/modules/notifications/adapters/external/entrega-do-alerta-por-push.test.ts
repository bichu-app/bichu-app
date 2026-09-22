/**
 * O envio do alerta a um vizinho: o token é resolvido AGORA, e o morto é revogado.
 *
 * Este arquivo cobra as duas garantias que a BICHUS-91 escreveu e deixou sem
 * chamador, e que a BICHUS-18 passou a exercer:
 *
 * 1. **`enderecoDeEnvio` no instante do envio.** O aviso que atravessa a porta
 *    carrega `aparelhoId`, e não `pushToken` — então não existe forma de mandar
 *    para um token carregado junto da lista, porque o token não está na lista.
 *    O caso que prova isso é o que **remove o aparelho entre a montagem da
 *    lista e o envio** e exige que nada saia.
 * 2. **`revogarPorTokenRecusado` quando o transporte diz que o aparelho sumiu.**
 *    A higiene do ADR-0008 acontece no instante da recusa, e não numa varredura
 *    que alguém precisa lembrar de rodar.
 *
 * ## Por que os erros são resultado e não exceção
 *
 * Um aparelho que falha não pode derrubar o alerta dos outros 499. Os quatro
 * desfechos de `ResultadoDaEntrega` são valores, e os dois casos de erro deste
 * arquivo exigem que `avisar` **retorne** em vez de estourar.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `entrega-do-alerta-por-push.ts`, rodadas e vistas reprovar em
 * 22/09/2026, e depois restauradas. A conferência de que o arquivo mudou foi
 * por CONTEÚDO, e não por `git diff`: o arquivo é novo e não rastreado.
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `enderecoDeEnvio` deixando de ser chamado (token fixo) | 2 casos |
 * | `revogarPorTokenRecusado` virando `no-op` | 2 casos |
 * | `PushNaoEnviadoError` voltando a propagar | 1 caso |
 *
 * O que esta suíte **não** prova: que a revogação apaga a linha do banco. O
 * dublê apaga do `Map` de qualquer jeito, e foi exatamente esse o ponto cego
 * que a BICHUS-91 mediu — com `revogarDoDono` virado `no-op`, a suíte unitária
 * inteira ficou verde e só a integração reprovou. Quem prova o apagamento é
 * `tests/integration/aparelho-e-token-de-push.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AvisoDeVizinhanca } from '../../../lostfound/ports/entrega-do-alerta.js';
import {
  PushNaoEnviadoError,
  type MensagemDePush,
  type PushSender,
  type ResultadoDoEnvio,
  type TokenDeAparelho,
} from '../../ports/push-sender.js';
import { criarEntregaDoAlertaPorPush } from './entrega-do-alerta-por-push.js';

const APARELHO = '018f3a2b-0000-7000-8000-0000000000cc';
const TOKEN = 'fcm-token-vivo' as TokenDeAparelho;

function aviso(extra: Partial<AvisoDeVizinhanca> = {}): AvisoDeVizinhanca {
  return {
    aparelhoId: APARELHO,
    nomeDoPet: 'Maia',
    especieCodigo: 'dog',
    bairro: 'Vila Madalena',
    tokenPublico: 'c-abc123xyz',
    imagemUrl: undefined,
    ...extra,
  };
}

interface Cenario {
  /** O que `enderecoDeEnvio` devolve, por identificador de aparelho. */
  enderecos?: Map<string, TokenDeAparelho | null>;
  desfecho?: ResultadoDoEnvio;
  erroDoEnvio?: Error;
}

function montar(cenario: Cenario = {}) {
  const enviadas: MensagemDePush[] = [];
  const revogados: TokenDeAparelho[] = [];
  const enderecosPedidos: string[] = [];
  const enderecos = cenario.enderecos ?? new Map([[APARELHO, TOKEN]]);

  const push: PushSender = {
    enviar: (mensagem) => {
      enviadas.push(mensagem);
      if (cenario.erroDoEnvio !== undefined) return Promise.reject(cenario.erroDoEnvio);
      return Promise.resolve(cenario.desfecho ?? 'aceito');
    },
    transporte: 'dublê',
  };

  const entrega = criarEntregaDoAlertaPorPush({
    aparelhos: {
      enderecoDeEnvio: (id) => {
        enderecosPedidos.push(id);
        return Promise.resolve(enderecos.get(id) ?? null);
      },
    },
    push,
    revogarPorTokenRecusado: (token) => {
      revogados.push(token);
      return Promise.resolve(true);
    },
  });

  return { entrega, enviadas, revogados, enderecosPedidos, enderecos };
}

void describe('o token é resolvido no instante do envio', () => {
  void it('o endereço é pedido pelo identificador do aparelho, a cada envio', async () => {
    const { entrega, enderecosPedidos, enviadas } = montar();

    assert.equal(await entrega.avisar(aviso()), 'aceito');

    assert.deepEqual(enderecosPedidos, [APARELHO]);
    assert.equal(enviadas[0]?.token, TOKEN);
  });

  void it('o aparelho removido ENTRE a lista e o envio não recebe nada', async () => {
    // O caso que a decisão inteira existe para cobrir. Uma implementação que
    // carregasse o token junto da lista de destinatários mandaria para este
    // aparelho, e nenhuma forma de marcar a linha conserta isso — só reler no
    // momento de usar.
    const { entrega, enviadas, enderecosPedidos } = montar({
      enderecos: new Map([[APARELHO, null]]),
    });

    assert.equal(await entrega.avisar(aviso()), 'semEndereco');

    assert.deepEqual(enderecosPedidos, [APARELHO], 'o endereço nem chegou a ser pedido');
    assert.deepEqual(enviadas, [], 'saiu um push para um aparelho que já não existe');
  });

  void it('dois envios ao mesmo aparelho releem o endereço duas vezes', async () => {
    // Sem isto, um disparo que percorre 500 pessoas poderia resolver uma vez e
    // reusar — que é a mesma coisa que carregar o token junto da lista, só que
    // escondida atrás de um cache.
    const { entrega, enderecosPedidos } = montar();

    await entrega.avisar(aviso());
    await entrega.avisar(aviso());

    assert.deepEqual(enderecosPedidos, [APARELHO, APARELHO]);
  });
});

void describe('o token que o transporte recusa é revogado na hora', () => {
  void it('`aparelho-sumiu` revoga o token recusado', async () => {
    const { entrega, revogados } = montar({ desfecho: 'aparelho-sumiu' });

    assert.equal(await entrega.avisar(aviso()), 'aparelhoSumiu');

    assert.deepEqual(revogados, [TOKEN]);
  });

  void it('o envio ACEITO não revoga nada', async () => {
    // A guarda do outro lado: uma revogação disparada por engano em todo envio
    // esvaziaria o parque de aparelhos no primeiro alerta grande, e o sintoma
    // apareceria como "o push parou de funcionar" semanas depois.
    const { entrega, revogados } = montar({ desfecho: 'aceito' });

    await entrega.avisar(aviso());

    assert.deepEqual(revogados, []);
  });

  void it('sem endereço não há token para revogar, e nada é revogado', async () => {
    const { entrega, revogados } = montar({ enderecos: new Map([[APARELHO, null]]) });

    await entrega.avisar(aviso());

    assert.deepEqual(revogados, []);
  });
});

void describe('uma falha num aparelho não derruba o alerta dos outros', () => {
  void it('`PushNaoEnviadoError` vira `falhou`, e não sobe', async () => {
    const { entrega } = montar({
      erroDoEnvio: new PushNaoEnviadoError('quota_exceeded', true, 'cota do projeto'),
    });

    // Se isto estourasse, o laço do disparo pararia no primeiro aparelho com
    // problema e os outros 499 vizinhos ficariam sem o aviso.
    assert.equal(await entrega.avisar(aviso()), 'falhou');
  });
});

void describe('o conteúdo do push respeita o teto de precisão geográfica', () => {
  void it('o bairro entra no corpo, e nenhuma coordenada sai', async () => {
    // Critério 3 da BICHUS-18. A porteira de `conteudo-do-push.ts` confere de
    // novo antes de serializar; esta é a primeira das duas guardas.
    const { entrega, enviadas } = montar();

    await entrega.avisar(aviso({ bairro: 'Vila Madalena' }));

    const payload = JSON.stringify(enviadas[0]);
    assert.match(payload, /Vila Madalena/);
    assert.doesNotMatch(payload, /-?\d{1,3}\.\d{3,}/, 'saiu algo com forma de coordenada');
  });

  void it('o código da espécie NÃO vaza: `dog` vira "cão"', async () => {
    const { entrega, enviadas } = montar();

    await entrega.avisar(aviso({ especieCodigo: 'dog' }));

    assert.match(enviadas[0]?.titulo ?? '', /cão/);
    assert.doesNotMatch(enviadas[0]?.titulo ?? '', /dog/);
  });

  void it('espécie desconhecida cai em "pet", e não no código cru', async () => {
    // "Um other sumiu perto de você" seria vocabulário de banco na tela de
    // bloqueio de alguém.
    const { entrega, enviadas } = montar();

    await entrega.avisar(aviso({ especieCodigo: 'other' }));

    assert.match(enviadas[0]?.titulo ?? '', /pet/);
    assert.doesNotMatch(enviadas[0]?.titulo ?? '', /other/);
  });

  void it('o que sai nos dados é o token público, e nunca um UUID de banco', async () => {
    // ADR-0010, item 6. O `case_id` e o `user_id` não atravessam esta porta, e
    // o `share_token` é a substituição que o item nomeia.
    const { entrega, enviadas } = montar();

    await entrega.avisar(aviso({ tokenPublico: 'c-abc123xyz' }));

    assert.equal(enviadas[0]?.dados['ref'], 'c-abc123xyz');
    assert.doesNotMatch(
      JSON.stringify(enviadas[0]?.dados),
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      'um UUID de banco entrou no payload do push',
    );
  });
});
