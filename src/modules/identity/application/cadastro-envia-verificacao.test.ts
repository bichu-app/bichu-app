import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashDeToken } from '../../../shared/crypto/digest.js';
import { AppError } from '../../../shared/http/errors.js';
import { criarContadorEmMemoria, janelaEmSegundos } from '../../../shared/http/rate-limit.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { rotaDeCadastro, rotaDePedidoDeVerificacao } from '../adapters/http/routes.js';
import type {
  Conta,
  FotoDoPerfil,
  NovaConta,
  NovoRefresh,
  NovoTokenDeVerificacao,
  PropositoDoToken,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';

const CONTA_NOVA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f02' as UserId;
const EMAIL = 'tutora@exemplo.test';
const SENHA_BOA = 'coleira-azul-do-bidu-2026';
const AGORA = INSTANTE_FIXO;

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (iPhone)',
};

interface Registro {
  readonly dados: Record<string, unknown>;
  readonly mensagem: string;
}

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function contaRecemCriada(): Conta {
  return {
    id: CONTA_NOVA,
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
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(AGORA),
  };
}

class RepositorioDeCadastro extends RepositorioQueRecusaTudo {
  override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
    return Promise.resolve(null);
  }

  protected recusar(nome: string): never {
    return naoUsado(nome);
  }

  public readonly contasCriadas: NovaConta[] = [];
  public readonly tokensGravados: NovoTokenDeVerificacao[] = [];
  public readonly familiasAbertas: NovoRefresh[] = [];

  constructor(private readonly conta: Conta | undefined) {
    super();
}

  override criarContaLocal(nova: NovaConta): Promise<Conta | undefined> {
    this.contasCriadas.push(nova);
    return Promise.resolve(this.conta);
  }

  override criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
    this.tokensGravados.push(novo);
    return Promise.resolve();
  }

  override gravarRefresh(novo: NovoRefresh): Promise<void> {
    this.familiasAbertas.push(novo);
    return Promise.resolve();
  }

  override buscarContaPorEmail(email: string): Promise<Conta | undefined> {
    return Promise.resolve(this.conta?.email === email ? this.conta : undefined);
  }

  override buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  expurgarConta(): Promise<boolean> {
    return naoUsado('expurgarConta');
  }
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: RepositorioDeCadastro;
  readonly mensagens: Mensagem[];
  readonly registros: Registro[];
  readonly eventos: AuditEvent[];
  readonly mailerConfigurado: boolean;
}

function montar(
  opcoes: {
    emailJaTemConta?: boolean;
    mailerFalha?: boolean;
    semDubleDeMailer?: boolean;
  } = {},
): Bancada {
  const conta = opcoes.emailJaTemConta === true ? undefined : contaRecemCriada();
  const repo = new RepositorioDeCadastro(conta);
  const mensagens: Mensagem[] = [];
  const registros: Registro[] = [];
  const eventos: AuditEvent[] = [];

  const dubleDeMailer: Mailer = {
    enviar(mensagem) {
      if (opcoes.mailerFalha === true) {
        return Promise.reject(new Error('provedor fora do ar (SMTP 421)'));
      }
      mensagens.push(mensagem);
      return Promise.resolve();
    },
  };

  const semDuble: Mailer = {
    enviar() {
      return Promise.reject(
        new Error(
          'o dublê de mailer não está configurado nesta bancada: sem ele nada prova ' +
            'que o cadastro dispara o e-mail, e o caso precisa REPROVAR em vez de passar ' +
            '(BICHUS-147, critério 10)',
        ),
      );
    },
  };

  let contador = 0;
  const assinador: TokenSigner = {
    emitir: (sub, agora, jti) => ({
      token: `acesso-de-${sub}`,
      expiresInSeconds: 900,
      issuedAt: Math.floor(agora / 1000),
      jti,
    }),
    verificar: () => ({ ok: false, motivo: 'malformado' }),
    jwks: () => [],
  };

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

  const servico = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio: repo,
    assinador,
    trilha,
    ids: {
      uuidv7: () => {
        contador += 1;
        return `id-${String(contador)}`;
      },
      opaqueToken: () => {
        contador += 1;
        return `segredo-opaco-numero-${String(contador)}` as OpaqueToken;
      },
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(AGORA),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer: opcoes.semDubleDeMailer === true ? semDuble : dubleDeMailer,
    registrarOcorrencia: (dados, mensagem) => {
      registros.push({ dados, mensagem });
    },
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return {
    servico,
    repo,
    mensagens,
    registros,
    eventos,
    mailerConfigurado: opcoes.semDubleDeMailer !== true,
  };
}

function eventosDeEnvio(bancada: Bancada, evento: string): Registro[] {
  return bancada.registros.filter((r) => r.dados['evento'] === evento);
}

function exigirQueOEnvioNaoTenhaFalhado(bancada: Bancada): void {
  const falhas = eventosDeEnvio(bancada, 'email.send_failed');
  if (falhas.length === 0) return;
  throw new assert.AssertionError({
    message:
      'o envio do cadastro falhou nesta bancada e o cadastro engoliu a falha (critério 3), ' +
      'então nada aqui prova o disparo. Motivo registrado: ' +
      String(falhas[0]?.dados['motivo']),
  });
}

function tokenDoLink(corpo: string): string {
  const casado = /[?&]token=([^\s&]+)/.exec(corpo);
  if (casado?.[1] === undefined) {
    throw new assert.AssertionError({
      message: `a mensagem não carrega link com token, e sem ele não há o que verificar. Corpo: ${corpo}`,
    });
  }
  return casado[1];
}

async function capturar(promessa: Promise<unknown>): Promise<AppError> {
  try {
    await promessa;
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError');
    return erro;
  }
  throw new assert.AssertionError({ message: 'a chamada deveria ter sido recusada' });
}

function cadastroValido(): Parameters<ReturnType<typeof criarAuthService>['cadastrar']>[0] {
  return { email: EMAIL, password: SENHA_BOA, birthDate: '1990-05-12', displayName: 'Tutora' };
}

void describe('cadastro dispara a verificação de e-mail (BICHUS-147, critérios 1, 2 e 8)', () => {
  void it('grava UM token `email_verify` e produz UMA mensagem para o endereço cadastrado', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    assert.equal(bancada.repo.tokensGravados.length, 1, 'exatamente um token, nem zero nem dois');
    const token = bancada.repo.tokensGravados[0];
    assert.equal(token?.proposito, 'email_verify');
    assert.equal(token?.userId, CONTA_NOVA);
    assert.equal(token?.enviadoPara, EMAIL);
    assert.equal(token?.expiraEm, (AGORA + 24 * 60 * 60 * 1000) as Instant);

    assert.equal(bancada.mensagens.length, 1, 'exatamente uma mensagem');
    assert.equal(bancada.mensagens[0]?.para, EMAIL);
    assert.match(bancada.mensagens[0]?.corpo ?? '', /https:\/\/bichu\.test\/verificar-email\?token=/);
  });

  void it('o hash gravado é o do token que foi no link, e o valor em claro não é persistido', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    const token = tokenDoLink(bancada.mensagens[0]?.corpo ?? '');
    const gravado = bancada.repo.tokensGravados[0]?.tokenHash;
    assert.deepEqual(gravado, hashDeToken(token) as TokenHash);
    assert.equal(gravado?.length, 32, 'SHA-256 tem 32 bytes; 44 seria o texto base64 deles');
    assert.notEqual(gravado, token, 'o que se guarda é o resumo, nunca o valor');
  });

  void it('registra `email.send` com propósito `email_verify` e o correlation_id da requisição', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);

    const enviados = eventosDeEnvio(bancada, 'email.send');
    assert.equal(enviados.length, 1, 'um 201 sem evento `email.send` foi o defeito desta issue');
    assert.equal(enviados[0]?.dados['proposito'], 'email_verify');
    assert.equal(enviados[0]?.dados['correlationId'], CONTEXTO.correlationId);
    assert.equal(enviados[0]?.dados['userId'], CONTA_NOVA);
  });

  void it('a mensagem existe sem o cliente ter chamado `requestEmailVerification`', async () => {
    const bancada = montar({});
    const sessao = await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    assert.equal(bancada.mensagens.length, 1);
    assert.equal(bancada.mensagens[0]?.assunto, 'Confirme seu e-mail no Bichu');
    assert.equal(sessao.user.email_verified, false);
    assert.ok(sessao.user.pending_profile_fields.includes('email_verification'));
  });

  void it('`registerUser` continua declarando o efeito `notifies` que já estava no contrato', () => {
    assert.ok(
      rotaDeCadastro.effects.includes('notifies'),
      'a operação de cadastro notifica desde sempre; quem estava fora do contrato era o código',
    );
  });
});

void describe('o e-mail que não sai não derruba a conta que nasceu (BICHUS-147, critério 3)', () => {
  void it('devolve o par de tokens mesmo com o mailer lançando', async () => {
    const bancada = montar({ mailerFalha: true });
    const sessao = await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);

    assert.equal(sessao.token_type, 'Bearer');
    assert.ok(sessao.access_token.length > 0);
    assert.ok(sessao.refresh_token.length > 0);
    assert.equal(sessao.user.id, CONTA_NOVA);
  });

  void it('a conta existe e a sessão abre: a falha do envio não volta atrás', async () => {
    const bancada = montar({ mailerFalha: true });
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);

    assert.equal(bancada.repo.contasCriadas.length, 1);
    assert.equal(bancada.repo.familiasAbertas.length, 1, 'a família de refresh nasceu');
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'auth.account_created').length,
      1,
      'a criação da conta continua na trilha',
    );
  });

  void it('a falha fica registrada com o correlation_id, e não some em silêncio', async () => {
    const bancada = montar({ mailerFalha: true });
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);

    const falhas = eventosDeEnvio(bancada, 'email.send_failed');
    assert.equal(falhas.length, 1);
    assert.equal(falhas[0]?.dados['correlationId'], CONTEXTO.correlationId);
    assert.equal(falhas[0]?.dados['proposito'], 'email_verify');
    assert.match(String(falhas[0]?.dados['motivo']), /SMTP 421/);
    assert.equal(eventosDeEnvio(bancada, 'email.send').length, 0, 'não registra envio que não houve');
  });

  void it('sem o dublê de mailer, a conferência REPROVA dizendo o motivo', async () => {
    const bancada = montar({ semDubleDeMailer: true });
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    assert.equal(bancada.mailerConfigurado, false);

    assert.throws(
      () => {
        exigirQueOEnvioNaoTenhaFalhado(bancada);
      },
      (erro: unknown) => {
        assert.ok(erro instanceof assert.AssertionError);
        assert.match(erro.message, /dublê de mailer não está configurado/);
        assert.match(erro.message, /critério 10/);
        return true;
      },
    );
  });
});

void describe('e-mail já cadastrado: 409 sem mensagem e sem token (BICHUS-147, critério 6)', () => {
  void it('responde 409 e não produz mensagem nem token', async () => {
    const bancada = montar({ emailJaTemConta: true });
    const erro = await capturar(bancada.servico.cadastrar(cadastroValido(), CONTEXTO));

    assert.equal(erro.status, 409);
    assert.equal(erro.problemType, 'email-already-registered');
    assert.deepEqual(bancada.mensagens, [], 'endereço alheio não recebe e-mail nosso');
    assert.deepEqual(bancada.repo.tokensGravados, []);
    assert.deepEqual(eventosDeEnvio(bancada, 'email.send'), []);
  });

  void it('senha fraca é recusada antes de qualquer envio', async () => {
    const bancada = montar({});
    const erro = await capturar(
      bancada.servico.cadastrar(
        { email: EMAIL, password: '123', birthDate: '1990-05-12', displayName: 'Tutora' },
        CONTEXTO,
      ),
    );

    assert.equal(erro.status, 422);
    assert.deepEqual(bancada.mensagens, []);
    assert.deepEqual(bancada.repo.tokensGravados, []);
  });
});

void describe('o token em claro não aparece em lugar nenhum (BICHUS-147, critério 7)', () => {
  void it('não está na resposta, no log, na trilha nem no correlation_id', async () => {
    const bancada = montar({});
    const sessao = await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    const token = tokenDoLink(bancada.mensagens[0]?.corpo ?? '');
    assert.ok(token.length > 0);

    assert.ok(!JSON.stringify(sessao).includes(token), 'o token em claro está na resposta 201');
    assert.ok(!JSON.stringify(bancada.registros).includes(token), 'o token em claro está na saída de log');
    assert.ok(!JSON.stringify(bancada.eventos).includes(token), 'o token em claro está na trilha');
    assert.ok(!CONTEXTO.correlationId.includes(token));
    assert.notEqual(sessao.refresh_token, token);
  });
});

void describe('o cadastro não paga pela cota de reenvio (BICHUS-147, critério 5)', () => {
  const politicaPorConta = rotaDePedidoDeVerificacao.rateLimit.find((regra) =>
    (regra.dimension as readonly string[]).includes('account'),
  );

  void it('a política por conta existe na rota de reenvio, ou não há o que verificar', () => {
    assert.ok(
      politicaPorConta !== undefined,
      '`requestEmailVerification` deixou de declarar teto por conta: sem ele o critério 5 ' +
        'não é verificável, e este arquivo não pode fingir que é',
    );
    assert.equal(politicaPorConta?.onExceed, 'deny_429');
  });

  void it('três reenvios na mesma hora são atendidos e o quarto recebe 429', async () => {
    assert.ok(politicaPorConta !== undefined);
    const limite = politicaPorConta.limit;
    const janela = janelaEmSegundos(politicaPorConta.window);
    const contador = criarContadorEmMemoria(() => AGORA);
    const bancada = montar({});

    const reenviar = async (): Promise<number> => {
      const decisao = await contador.hit(`account:${CONTA_NOVA}`, limite, janela);
      if (!decisao.allowed) {
        assert.ok(
          (decisao.retryAfterSeconds ?? 0) > 0,
          'o 429 precisa dizer quando tentar de novo (RFC 9110)',
        );
        return 429;
      }
      await bancada.servico.solicitarVerificacaoDeEmail(EMAIL, CONTEXTO);
      return 202;
    };

    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);
    assert.equal(bancada.mensagens.length, 1, 'o e-mail do cadastro saiu');

    assert.deepEqual(
      [await reenviar(), await reenviar(), await reenviar(), await reenviar()],
      [202, 202, 202, 429],
      'com o cadastro consumindo a cota, o TERCEIRO toque já seria 429',
    );

    assert.equal(bancada.mensagens.length, 1 + limite);
    assert.equal(bancada.repo.tokensGravados.length, 1 + limite);
  });

  void it('depois de o e-mail do cadastro falhar, o reenvio ainda produz mensagem e token', async () => {
    const bancada = montar({ mailerFalha: false });
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    const depoisDoCadastro = bancada.mensagens.length;

    await bancada.servico.solicitarVerificacaoDeEmail(EMAIL, CONTEXTO);

    assert.equal(bancada.mensagens.length, depoisDoCadastro + 1);
    assert.equal(bancada.repo.tokensGravados.length, depoisDoCadastro + 1);
    assert.equal(
      bancada.repo.tokensGravados.at(-1)?.proposito,
      'email_verify' satisfies PropositoDoToken,
    );
  });
});
