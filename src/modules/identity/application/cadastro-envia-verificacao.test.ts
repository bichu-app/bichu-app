/**
 * O cadastro dispara o e-mail de verificação (BICHUS-147).
 *
 * ## O que estava quebrado
 *
 * `cadastrar` criava a conta, abria a sessão, gravava `auth.account_created` na
 * trilha e retornava — e **nunca chamava** `emitirEEnviarToken`. Os únicos
 * chamadores eram o reenvio (`solicitarVerificacaoDeEmail`) e a redefinição de
 * senha. Quem criava conta pelo app ficava com `email_verified_at` nulo para
 * sempre, e sem contato verificado o tutor não marca um pet como perdido
 * (BICHUS-73): o produto entregava cadastro e não entregava reencontro.
 *
 * Em homologação o `POST /v1/auth/register` respondia **201** e não havia
 * **nenhum** evento `email.send` no log. O 201 somado à ausência do evento é a
 * prova de que o caminho nem foi percorrido — e é por isso que o critério 2
 * afirma o **evento**, e não a entrega.
 *
 * ## Por que os casos daqui são escritos assim
 *
 * Um teste que só confere o 201 **passa hoje, com o defeito de pé**. Cada caso
 * deste arquivo foi desligado uma vez, a mecânica de cada isca está anotada em
 * cima dele, e o que se afirma é sempre o **efeito nas portas** — a mensagem
 * que o mailer recebeu, a linha que o repositório gravou, o evento que o log
 * registrou. Nenhum deles olha só o código de resposta.
 *
 * ## A decisão de desenho que estes casos travam
 *
 * O servidor dispara **dentro de** `cadastrar`, e não o app depois do 201.
 * `registerUser` já declara `x-effects: [notifies, verifies_secret]` no
 * contrato, então esta correção **não muda o contrato** (critério 9) — quem
 * estava fora dele era o código. A alternativa (o app chamando
 * `requestEmailVerification` depois do 201) gastaria um terço do orçamento de
 * reenvio de quem ainda não pediu reenvio nenhum, dependeria de uma segunda
 * chamada de rede que falha sozinha, e precisaria ser lembrada por todo cliente
 * novo. O caso do critério 5 é o que separa os dois desenhos.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashDeToken } from '../../../shared/crypto/digest.js';
import { AppError } from '../../../shared/http/errors.js';
// O contador REAL do limite de chamadas, e não uma imitação: o caso do
// critério 5 existe para afirmar quantos reenvios cabem na hora, e um contador
// escrito no teste provaria a aritmética do teste.
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
// O teto do reenvio é lido da declaração da rota, que espelha `x-rate-limit` do
// contrato. Repetir o número aqui seria a segunda fonte da verdade: o dia em
// que a política mudasse, este arquivo continuaria verde afirmando a política
// velha.
import { rotaDeCadastro, rotaDePedidoDeVerificacao } from '../adapters/http/routes.js';
import type {
  Conta,
  CredencialLocal,
  IdentityRepository,
  NovaConta,
  NovoRefresh,
  NovoTokenDeVerificacao,
  PropositoDoToken,
  RefreshArmazenado,
  TokenConsumido,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

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

/** A porta é grande e o cadastro usa cinco métodos. O resto grita se for chamado. */
function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function contaRecemCriada(): Conta {
  return {
    id: CONTA_NOVA,
    email: EMAIL,
    // O ponto da história inteira: a conta nasce com o e-mail NÃO verificado, e
    // o que a tira desse estado é o link que precisa sair daqui.
    emailVerifiedAt: null,
    displayName: 'Tutora',
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

class RepositorioDeCadastro implements IdentityRepository {
  public readonly contasCriadas: NovaConta[] = [];
  public readonly tokensGravados: NovoTokenDeVerificacao[] = [];
  public readonly familiasAbertas: NovoRefresh[] = [];

  /** `undefined` é o que a unicidade do banco devolve quando o e-mail já tem conta. */
  constructor(private readonly conta: Conta | undefined) {}

  criarContaLocal(nova: NovaConta): Promise<Conta | undefined> {
    this.contasCriadas.push(nova);
    return Promise.resolve(this.conta);
  }

  criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
    this.tokensGravados.push(novo);
    return Promise.resolve();
  }

  gravarRefresh(novo: NovoRefresh): Promise<void> {
    this.familiasAbertas.push(novo);
    return Promise.resolve();
  }

  buscarContaPorEmail(email: string): Promise<Conta | undefined> {
    return Promise.resolve(this.conta?.email === email ? this.conta : undefined);
  }

  buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  buscarRefreshPorHash(): Promise<RefreshArmazenado | undefined> {
    return naoUsado('buscarRefreshPorHash');
  }
  revogarFamilia(): Promise<number> {
    return naoUsado('revogarFamilia');
  }
  revogarTodasAsFamilias(): Promise<number> {
    return naoUsado('revogarTodasAsFamilias');
  }
  rotacionar(): Promise<boolean> {
    return naoUsado('rotacionar');
  }
  atualizarPerfil(): Promise<Conta | undefined> {
    return naoUsado('atualizarPerfil');
  }
  buscarCredencialLocalPorEmail(): Promise<CredencialLocal | undefined> {
    return naoUsado('buscarCredencialLocalPorEmail');
  }
  regravarCredencial(): Promise<void> {
    return naoUsado('regravarCredencial');
  }
  registrarLogin(): Promise<void> {
    return naoUsado('registrarLogin');
  }
  invalidarSessoes(): Promise<void> {
    return naoUsado('invalidarSessoes');
  }
  consumirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    return naoUsado('consumirTokenDeVerificacao');
  }
  conferirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    return naoUsado('conferirTokenDeVerificacao');
  }
  invalidarTokensPendentes(): Promise<number> {
    return naoUsado('invalidarTokensPendentes');
  }
  criarJanelaDeReautenticacao(): Promise<void> {
    return naoUsado('criarJanelaDeReautenticacao');
  }

  consumirJanelaDeReautenticacao(): never {
    throw new Error('consumirJanelaDeReautenticacao: nenhum caso deste arquivo chega aqui');
  }

  marcarEmailVerificado(): Promise<void> {
    return naoUsado('marcarEmailVerificado');
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

/**
 * `mailerFalha` é o cenário do critério 3, e `semDubleDeMailer` é o do critério
 * 10: a suíte rodando sem o dublê **não pode** ficar verde em silêncio.
 */
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

  /**
   * O que fica no lugar do dublê quando ele não foi configurado.
   *
   * Ele **falha dizendo o motivo** (critério 10). A tentação aqui seria um
   * mailer que não faz nada: os casos ficariam verdes sem envio nenhum, que é
   * exatamente o defeito que esta issue corrige — e pior, com a suíte
   * afirmando o contrário.
   */
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

  // Valores distintos e reconhecíveis: o caso do critério 7 varre a saída atrás
  // do valor exato do token, e dois tokens iguais fariam o refresh e o link de
  // verificação se confundirem justamente no caso que existe para separá-los.
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

/**
 * A guarda do critério 10, e ela existe por causa do critério 3.
 *
 * O cadastro **engole** a falha de envio de propósito: a conta não pode morrer
 * porque o provedor de e-mail caiu. O preço disso é que um dublê quebrado, um
 * mailer ausente ou uma porta mal fiada produzem exatamente o mesmo 201 de um
 * envio bem-sucedido. Sem esta conferência, todo caso deste arquivo ficaria
 * verde sem envio nenhum — que é o defeito original com a suíte aplaudindo.
 *
 * Por isso ela **reprova dizendo o motivo registrado**, em vez de deixar a
 * ausência passar por sucesso.
 */
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

/** O link vem do corpo da mensagem, que é o único lugar onde o token em claro existe. */
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
  return { email: EMAIL, password: SENHA_BOA, displayName: 'Tutora' };
}

void describe('cadastro dispara a verificação de e-mail (BICHUS-147, critérios 1, 2 e 8)', () => {
  /**
   * ISCA (critério 1). Apagar a linha `await enviarVerificacaoDoCadastro(...)`
   * de `cadastrar` faz este caso reprovar em `tokensGravados.length`, que vira
   * 0. Conferido: com a linha fora, `1 !== 0`.
   */
  void it('grava UM token `email_verify` e produz UMA mensagem para o endereço cadastrado', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    assert.equal(bancada.repo.tokensGravados.length, 1, 'exatamente um token, nem zero nem dois');
    const token = bancada.repo.tokensGravados[0];
    assert.equal(token?.proposito, 'email_verify');
    assert.equal(token?.userId, CONTA_NOVA);
    assert.equal(token?.enviadoPara, EMAIL);
    // 24 h (critério 6 de BICHUS-79): o e-mail é lido no dia seguinte.
    assert.equal(token?.expiraEm, (AGORA + 24 * 60 * 60 * 1000) as Instant);

    assert.equal(bancada.mensagens.length, 1, 'exatamente uma mensagem');
    assert.equal(bancada.mensagens[0]?.para, EMAIL);
    assert.match(bancada.mensagens[0]?.corpo ?? '', /https:\/\/bichu\.test\/verificar-email\?token=/);
  });

  /**
   * O que o banco guarda é o SHA-256 do que foi para o e-mail, e não outro
   * valor qualquer. Sem esta amarra, gravar um token e mandar outro no link
   * passaria nos dois casos acima e produziria um link que nunca verifica.
   */
  void it('o hash gravado é o do token que foi no link, e o valor em claro não é persistido', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    const token = tokenDoLink(bancada.mensagens[0]?.corpo ?? '');
    const gravado = bancada.repo.tokensGravados[0]?.tokenHash;
    assert.equal(gravado, hashDeToken(token).toString('base64') as TokenHash);
    assert.notEqual(gravado, token, 'o que se guarda é o resumo, nunca o valor');
  });

  /**
   * ISCA (critério 2). É este evento, e não a entrega, que prova que o caminho
   * foi percorrido: foi a ausência dele em hml, diante de um 201, que
   * identificou o defeito. Ele nasce na aplicação e não no transporte — o
   * transporte de log registrava e o de SMTP não, e prova que depende de qual
   * transporte está ligado não prova nada.
   */
  void it('registra `email.send` com propósito `email_verify` e o correlation_id da requisição', async () => {
    const bancada = montar({});
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);

    const enviados = eventosDeEnvio(bancada, 'email.send');
    assert.equal(enviados.length, 1, 'um 201 sem evento `email.send` foi o defeito desta issue');
    assert.equal(enviados[0]?.dados['proposito'], 'email_verify');
    assert.equal(enviados[0]?.dados['correlationId'], CONTEXTO.correlationId);
    assert.equal(enviados[0]?.dados['userId'], CONTA_NOVA);
  });

  /**
   * ISCA (critério 8). A frase de F1.2 — "Enviamos um link para <e-mail>" — tem
   * que ser verdadeira **sem** o app fazer uma segunda chamada. Nenhuma linha
   * deste caso toca `solicitarVerificacaoDeEmail`, e é isso que ele afirma.
   */
  void it('a mensagem existe sem o cliente ter chamado `requestEmailVerification`', async () => {
    const bancada = montar({});
    const sessao = await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);

    assert.equal(bancada.mensagens.length, 1);
    assert.equal(bancada.mensagens[0]?.assunto, 'Confirme seu e-mail no Bichu');
    // A conta continua nascendo incompleta de propósito: quem a completa é o
    // clique no link, e a tela de F1.2 vive desse estado.
    assert.equal(sessao.user.email_verified, false);
    assert.ok(sessao.user.pending_profile_fields.includes('email_verification'));
  });

  /**
   * Critério 9: a correção **não muda o contrato**. `registerUser` já declarava
   * `notifies`, e a declaração da rota espelha `x-effects` da especificação.
   * Se alguém tirar `notifies` daqui para "ajustar" o contrato à
   * implementação, este caso reprova antes de o portão de contrato rodar.
   */
  void it('`registerUser` continua declarando o efeito `notifies` que já estava no contrato', () => {
    assert.ok(
      rotaDeCadastro.effects.includes('notifies'),
      'a operação de cadastro notifica desde sempre; quem estava fora do contrato era o código',
    );
  });
});

void describe('o e-mail que não sai não derruba a conta que nasceu (BICHUS-147, critério 3)', () => {
  /**
   * ISCA (critério 3). Trocar o `try/catch` de `enviarVerificacaoDoCadastro`
   * por uma chamada nua faz `cadastrar` propagar o erro do mailer, e os três
   * casos abaixo reprovam — o primeiro deles com o erro do provedor à vista.
   */
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
    // Sem o motivo, quem investiga em hml sabe que falhou e não sabe por quê —
    // e a diferença entre "provedor fora" e "endereço recusado" é a diferença
    // entre esperar e agir.
    assert.match(String(falhas[0]?.dados['motivo']), /SMTP 421/);
    assert.equal(eventosDeEnvio(bancada, 'email.send').length, 0, 'não registra envio que não houve');
  });

  /**
   * A guarda do critério 10, exercitada.
   *
   * Sem o dublê de mailer o cadastro **continua** respondendo 201, porque o
   * critério 3 manda engolir a falha. É por isso que `exigirQueOEnvioNaoTenhaFalhado`
   * existe: este caso prova que ela reprova, e dizendo o motivo — verificação
   * que não consegue verificar não pode aprovar.
   */
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
  /**
   * ISCA (critério 6). Este caso existe para impedir que o envio seja posto
   * **antes** da consulta de unicidade — o que transformaria o cadastro num
   * disparador de e-mail para endereço alheio: bastaria um POST com o endereço
   * de outra pessoa para este serviço escrever para ela.
   *
   * Conferido: movendo `enviarVerificacaoDoCadastro` para antes de
   * `criarContaLocal`, o caso reprova em `mensagens.length` (1, não 0) e em
   * `tokensGravados.length`.
   */
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
      bancada.servico.cadastrar({ email: EMAIL, password: '123', displayName: 'Tutora' }, CONTEXTO),
    );

    assert.equal(erro.status, 422);
    assert.deepEqual(bancada.mensagens, []);
    assert.deepEqual(bancada.repo.tokensGravados, []);
  });
});

void describe('o token em claro não aparece em lugar nenhum (BICHUS-147, critério 7)', () => {
  /**
   * ISCA (critério 7). O caso varre o corpo da resposta, a saída de log inteira
   * e a trilha atrás do **valor exato** do token. Acrescentar `tokenBruto` ao
   * `registrarOcorrencia` de `emitirEEnviarToken` — que é a "melhoria" tentadora
   * para facilitar o diagnóstico em hml — faz este caso reprovar apontando
   * onde. Conferido com `token: tokenBruto` no evento: reprova em "na saída de
   * log".
   */
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
    // O refresh que volta na resposta é outro segredo, e um dublê que
    // devolvesse o mesmo valor para os dois faria a varredura acima passar por
    // acidente.
    assert.notEqual(sessao.refresh_token, token);
  });
});

void describe('o cadastro não paga pela cota de reenvio (BICHUS-147, critério 5)', () => {
  /**
   * Quatro toques em `Reenviar` dentro da mesma hora: os três primeiros
   * atendidos, o quarto 429.
   *
   * **É este caso que separa os dois desenhos.** No desenho recusado — o app
   * chamando `requestEmailVerification` depois do 201 — o primeiro envio sairia
   * pela operação que carrega a cota, e aí o TERCEIRO toque já seria 429: o
   * tutor que errou o endereço bate no teto uma tentativa antes, justamente
   * quando o reenvio é o remédio do problema. No desenho escolhido o envio do
   * cadastro não passa por essa operação, e os três reenvios continuam
   * inteiros.
   *
   * O teto e a janela vêm da declaração da rota, que espelha `x-rate-limit` do
   * contrato, e o contador é o de produção. Nada aqui é número escrito à mão.
   *
   * ISCA conferida: acrescentando ao cenário a chamada que o desenho recusado
   * faria (`reenviar()` logo depois de `cadastrar`, como o app faria depois do
   * 201), o terceiro toque volta 429 e o caso reprova.
   */
  const politicaPorConta = rotaDePedidoDeVerificacao.rateLimit.find((regra) =>
    // `dimension` chega como tupla literal (o `const` de `defineRoute` a
    // preserva), e é por isso que a leitura é alargada aqui em vez de comparada
    // item a item.
    (regra.dimension as readonly string[]).includes('account'),
  );

  void it('a política por conta existe na rota de reenvio, ou não há o que verificar', () => {
    // Critério 10: sem a política declarada, os casos abaixo não teriam teto
    // para afirmar. Eles precisam reprovar dizendo isso, e não passar com um
    // número inventado.
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

    /** Um toque em `Reenviar`, como a operação `requestEmailVerification` o conta. */
    const reenviar = async (): Promise<number> => {
      const decisao = await contador.hit(`account:${CONTA_NOVA}`, limite, janela);
      if (!decisao.allowed) {
        // A RFC 9110 exige `Retry-After` no 429, e o app offline precisa dele
        // para decidir quando tentar de novo em vez de martelar.
        assert.ok(
          (decisao.retryAfterSeconds ?? 0) > 0,
          'o 429 precisa dizer quando tentar de novo (RFC 9110)',
        );
        return 429;
      }
      await bancada.servico.solicitarVerificacaoDeEmail(EMAIL, CONTEXTO);
      return 202;
    };

    // O cadastro. Ele manda o e-mail e NÃO toca na cota: quem não pediu
    // reenvio não paga por reenvio.
    await bancada.servico.cadastrar(cadastroValido(), CONTEXTO);
    exigirQueOEnvioNaoTenhaFalhado(bancada);
    assert.equal(bancada.mensagens.length, 1, 'o e-mail do cadastro saiu');

    assert.deepEqual(
      [await reenviar(), await reenviar(), await reenviar(), await reenviar()],
      [202, 202, 202, 429],
      'com o cadastro consumindo a cota, o TERCEIRO toque já seria 429',
    );

    // Uma mensagem do cadastro mais três reenvios atendidos. O quarto toque não
    // produz mensagem nenhuma: 429 é recusa, não envio silencioso.
    assert.equal(bancada.mensagens.length, 1 + limite);
    assert.equal(bancada.repo.tokensGravados.length, 1 + limite);
  });

  /**
   * O contrapeso do caso acima: o reenvio continua sendo o caminho de
   * recuperação de F1.2 (critério 4, e critérios 3 e 4 de BICHUS-79) mesmo
   * quando o e-mail do cadastro falhou. Sem ele, "não consome a cota" poderia
   * ser satisfeito por um reenvio que simplesmente não funciona.
   */
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
