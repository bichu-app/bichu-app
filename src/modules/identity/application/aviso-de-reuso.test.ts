/**
 * A montagem do aviso de reuso de refresh (BICHUS-15 critério 10, BICHUS-129).
 *
 * `auth-service.test.ts` prova a metade de cá da porta: o serviço chama
 * `avisarTitular`. O que não tinha prova nenhuma era a metade de lá — a função
 * que transforma o aviso em mensagem, que até BICHUS-129 era uma lambda dentro
 * de `src/bin/api.ts` e ficava em 0% de cobertura porque nenhum teste carrega a
 * raiz de composição.
 *
 * Quem paga essa conta é a vítima: se o aviso deixar de sair, ela lê a
 * revogação como "o app me deslogou", faz login de novo e segue com o invasor
 * dentro da conta. É por isso que o caso da conta apagada afirma o **não
 * envio** e não só o retorno: um teste que só olhasse o retorno passaria com o
 * `if` invertido, que é o defeito que manda o e-mail para ninguém.
 *
 * O transporte (`smtp-mailer.ts`) NÃO é testado aqui: ele abre socket e é
 * integração, contra o receptor local. Aqui a porta é um dublê.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO } from '../../../shared/time/relogio-de-teste.js';
import type { Conta } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { AvisoAoTitular } from './dependencies.js';
import { criarAvisoDeReusoAoTitular } from './aviso-de-reuso.js';

const VITIMA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const ENDERECO_DA_VITIMA = 'tutora@exemplo.invalid';

const AVISO: AvisoAoTitular = {
  tipo: 'refresh_reuse_detected',
  userId: VITIMA,
  ocorridoEm: INSTANTE_FIXO,
  correlationId: 'corr-do-reuso',
};

/**
 * Uma conta cheia de dado pessoal de propósito.
 *
 * Telefone, endereço de referência e nome estão aqui para que o caso de
 * contato mediado tenha o que procurar: se algum dia alguém "melhorar" a
 * mensagem citando o nome ou a cidade da pessoa, o teste precisa ter esses
 * valores em mãos para reprovar.
 */
function contaDaVitima(): Conta {
  return {
    id: VITIMA,
    email: ENDERECO_DA_VITIMA,
    emailVerifiedAt: dataFixa(),
    displayName: 'Marina Prado',
    phoneE164: '+5511987654321',
    phoneVerifiedAt: dataFixa(),
    referencePostalCode: '01310-000',
    referenceNeighborhood: 'Consolação',
    referenceCity: 'São Paulo',
    referenceState: 'SP',
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(),
  };
}

interface Bancada {
  readonly avisar: (aviso: AvisoAoTitular) => Promise<void>;
  readonly enviadas: Mensagem[];
  readonly consultados: UserId[];
  readonly registros: { dados: Record<string, unknown>; mensagem: string }[];
}

function montar(conta: Conta | undefined): Bancada {
  const enviadas: Mensagem[] = [];
  const consultados: UserId[] = [];
  const registros: { dados: Record<string, unknown>; mensagem: string }[] = [];

  const mailer: Mailer = {
    enviar(mensagem) {
      enviadas.push(mensagem);
      return Promise.resolve();
    },
  };

  const avisar = criarAvisoDeReusoAoTitular({
    repositorio: {
      buscarContaPorId(id: UserId): Promise<Conta | undefined> {
        consultados.push(id);
        return Promise.resolve(conta);
      },
    },
    mailer,
    registrarOcorrencia: (dados, mensagem) => {
      registros.push({ dados, mensagem });
    },
  });

  return { avisar, enviadas, consultados, registros };
}

/** A única mensagem enviada, ou uma falha dizendo quantas saíram. */
function unicaMensagem(bancada: Bancada): Mensagem {
  assert.equal(bancada.enviadas.length, 1, 'a detecção de reuso manda exatamente um e-mail');
  return bancada.enviadas[0]!;
}

void describe('aviso de reuso de refresh: montagem da mensagem (BICHUS-15, critério 10)', () => {
  void it('escreve para o endereço da conta, com assunto que diz o que aconteceu', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const mensagem = unicaMensagem(bancada);
    assert.equal(mensagem.para, ENDERECO_DA_VITIMA);
    // O destinatário sai da CONTA, e nunca do aviso: o aviso nasce do lado de
    // quem apresentou o token roubado. Se um dia o endereço vier de lá, o
    // atacante escolhe para onde vai o alerta da própria vítima.
    assert.deepEqual(bancada.consultados, [VITIMA]);
    assert.equal(mensagem.assunto, 'Encerramos as sessões da sua conta no Bichu');
  });

  void it('diz no corpo que as sessões foram encerradas e por quê', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const corpo = unicaMensagem(bancada).corpo;
    assert.match(corpo, /encerramos todas as sessões/i);
    assert.match(corpo, /copiado o acesso da sua conta/i);
    assert.ok(corpo.trim().length > 0, 'corpo vazio é detecção silenciosa com selo de entregue');
  });

  void it('diz à pessoa O QUE FAZER, e não só que algo aconteceu', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const corpo = unicaMensagem(bancada).corpo;
    // As duas ações, na ordem em que a pessoa precisa delas: voltar a entrar, e
    // trocar a senha se desconfiar. Um aviso que para em "detectamos atividade
    // suspeita" deixa a pessoa assustada e sem saída — é quase não avisar.
    assert.match(corpo, /entre de novo no aplicativo/i);
    assert.match(corpo, /troque a sua senha/i);
    // E o motivo de trocar a senha, que é o que faz a pessoa trocar: sem a
    // consequência, a frase é burocracia e ela ignora.
    assert.match(corpo, /derruba qualquer acesso/i);
  });

  void it('não carrega telefone, endereço nem UUID de banco (ADR-0010 item 6, contato mediado)', async () => {
    const conta = contaDaVitima();
    const bancada = montar(conta);

    await bancada.avisar(AVISO);

    const mensagem = unicaMensagem(bancada);
    // Um e-mail é saída pública: ele é encaminhado, cai em caixa compartilhada
    // e aparece na notificação da tela bloqueada. Telefone e endereço nunca
    // aparecem para ninguém; UUID de banco é proibido sem exceção, porque
    // UUIDv7 é ordenável e carrega o instante de criação.
    const tudo = `${mensagem.assunto}\n${mensagem.corpo}`;
    for (const proibido of [
      conta.phoneE164,
      conta.referencePostalCode,
      conta.referenceNeighborhood,
      conta.referenceCity,
      conta.id,
      AVISO.correlationId,
    ]) {
      assert.ok(
        !tudo.includes(proibido as string),
        `a mensagem não pode conter ${proibido as string}`,
      );
    }
    assert.doesNotMatch(tudo, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  void it('conta apagada entre a detecção e o aviso: não envia nada', async () => {
    const bancada = montar(undefined);

    await bancada.avisar(AVISO);

    // Esta é a afirmação que pega o `if (conta === undefined) return` invertido.
    // Com ele invertido, `conta` é `undefined` e o envio acontece assim mesmo:
    // ou estoura ao ler `conta.email`, ou manda o e-mail para `undefined`. Nos
    // dois casos o alerta da vítima some, que é o defeito que importa.
    assert.deepEqual(bancada.enviadas, [], 'sem conta não há para quem escrever');
  });

  void it('registra a ocorrência no log mesmo sem conta: quem investiga depois precisa dela', async () => {
    const bancada = montar(undefined);

    await bancada.avisar(AVISO);

    assert.equal(bancada.registros.length, 1);
    assert.deepEqual(bancada.registros[0]?.dados, {
      tipo: 'refresh_reuse_detected',
      correlationId: 'corr-do-reuso',
    });
  });
});
