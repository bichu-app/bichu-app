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

const HOJE_EM_SAO_PAULO = '2026-09-11';

const DATA_DE_NASCIMENTO_16_EXATOS = '2010-09-11';

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
    fotoDoPerfil: () => Promise.resolve(null),
    trocarFotoDoPerfil: () => naoDeveriaTerChegado('trocarFotoDoPerfil'),
  };
}

function contaRecemCriada(): Conta {
  return {
    id: 'a1b2c3d4-0000-7000-8000-000000000001' as UserId,
    email: EMAIL,
    emailVerifiedAt: null,
    displayName: 'Tutora',
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
    createdAt: dataFixa(INSTANTE_FIXO),
  };
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly eventos: AuditEvent[];
  readonly mensagens: Mensagem[];
  readonly recebidas: NovaConta[];
}

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
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
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

  void it('cadastro SEM o campo é recusado, chamando a aplicação direto', async () => {
    const erro = await recusaComData(undefined, 'cadastro sem o campo de data de nascimento');

    assert.equal(erro.status, 400);
    assert.equal(erroDoCampo(erro).code, 'required');
  });

  void it('string vazia e espaço em branco são recusados como ausência', async () => {
    for (const vazio of ['', '   ']) {
      const erro = await recusaComData(vazio, `data de nascimento ${JSON.stringify(vazio)}`);
      assert.equal(erroDoCampo(erro).code, 'required');
    }
  });

  void it('data que não existe no calendário é recusada, e não normalizada', async () => {
    const erro = await recusaComData('2010-02-30', '30 de fevereiro');
    assert.equal(erroDoCampo(erro).code, 'invalid');
  });

  void it('ano antes de 1900 é recusado como fora de faixa', async () => {
    const erro = await recusaComData('1203-04-05', 'um ano absurdo');
    assert.equal(erroDoCampo(erro).code, 'out_of_range');
  });

  void it('o fuso do produto decide o dia: 23h de São Paulo não antecipa o aniversário', async () => {
    const vesperaEmSaoPaulo = Date.UTC(2026, 8, 11, 2, 0, 0) as Instant;

    const erro = await recusaComData(
      DATA_DE_NASCIMENTO_16_EXATOS,
      'quem completa 16 anos amanhã em São Paulo, às 23h de hoje',
      vesperaEmSaoPaulo,
    );

    assert.equal(erroDoCampo(erro).code, 'too_young');
  });

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
