/**
 * Detecção de reuso de refresh e barreira do SEC-006, com dublês das portas
 * (BICHUS-15, critérios 4, 8 e 10).
 *
 * Estes casos existem por causa de BICHUS-123: o QA desligou `revogarFamilia`,
 * desligou `avisarTitular` e arrancou a comparação do `iat` com
 * `sessions_invalid_before`, e a suíte inteira continuou verde. Quem paga essa
 * conta é sempre a mesma pessoa — a que teve o refresh copiado e não é avisada,
 * e a que trocou a senha porque desconfiou de alguma coisa e continuou com o
 * invasor dentro da conta.
 *
 * O que se afirma aqui é o EFEITO nas portas, e não o retorno: a resposta 401 é
 * idêntica no reuso e no token que simplesmente venceu, de propósito. Um teste
 * que só olhasse o 401 passaria com a revogação e o aviso arrancados.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { AppError } from '../../../shared/http/errors.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  TokenHash,
  UserId,
} from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type {
  Conta,
  CredencialLocal,
  IdentityRepository,
  MotivoDeRevogacao,
  NovoRefresh,
  PropositoDoToken,
  RefreshArmazenado,
  TokenConsumido,
} from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { ResultadoDaVerificacao, TokenSigner } from '../ports/token-signer.js';
import type { AvisoAoTitular, ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const VITIMA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const FAMILIA = 'fam-da-vitima';
const AGORA = INSTANTE_FIXO;

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: 'corr-1',
  ip: '203.0.113.7',
  userAgent: 'Bichu/1.0 (iPhone)',
};

/** A porta é grande e o caso usa quatro métodos. O resto grita se for chamado. */
function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function contaAtiva(sessionsInvalidBefore: Instant): Conta {
  return {
    id: VITIMA,
    email: 'tutora@exemplo.test',
    emailVerifiedAt: dataFixa(1),
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
    sessionsInvalidBefore,
    createdAt: dataFixa(1),
  };
}

/**
 * O que a redefinição de senha encontra do outro lado da porta (BICHUS-126).
 *
 * `pendente` é o que a conferência sem consumo acha, e `consumido` é o que a
 * transação devolve. São campos separados de propósito: entre os dois passos
 * outra requisição pode ter gasto o mesmo link, e é esse caso que a
 * implementação confere de novo em vez de confiar na primeira leitura.
 */
interface RedefinicaoPendente {
  readonly pendente: TokenConsumido | undefined;
  readonly consumido: TokenConsumido | undefined;
  readonly credencial: CredencialLocal | undefined;
}

class RepositorioFalso implements IdentityRepository {
  public readonly revogacoes: { familyId: string; motivo: MotivoDeRevogacao; agora: Instant }[] = [];
  public readonly rotacoes: NovoRefresh[] = [];

  /**
   * BICHUS-126: esta porta era `naoUsado('invalidarSessoes')`, e um dublê que
   * só grita quando é chamado não reprova quem DEIXA de chamar. Era por aqui
   * que a redefinição de senha podia parar de empurrar `sessions_invalid_before`
   * com os 375 casos verdes.
   */
  public readonly invalidacoesDeSessao: { userId: UserId; agora: Instant }[] = [];
  public readonly invalidacoesDeTokens: { userId: UserId; agora: Instant }[] = [];
  public readonly credenciaisRegravadas: { identityId: string; agora: Instant }[] = [];
  /** Quantas vezes o link foi GASTO. O critério 12 vive nesta contagem. */
  public readonly consumosDeToken: Instant[] = [];

  constructor(
    private readonly refresh: RefreshArmazenado | undefined,
    private readonly conta: Conta | undefined,
    private readonly redefinicao: RedefinicaoPendente | undefined = undefined,
  ) {}

  buscarRefreshPorHash(): Promise<RefreshArmazenado | undefined> {
    return Promise.resolve(this.refresh);
  }

  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number> {
    this.revogacoes.push({ familyId, motivo, agora });
    return Promise.resolve(2);
  }

  buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(this.conta);
  }

  rotacionar(_atual: string, sucessor: NovoRefresh): Promise<boolean> {
    this.rotacoes.push(sucessor);
    return Promise.resolve(true);
  }

  criarContaLocal(): Promise<Conta | undefined> {
    return naoUsado('criarContaLocal');
  }
  atualizarPerfil(): Promise<Conta | undefined> {
    return naoUsado('atualizarPerfil');
  }
  buscarContaPorEmail(): Promise<Conta | undefined> {
    return naoUsado('buscarContaPorEmail');
  }
  buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined> {
    if (this.redefinicao === undefined) return naoUsado('buscarCredencialLocalPorEmail');
    const dono = this.redefinicao.consumido?.enviadoPara;
    return Promise.resolve(email === dono ? this.redefinicao.credencial : undefined);
  }
  regravarCredencial(identityId: string, _phc: string, agora: Instant): Promise<void> {
    if (this.redefinicao === undefined) return naoUsado('regravarCredencial');
    this.credenciaisRegravadas.push({ identityId, agora });
    return Promise.resolve();
  }
  registrarLogin(): Promise<void> {
    return naoUsado('registrarLogin');
  }
  gravarRefresh(): Promise<void> {
    return naoUsado('gravarRefresh');
  }
  invalidarSessoes(userId: UserId, agora: Instant): Promise<void> {
    this.invalidacoesDeSessao.push({ userId, agora });
    return Promise.resolve();
  }
  criarTokenDeVerificacao(): Promise<void> {
    return naoUsado('criarTokenDeVerificacao');
  }
  consumirTokenDeVerificacao(
    _hash: TokenHash,
    _proposito: PropositoDoToken,
    agora: Instant,
  ): Promise<TokenConsumido | undefined> {
    if (this.redefinicao === undefined) return naoUsado('consumirTokenDeVerificacao');
    this.consumosDeToken.push(agora);
    return Promise.resolve(this.redefinicao.consumido);
  }
  conferirTokenDeVerificacao(): Promise<TokenConsumido | undefined> {
    if (this.redefinicao === undefined) return naoUsado('conferirTokenDeVerificacao');
    return Promise.resolve(this.redefinicao.pendente);
  }
  invalidarTokensPendentes(userId: UserId, agora: Instant): Promise<number> {
    if (this.redefinicao === undefined) return naoUsado('invalidarTokensPendentes');
    this.invalidacoesDeTokens.push({ userId, agora });
    return Promise.resolve(1);
  }
  marcarEmailVerificado(): Promise<void> {
    return naoUsado('marcarEmailVerificado');
  }
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: RepositorioFalso;
  readonly eventos: AuditEvent[];
  readonly avisos: AvisoAoTitular[];
  readonly mensagens: Mensagem[];
}

function montar(opcoes: {
  refresh?: RefreshArmazenado | undefined;
  conta?: Conta | undefined;
  verificacao?: ResultadoDaVerificacao | undefined;
  redefinicao?: RedefinicaoPendente | undefined;
}): Bancada {
  const repo = new RepositorioFalso(opcoes.refresh, opcoes.conta, opcoes.redefinicao);
  const eventos: AuditEvent[] = [];
  const avisos: AvisoAoTitular[] = [];
  const mensagens: Mensagem[] = [];

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const mailer: Mailer = {
    enviar(mensagem) {
      mensagens.push(mensagem);
      return Promise.resolve();
    },
  };
  const assinador: TokenSigner = {
    emitir: (sub, agora, jti) => ({
      token: `token-de-${sub}`,
      expiresInSeconds: 900,
      issuedAt: Math.floor(agora / 1000),
      jti,
    }),
    verificar: () => opcoes.verificacao ?? { ok: false, motivo: 'malformado' },
    jwks: () => [],
  };

  const servico = criarAuthService({
    repositorio: repo,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-novo',
      opaqueToken: () => 'refresh-novo' as OpaqueToken,
      random128: () => new Uint8Array(16),
    },
    clock: relogioParado(AGORA),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: (aviso) => {
      avisos.push(aviso);
      return Promise.resolve();
    },
    mailer,
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, repo, eventos, avisos, mensagens };
}

function refreshArmazenado(campos: Partial<RefreshArmazenado>): RefreshArmazenado {
  return {
    id: 'refresh-1',
    userId: VITIMA,
    familyId: FAMILIA,
    expiresAt: (AGORA + 30 * 86_400_000) as Instant,
    absoluteExpiresAt: (AGORA + 180 * 86_400_000) as Instant,
    staySignedIn: false,
    rotatedToId: null,
    revokedAt: null,
    ...campos,
  };
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

void describe('reuso de refresh token (BICHUS-15, critérios 4 e 10)', () => {
  /** Um token que já foi rotacionado uma vez e volta: é a assinatura do roubo. */
  const jaConsumido = () =>
    montar({
      refresh: refreshArmazenado({ rotatedToId: 'refresh-2' }),
      conta: contaAtiva(0 as Instant),
    });

  void it('revoga a família inteira, e não só o token apresentado', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    // Revogar só o token que voltou deixaria o ladrão com o sucessor que ele
    // acabou de receber — que é o token que ele está usando. A família é a
    // unidade porque é ela que o roubo contamina.
    assert.deepEqual(
      bancada.repo.revogacoes.map((r) => ({ familyId: r.familyId, motivo: r.motivo })),
      [{ familyId: FAMILIA, motivo: 'reuse_detected' }],
    );
    assert.equal(bancada.repo.rotacoes.length, 0, 'reuso não emite token novo');
  });

  void it('avisa o titular: detecção silenciosa não protege ninguém', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    // Sem este aviso, a vítima vê o aplicativo pedindo senha de novo e entende
    // "o app me deslogou". Ela faz login e segue a vida sem nunca saber que
    // alguém esteve dentro da conta — e sem trocar a senha, que é a única coisa
    // que derrubaria o acesso que não é dela.
    assert.deepEqual(bancada.avisos, [
      {
        tipo: 'refresh_reuse_detected',
        userId: VITIMA,
        ocorridoEm: AGORA,
        correlationId: CONTEXTO.correlationId,
      },
    ]);

    // Quem escreve a mensagem é a composição em `src/bin/api.ts`, e não este
    // serviço: o caso de uso não escolhe o canal. Esta linha marca a fronteira
    // — o que ainda não tem teste é a fiação do outro lado dela, e ela precisa
    // de teste de integração porque mora dentro de `main()`.
    assert.deepEqual(bancada.mensagens, [], 'o serviço avisa pela porta, não pelo mailer');
  });

  void it('deixa o reuso registrado na trilha, com a família como recurso', async () => {
    const bancada = jaConsumido();
    await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    const reuso = bancada.eventos.filter((e) => e.action === 'auth.refresh_reuse_detected');
    // Quem investiga um mês depois precisa achar QUAL família caiu e de quem
    // ela era. Um evento sem `resourceId` transforma a investigação num
    // cruzamento manual de horários.
    assert.equal(reuso.length, 1);
    assert.equal(reuso[0]?.resourceId, FAMILIA);
    assert.equal(reuso[0]?.actorUserId, VITIMA);
  });

  void it('responde com a MESMA 401 de sessão expirada, sem contar o que descobriu', async () => {
    const bancada = jaConsumido();
    const erro = await capturar(bancada.servico.renovar('refresh-roubado', CONTEXTO));

    // Quem apresentou o token roubado não pode aprender daqui que a detecção
    // existe: uma resposta própria para "reuso detectado" ensina o atacante a
    // parar antes de disparar a revogação.
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('token REVOGADO sem reuso não dispara revogação nova nem aviso', async () => {
    // O contrapeso, e ele é o que impede o caminho de virar "avisa sempre":
    // depois do logout, o aplicativo ainda tenta renovar uma vez com o token
    // que ele guardava. Avisar aqui mandaria um e-mail de invasão para quem
    // acabou de sair da própria conta.
    const bancada = montar({
      refresh: refreshArmazenado({ revokedAt: dataFixa(AGORA - 1000) }),
      conta: contaAtiva(0 as Instant),
    });

    const erro = await capturar(bancada.servico.renovar('refresh-de-sessao-encerrada', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.deepEqual(bancada.avisos, []);
    assert.deepEqual(bancada.repo.revogacoes, []);
  });
});

void describe('autenticar(): a barreira do SEC-006 (BICHUS-15, critério 8)', () => {
  const claims = (iatEmSegundos: number): ResultadoDaVerificacao => ({
    ok: true,
    claims: {
      sub: VITIMA,
      iss: 'https://api.bichu.test',
      aud: 'https://api.bichu.test',
      iat: iatEmSegundos,
      exp: iatEmSegundos + 900,
      jti: 'jti-1',
    },
  });

  void it('recusa com 401 o token cujo `iat` é anterior a sessions_invalid_before', async () => {
    // O cenário real: a pessoa trocou a senha porque desconfiou. O token de
    // acesso que o invasor tem na mão continua com assinatura boa e só vence
    // daqui a 15 minutos. Sem esta comparação, a troca de senha não expulsa
    // ninguém — ela só impede o próximo login.
    const revogadoEm = AGORA;
    const bancada = montar({
      conta: contaAtiva(revogadoEm),
      verificacao: claims(Math.floor((AGORA - 60_000) / 1000)),
    });

    const erro = await capturar(bancada.servico.autenticar('token-do-invasor'));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('aceita o token emitido DEPOIS da revogação', async () => {
    // O contrapeso: sem ele, uma barreira que recusasse tudo passaria no caso
    // acima e ninguém conseguiria usar o aplicativo depois de trocar a senha.
    const bancada = montar({
      conta: contaAtiva(AGORA),
      verificacao: claims(Math.floor((AGORA + 60_000) / 1000)),
    });

    const autenticado = await bancada.servico.autenticar('token-legitimo');
    assert.equal(autenticado.conta.id, VITIMA);
    assert.equal(autenticado.jti, 'jti-1');
  });

  void it('recusa com 401 o token de emissor fora da lista (critério 5)', async () => {
    // A recusa nasce no verificador; o que este caso trava é a TRADUÇÃO dela
    // para a borda. Um emissor estranho que virasse 500 diria ao aplicativo
    // "tente de novo" em vez de "entre de novo", e a pessoa ficaria num laço.
    const bancada = montar({
      conta: contaAtiva(0 as Instant),
      verificacao: { ok: false, motivo: 'emissor_nao_confiavel' },
    });

    const erro = await capturar(bancada.servico.autenticar('token-de-outro-emissor'));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'unauthenticated');
  });
});

void describe('confirmarRedefinicaoDeSenha(): o gatilho que sobrou do critério 7 (BICHUS-126)', () => {
  // O e-mail da conta e a senha nova não podem se parecer: a política recusa
  // senha derivada do endereço, e um caso que tropeçasse nisso provaria a
  // política em vez do que está sendo testado aqui.
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const LINK_DO_EMAIL = 'token-que-chegou-no-e-mail';
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';

  const DONO: TokenConsumido = { userId: VITIMA, enviadoPara: EMAIL_DA_CONTA };
  const CREDENCIAL: CredencialLocal = {
    identityId: 'identidade-local-1',
    userId: VITIMA,
    passwordPhc: '$pbkdf2-sha512$i=210000$c2FsLWFudGlnbw$aGFzaC1hbnRpZ28',
    mustChange: false,
  };

  /** O caminho feliz inteiro: link vale, senha serve, credencial existe. */
  const redefinicaoQueCompleta = () =>
    montar({
      conta: contaAtiva(0 as Instant),
      redefinicao: { pendente: DONO, consumido: DONO, credencial: CREDENCIAL },
    });

  void it('empurra sessions_invalid_before pela porta, com o dono e o instante da troca', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    // Este é o caso que BICHUS-126 pede, e ele afirma o EFEITO NA PORTA porque
    // a função não devolve nada: um teste que só olhasse "não lançou" passaria
    // com a chamada arrancada. Quem troca a senha faz isso com medo de que
    // tomaram a conta; sem esta linha o token de acesso de quem tomou continua
    // assinado e válido por até 15 minutos, e a troca de senha só impede o
    // PRÓXIMO login em vez de derrubar o que já está dentro.
    //
    // O `userId` tem que ser o do token consumido, e não o do formulário: é o
    // link do e-mail que diz de quem é a conta. O instante tem que ser o do
    // relógio da operação, porque `sessions_invalid_before` é comparado com o
    // `iat` do JWT — empurrar para um instante anterior à emissão do token do
    // invasor deixaria o token dele passar pela barreira.
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [{ userId: VITIMA, agora: AGORA }]);
  });

  void it('derruba junto os links de redefinição pendentes e regrava a credencial', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    // Critério 9, e ele é irmão do de cima: derrubar as sessões e deixar de pé
    // um link de redefinição emitido antes da troca é exatamente por onde quem
    // tomou a conta volta, um minuto depois, com uma senha escolhida por ele.
    assert.deepEqual(bancada.repo.invalidacoesDeTokens, [{ userId: VITIMA, agora: AGORA }]);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, [
      { identityId: CREDENCIAL.identityId, agora: AGORA },
    ]);
  });

  void it('deixa a troca na trilha, com a conta como ator e como recurso', async () => {
    const bancada = redefinicaoQueCompleta();
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);

    // Quem atende a tutora que liga dizendo "não fui eu" precisa achar a hora
    // da troca e de qual IP ela saiu. Sem `resourceId`, a investigação vira
    // cruzamento manual de horários.
    const trocas = bancada.eventos.filter((e) => e.action === 'auth.password_reset_completed');
    assert.equal(trocas.length, 1);
    assert.equal(trocas[0]?.actorUserId, VITIMA);
    assert.equal(trocas[0]?.resourceId, VITIMA);
    assert.equal(trocas[0]?.correlationId, CONTEXTO.correlationId);
  });

  void it('senha fraca: não gasta o link, não troca nada e não mexe nas sessões', async () => {
    // Primeiro contrapeso, e é o critério 12. Sem ele, "invalide sempre, logo
    // na entrada" passaria nos casos acima. A consequência de gastar o token
    // aqui é concreta: a pessoa digitou uma senha curta e perderia o único link
    // que tem, tendo que pedir outro e-mail para tentar de novo.
    const bancada = redefinicaoQueCompleta();
    const erro = await capturar(
      bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, 'curta', CONTEXTO),
    );

    assert.equal(erro.problemType, 'weak-password');
    assert.deepEqual(bancada.repo.consumosDeToken, [], 'senha recusada NÃO gasta o link');
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, []);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, []);
  });

  void it('link já gasto entre a conferência e a transação: nada de sessão é tocado', async () => {
    // Segundo contrapeso, e é o caso REAL da corrida: o cliente de e-mail
    // pré-carrega o link e a pessoa clica em seguida. A conferência acha o
    // token, a transação não acha mais. Derrubar as sessões de alguém a partir
    // de um link que não foi consumido por esta requisição é dar a qualquer
    // link velho o poder de deslogar a conta.
    const bancada = montar({
      conta: contaAtiva(0 as Instant),
      redefinicao: { pendente: DONO, consumido: undefined, credencial: CREDENCIAL },
    });

    const erro = await capturar(
      bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO),
    );

    assert.equal(erro.problemType, 'verification-token-expired');
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, []);
    assert.deepEqual(bancada.repo.credenciaisRegravadas, []);
    assert.deepEqual(bancada.eventos, [], 'nada aconteceu, nada é registrado');
  });
});
