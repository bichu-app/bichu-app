/**
 * O cadastro **exige data de nascimento e 16 anos completos**, e a exigência é
 * do servidor.
 *
 * ## A decisão, nas palavras do cliente (18/10/2026)
 *
 * *"coloque maiores de 16 anos"*.
 *
 * ## O que estava errado: não havia freio nenhum
 *
 * Varrido contra `e636f69c`: **nenhuma** coluna de idade em `users`,
 * **nenhum** campo no contrato (`RegisterRequest` listava
 * `required: [email, password]`), **nenhum** campo na tela de criar conta. E a
 * política de privacidade afirmava isso por escrito, no item 10: *"Hoje o
 * cadastro não confere a idade."* Era verdade.
 *
 * ## Por que estes casos chamam o SERVIÇO, e não a tela
 *
 * `POST /v1/auth/register` tem `security: []` — é rota pública. Freio de idade
 * que só existe no app é um freio que qualquer `curl` contorna. É por isso que
 * estes casos entram pela aplicação, com o dublê de repositório recusando
 * tudo: o que eles afirmam é que **nada foi gravado**.
 *
 * ## AS DUAS BORDAS, QUE É ONDE O ERRO MORA
 *
 * Um erro de um dia no cálculo da idade não é arredondamento: é recusar uma
 * pessoa no dia do próprio aniversário, ou aceitar quem ainda não tem idade.
 * Por isso os dois casos adjacentes entram juntos, com o relógio parado:
 *
 * - **15 anos e 364 dias** (nascido em 2010-09-12, com hoje em 2010+16-09-11)
 *   é recusado;
 * - **16 anos exatos** (nascido em 2010-09-11, o próprio aniversário) passa.
 *
 * Um só dos dois não prova nada: a regra `<` e a regra `<=` concordam em todo
 * o resto do calendário e discordam exatamente aqui.
 *
 * ## O FUSO TAMBÉM TEM CASO PRÓPRIO
 *
 * São Paulo é UTC-3, então o dia UTC está **à frente** do dia de São Paulo
 * entre 21:00 e 00:00 locais. Calcular a idade pelo dia UTC aceitaria, às
 * 21:05 do dia 10, quem só completa 16 anos no dia 11 — três horas de
 * presente. O caso do fuso fixa um instante nessa janela e afirma a recusa.
 *
 * ## O contrapeso é obrigatório aqui
 *
 * Sem o caso da data BOA, uma recusa fixa — `cadastrar` passando a estourar
 * para qualquer entrada — deixaria todos os casos de recusa verdes. O
 * contrapeso entra com repositório que ACEITA e afirma que a data **chegou em
 * `criarContaLocal`**, canônica: ele é a única coisa neste arquivo que prova
 * que a trava recusa o que deve e **só** isso.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Conta, IdentityRepository, NovaConta } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const SENHA_BOA = 'coleira-azul-do-bidu-2026';
const EMAIL = 'marina@exemplo.com.br';

/**
 * `INSTANTE_FIXO` é 2026-09-11, 09:00 em São Paulo (12:00 UTC) — conferido com
 * `Intl`, não suposto. **Mesmo dia civil nos dois fusos**, de propósito: as
 * bordas de idade abaixo medem a conta dos anos sem o fuso interferindo, e o
 * fuso tem caso próprio, com outro instante.
 */
const HOJE_EM_SAO_PAULO = '2026-09-11';

/** 16 anos exatos no dia de `INSTANTE_FIXO`: é o aniversário. */
const DATA_DE_NASCIMENTO_16_EXATOS = '2010-09-11';

/** Um dia a menos de vida: 15 anos e 364 dias em `INSTANTE_FIXO`. */
const DATA_DE_NASCIMENTO_15_E_364 = '2010-09-12';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (Android)',
};

function naoDeveriaTerChegado(nome: string): never {
  throw new assert.AssertionError({
    message:
      `o cadastro chamou \`${nome}\` sem conferir a idade. A recusa precisa acontecer ` +
      'ANTES de qualquer escrita: conta de menor de 16 anos criada é o que a decisão ' +
      'de 18/10/2026 fechou, e exigir o campo depois não desfaz a conta que nasceu.',
  });
}

/**
 * Toda porta recusa, dizendo o nome do método.
 *
 * Mesma razão do `cadastro-recusa-endereco-injetavel.test.ts`: o que se afirma
 * é uma ausência, e um dublê que gravasse numa lista só provaria para as
 * chamadas que alguém lembrasse de conferir. Assim, uma implementação futura
 * que gravasse a conta por outro caminho também reprova.
 */
function repositorioQueRecusaTudo(): IdentityRepository {
  return {
    criarContaLocal: () => naoDeveriaTerChegado('criarContaLocal'),
    criarTokenDeVerificacao: () => naoDeveriaTerChegado('criarTokenDeVerificacao'),
    gravarRefresh: () => naoDeveriaTerChegado('gravarRefresh'),
    buscarContaPorEmail: () => naoDeveriaTerChegado('buscarContaPorEmail'),
    buscarContaPorId: () => naoDeveriaTerChegado('buscarContaPorId'),
    buscarRefreshPorHash: () => naoDeveriaTerChegado('buscarRefreshPorHash'),
    revogarFamilia: () => naoDeveriaTerChegado('revogarFamilia'),
    revogarTodasAsFamilias: () => naoDeveriaTerChegado('revogarTodasAsFamilias'),
    rotacionar: () => naoDeveriaTerChegado('rotacionar'),
    atualizarPerfil: () => naoDeveriaTerChegado('atualizarPerfil'),
    buscarCredencialLocalPorEmail: () => naoDeveriaTerChegado('buscarCredencialLocalPorEmail'),
    regravarCredencial: () => naoDeveriaTerChegado('regravarCredencial'),
    registrarLogin: () => naoDeveriaTerChegado('registrarLogin'),
    invalidarSessoes: () => naoDeveriaTerChegado('invalidarSessoes'),
    consumirTokenDeVerificacao: () => naoDeveriaTerChegado('consumirTokenDeVerificacao'),
    conferirTokenDeVerificacao: () => naoDeveriaTerChegado('conferirTokenDeVerificacao'),
    invalidarTokensPendentes: () => naoDeveriaTerChegado('invalidarTokensPendentes'),
    marcarEmailVerificado: () => naoDeveriaTerChegado('marcarEmailVerificado'),
    criarJanelaDeReautenticacao: () => naoDeveriaTerChegado('criarJanelaDeReautenticacao'),
    consumirJanelaDeReautenticacao: () => naoDeveriaTerChegado('consumirJanelaDeReautenticacao'),
    registrarPedidoDeExclusao: () => naoDeveriaTerChegado('registrarPedidoDeExclusao'),
    contasAExpurgar: () => naoDeveriaTerChegado('contasAExpurgar'),
    registrarPedidoDeTrocaDeEmail: () => naoDeveriaTerChegado('registrarPedidoDeTrocaDeEmail'),
    concluirTrocaDeEmail: () => naoDeveriaTerChegado('concluirTrocaDeEmail'),
    cancelarTrocaDeEmailPendente: () => naoDeveriaTerChegado('cancelarTrocaDeEmailPendente'),
    // As duas portas da FOTO entraram em 18/10/2026, pela development. Elas
    // recusam como todas as outras: nenhum caso deste arquivo e sobre foto, e
    // chegar la seria o cadastro fazendo coisa que a idade nao pede.
    fotoDoPerfil: () => naoDeveriaTerChegado('fotoDoPerfil'),
    trocarFotoDoPerfil: () => naoDeveriaTerChegado('trocarFotoDoPerfil'),
  };
}

/**
 * A conta recém-criada, **sem data de nascimento nenhuma**.
 *
 * `Conta` não tem campo de nascimento, e a ausência aqui não é esquecimento:
 * é o que faz este arquivo também afirmar que a data **não volta**. No dia em
 * que alguém a acrescentar a `Conta`, este objeto deixa de compilar.
 */
function contaRecemCriada(): Conta {
  return {
    id: 'a1b2c3d4-0000-7000-8000-000000000001' as UserId,
    email: EMAIL,
    emailVerifiedAt: null,
    displayName: 'Tutora',
    // `handle: null` e o estado NORMAL de conta sem apelido: nenhum fluxo
    // obriga a escolher (plano 4-C.8), e as 7 contas de hml estao assim.
    handle: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: INSTANTE_FIXO,
    // `dataFixa`, e nunca `new Date`: tempo real só em `shared/time/clock.ts`,
    // e o lint cobra isso em todo o repositório.
    createdAt: dataFixa(INSTANTE_FIXO),
  };
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly eventos: AuditEvent[];
  readonly mensagens: Mensagem[];
  /** O que `criarContaLocal` recebeu, quando o repositório aceita. */
  readonly recebidas: NovaConta[];
}

/**
 * `aceitandoEscrita` liga o caminho inteiro do cadastro: ele existe **só** para
 * o contrapeso. Os casos de recusa usam o dublê que recusa tudo, porque é a
 * ausência de escrita que eles afirmam.
 *
 * `instante` existe para o caso do fuso, e só para ele: os demais usam
 * `INSTANTE_FIXO`.
 */
function montar(aceitandoEscrita = false, instante: Instant = INSTANTE_FIXO): Bancada {
  const eventos: AuditEvent[] = [];
  const mensagens: Mensagem[] = [];
  const recebidas: NovaConta[] = [];

  const repositorio: IdentityRepository = aceitandoEscrita
    ? {
        ...repositorioQueRecusaTudo(),
        criarContaLocal: (nova: NovaConta) => {
          recebidas.push(nova);
          return Promise.resolve(contaRecemCriada());
        },
        criarTokenDeVerificacao: () => Promise.resolve(),
        gravarRefresh: () => Promise.resolve(),
      }
    : repositorioQueRecusaTudo();

  const assinador: TokenSigner = aceitandoEscrita
    ? {
        emitir: (sub, agora: Instant, jti) => ({
          token: `acesso-de-${sub}`,
          expiresInSeconds: 900,
          issuedAt: Math.floor(agora / 1000),
          jti,
        }),
        verificar: () => ({ ok: false, motivo: 'malformado' }),
        jwks: () => [],
      }
    : {
        emitir: () => naoDeveriaTerChegado('TokenSigner.emitir'),
        verificar: () => ({ ok: false, motivo: 'malformado' }),
        jwks: () => [],
      };

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

  const mailer: Mailer = aceitandoEscrita
    ? {
        enviar(mensagem) {
          mensagens.push(mensagem);
          return Promise.resolve();
        },
      }
    : { enviar: () => naoDeveriaTerChegado('Mailer.enviar') };

  const servico = criarAuthService({
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-1',
      opaqueToken: () => 'segredo-opaco' as OpaqueToken,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(instante),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: () => undefined,
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, eventos, mensagens, recebidas };
}

/** Cadastra com a data dada e devolve a recusa, ou reprova se foi aceito. */
async function recusaComData(
  nascimento: unknown,
  rotulo: string,
  instante: Instant = INSTANTE_FIXO,
): Promise<AppError> {
  const bancada = montar(false, instante);
  try {
    await bancada.servico.cadastrar(
      { email: EMAIL, password: SENHA_BOA, birthDate: nascimento, displayName: 'Tutora' },
      CONTEXTO,
    );
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError, e não por Error cru');
    assert.deepEqual(bancada.eventos, [], 'nenhum evento de trilha para uma conta que não nasceu');
    return erro;
  }
  throw new assert.AssertionError({
    message:
      `o cadastro aceitou ${rotulo}. A rota é pública: sem a trava no servidor, ` +
      'a tela é só uma sugestão, e a decisão de 18/10/2026 não vale para quem chama a API.',
  });
}

/** O erro do campo `birth_date` dentro de um `AppError` de validação. */
function erroDoCampo(erro: AppError): { field?: string; code?: string; message?: string } {
  const detalhes = erro as unknown as {
    errors?: readonly { field?: string; code?: string; message?: string }[];
  };
  const achado = detalhes.errors?.find((e) => e.field === 'birth_date');
  assert.ok(
    achado !== undefined,
    'a recusa não nomeou `birth_date`: sem o nome do campo a tela não tem onde marcar o erro',
  );
  return achado;
}

void describe('o cadastro exige 16 anos (decisão do cliente de 18/10/2026)', () => {
  /**
   * ISCA (a1), a borda de BAIXO. Desligada: trocando `<` por `<=` na
   * comparação de `IDADE_MINIMA_EM_ANOS` em `idade-minima.ts`, ou tirando o
   * `-1` de `idadeEmAnosCompletos`, este caso reprova — que é um menor de
   * idade criando conta. Conferido antes de entregar.
   */
  void it('15 anos e 364 dias é recusado', async () => {
    const erro = await recusaComData(
      DATA_DE_NASCIMENTO_15_E_364,
      'quem tem 15 anos e 364 dias (um dia antes de completar 16)',
    );

    assert.equal(erro.status, 400);
    const campo = erroDoCampo(erro);
    assert.equal(campo.code, 'too_young');
    assert.match(
      campo.message ?? '',
      /16 anos/,
      'a mensagem precisa dizer a REGRA; "dado inválido" manda a pessoa conferir o que ela digitou certo',
    );
  });

  /**
   * ISCA (a2), a borda de CIMA, e ela é um CONTRAPESO da (a1).
   *
   * **Sem este caso, a (a1) passaria com uma recusa de tudo.** Ele é o dia do
   * aniversário, e é o caso que uma conta de idade feita "para trás" — um
   * `<=` no lugar do `<`, ou uma subtração de instantes em UTC — recusaria. A
   * pessoa recusada no dia do próprio aniversário não tem como entender nem
   * contornar.
   */
  void it('16 anos exatos, no dia do aniversário, PASSA e grava', async () => {
    const bancada = montar(true);

    const sessao = await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: DATA_DE_NASCIMENTO_16_EXATOS,
        displayName: 'Tutora',
      },
      CONTEXTO,
    );

    assert.ok(sessao !== undefined, 'o cadastro de quem tem 16 anos exatos precisa abrir sessão');
    assert.equal(bancada.recebidas.length, 1, 'a conta precisa ter sido gravada uma vez');
    assert.equal(
      bancada.recebidas[0]?.birthDate,
      DATA_DE_NASCIMENTO_16_EXATOS,
      'a data que chegou ao repositório tem de ser a data conferida, em YYYY-MM-DD',
    );
  });

  /**
   * ISCA (b). Desligada: apagando a guarda `depoisDeHoje` de
   * `verificarDataDeNascimento`, este caso reprova — e uma data no futuro
   * passaria a produzir idade negativa, que é menor que 16 e seria recusada
   * pelo outro caminho com a mensagem errada ("você não tem 16 anos" para quem
   * digitou 2030).
   */
  void it('data no futuro é recusada, e não confundida com idade', async () => {
    const erro = await recusaComData('2030-01-01', 'uma data de nascimento no futuro');

    assert.equal(erro.status, 400);
    const campo = erroDoCampo(erro);
    assert.equal(
      campo.code,
      'in_future',
      'futuro tem código próprio (`in_future`, o mesmo de `last_seen_at`): ' +
        'dizer `too_young` para quem digitou 2030 manda a pessoa procurar o problema no lugar errado',
    );
  });

  /**
   * ISCA (c). O campo AUSENTE, chamando a aplicação direto — que é o caminho
   * de quem não passa pelo schema. Desligada: apagando a guarda de
   * `typeof bruto !== 'string'`, este caso reprova em `criarContaLocal`, que é
   * a conta nascendo sem idade conferida.
   */
  void it('cadastro SEM o campo é recusado, chamando a aplicação direto', async () => {
    const erro = await recusaComData(undefined, 'cadastro sem o campo de data de nascimento');

    assert.equal(erro.status, 400);
    assert.equal(erroDoCampo(erro).code, 'required');
  });

  /**
   * O mesmo buraco que o `"   "` do nome: a chave VEIO, e não tem data dentro.
   * `required` do schema não recusa `""`, e `format: date` do OpenAPI não é
   * conferido pelo Fastify em toda configuração — quem recusa é o servidor.
   */
  void it('string vazia e espaço em branco são recusados como ausência', async () => {
    for (const vazio of ['', '   ']) {
      const erro = await recusaComData(vazio, `data de nascimento ${JSON.stringify(vazio)}`);
      assert.equal(erroDoCampo(erro).code, 'required');
    }
  });

  /**
   * A data que não existe no calendário passa pela forma `YYYY-MM-DD` e precisa
   * morrer na volta de `Date.UTC`. Sem esta conferência, `2010-02-30` viraria
   * 02/03 em silêncio e o banco guardaria uma data que ninguém declarou.
   */
  void it('data que não existe no calendário é recusada, e não normalizada', async () => {
    const erro = await recusaComData('2010-02-30', '30 de fevereiro');
    assert.equal(erroDoCampo(erro).code, 'invalid');
  });

  /**
   * O ano absurdo, que é a mesma regra do `CHECK` da migração
   * `20261018000021`. Ele tem código próprio porque a saída da pessoa é
   * diferente: aqui ela digitou o ano errado, e corrigir resolve.
   */
  void it('ano antes de 1900 é recusado como fora de faixa', async () => {
    const erro = await recusaComData('1203-04-05', 'um ano absurdo');
    assert.equal(erroDoCampo(erro).code, 'out_of_range');
  });

  /**
   * ISCA DO FUSO. Desligada: trocando `FUSO_DO_PRODUTO` por `'UTC'` em
   * `idade-minima.ts`, este caso reprova — porque em UTC já é dia 11 e a
   * pessoa "já fez" 16 anos, enquanto em São Paulo ainda é dia 10 e ela não
   * fez.
   *
   * O instante é 2026-09-11T02:00:00Z, que é 2026-09-10 23:00 em São Paulo.
   * Quem nasceu em 2010-09-11 completa 16 anos **amanhã** em São Paulo.
   *
   * Isto não é preciosismo: são três horas por dia em que um cálculo em UTC
   * deixaria entrar quem a decisão do cliente manda recusar.
   */
  void it('o fuso do produto decide o dia: 23h de São Paulo não antecipa o aniversário', async () => {
    const vesperaEmSaoPaulo = Date.UTC(2026, 8, 11, 2, 0, 0) as Instant;

    const erro = await recusaComData(
      DATA_DE_NASCIMENTO_16_EXATOS,
      'quem completa 16 anos amanhã em São Paulo, às 23h de hoje',
      vesperaEmSaoPaulo,
    );

    assert.equal(erroDoCampo(erro).code, 'too_young');
  });

  /**
   * E o contrapeso do fuso: três horas depois, já é dia 11 em São Paulo, e a
   * MESMA data de nascimento passa. Sem ele, o caso acima ficaria verde com um
   * cálculo que recusasse sempre.
   */
  void it('o fuso do produto decide o dia: 00h01 de São Paulo já é o aniversário', async () => {
    const aniversarioEmSaoPaulo = Date.UTC(2026, 8, 11, 3, 1, 0) as Instant;
    const bancada = montar(true, aniversarioEmSaoPaulo);

    await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: DATA_DE_NASCIMENTO_16_EXATOS,
        displayName: 'Tutora',
      },
      CONTEXTO,
    );

    assert.equal(
      bancada.recebidas.length,
      1,
      'passado o primeiro minuto do aniversário em São Paulo, a conta precisa nascer',
    );
  });

  /**
   * CONTRAPESO GERAL: a data de nascimento **não volta na sessão**.
   *
   * Com idade mínima de 16 o titular pode ser adolescente, e data de
   * nascimento de adolescente junto com nome e bairro é material de
   * identificação de menor. Este caso varre o JSON da resposta inteira pelo
   * valor: se ele aparecer em qualquer lugar, reprova.
   */
  void it('a data de nascimento NÃO aparece na resposta do cadastro', async () => {
    const bancada = montar(true);

    const sessao = await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: DATA_DE_NASCIMENTO_16_EXATOS,
        displayName: 'Tutora',
      },
      CONTEXTO,
    );

    assert.ok(
      !JSON.stringify(sessao).includes(DATA_DE_NASCIMENTO_16_EXATOS),
      'a data de nascimento voltou na resposta do cadastro: ela existe para ser ' +
        'conferida, não para ser devolvida, e não há tela que a peça de volta',
    );
  });

  /**
   * E o `HOJE_EM_SAO_PAULO` da cabeceira deste arquivo não é um palpite: se
   * `INSTANTE_FIXO` mudar, as bordas acima deixam de ser bordas e os casos
   * ficariam verdes medindo outra coisa. Este caso é o que avisa.
   */
  void it('INSTANTE_FIXO continua sendo o dia que as bordas assumem', () => {
    const dia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dataFixa(INSTANTE_FIXO));

    assert.equal(
      dia,
      HOJE_EM_SAO_PAULO,
      'INSTANTE_FIXO mudou de dia: as datas de 15 anos e 364 dias e de 16 anos exatos ' +
        'deste arquivo precisam ser recalculadas, senão as duas bordas deixam de ser bordas',
    );
  });
});
