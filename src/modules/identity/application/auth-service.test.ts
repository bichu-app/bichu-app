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
import type { Clock } from '../../../shared/time/clock.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import { gerarHashDeSenha } from '../domain/password.js';
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
  public readonly invalidacoesDeSessao: { userId: UserId; barreira: Instant; agora: Instant }[] =
    [];
  /** BICHUS-125: a outra metade da revogação em massa. */
  public readonly revogacoesEmMassa: {
    userId: UserId;
    motivo: MotivoDeRevogacao;
    agora: Instant;
  }[] = [];
  /** Quantas linhas de refresh a conta tem vivas, para a contagem da trilha. */
  public familiasVivas = 2;
  public readonly invalidacoesDeTokens: { userId: UserId; agora: Instant }[] = [];
  public readonly credenciaisRegravadas: { identityId: string; agora: Instant }[] = [];
  /** Quantas vezes o link foi GASTO. O critério 12 vive nesta contagem. */
  public readonly consumosDeToken: Instant[] = [];
  public readonly familiasAbertas: NovoRefresh[] = [];
  public readonly loginsRegistrados: { identityId: string; agora: Instant }[] = [];

  /**
   * A conta é MUTÁVEL de propósito (BICHUS-132): entre duas chamadas do mesmo
   * caso de teste, a vítima redefine a senha e `sessions_invalid_before` anda.
   * Um campo imutável obrigaria a montar duas bancadas, e aí o token do invasor
   * e o token da vítima não estariam mais na mesma linha do tempo — que é
   * exatamente o que o caso precisa provar.
   */
  public conta: Conta | undefined;

  constructor(
    private readonly refresh: RefreshArmazenado | undefined,
    conta: Conta | undefined,
    private readonly redefinicao: RedefinicaoPendente | undefined = undefined,
    private readonly login: CredencialLocal | undefined = undefined,
  ) {
    this.conta = conta;
  }

  /**
   * Devolve o que a bancada montou, ou — quando o caso subiu a pilha de verdade
   * e abriu a família por `entrar()` — a linha que foi REALMENTE gravada.
   *
   * Sem essa volta, um caso de ponta a ponta leria uma linha de fixture em vez
   * da que o produto acabou de escrever, e o `issuedAt` comparado com a barreira
   * seria o do teste e não o do código.
   */
  buscarRefreshPorHash(): Promise<RefreshArmazenado | undefined> {
    const gravado = this.familiasAbertas.at(-1);
    if (gravado === undefined) return Promise.resolve(this.refresh);
    return Promise.resolve({
      id: gravado.id,
      userId: gravado.userId,
      familyId: gravado.familyId,
      issuedAt: gravado.issuedAt,
      expiresAt: gravado.expiresAt,
      absoluteExpiresAt: gravado.absoluteExpiresAt,
      staySignedIn: gravado.staySignedIn,
      rotatedToId: null,
      revokedAt: null,
    });
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
    if (this.redefinicao !== undefined) {
      const dono = this.redefinicao.consumido?.enviadoPara;
      return Promise.resolve(email === dono ? this.redefinicao.credencial : undefined);
    }
    if (this.login === undefined) return naoUsado('buscarCredencialLocalPorEmail');
    return Promise.resolve(this.login);
  }
  regravarCredencial(identityId: string, _phc: string, agora: Instant): Promise<void> {
    if (this.redefinicao === undefined) return naoUsado('regravarCredencial');
    this.credenciaisRegravadas.push({ identityId, agora });
    return Promise.resolve();
  }
  registrarLogin(identityId: string, agora: Instant): Promise<void> {
    if (this.login === undefined) return naoUsado('registrarLogin');
    this.loginsRegistrados.push({ identityId, agora });
    return Promise.resolve();
  }
  gravarRefresh(novo: NovoRefresh): Promise<void> {
    if (this.login === undefined) return naoUsado('gravarRefresh');
    this.familiasAbertas.push(novo);
    return Promise.resolve();
  }
  /**
   * O dublê MOVE a conta, porque o banco move — e com o mesmo piso.
   *
   * Um dublê que só anotasse a chamada deixaria passar a correção que grava a
   * barreira errada: a segunda revogação de um caso encontraria a conta ainda
   * com a marca antiga e o cálculo daria certo por acidente. `greatest` é o do
   * `UPDATE` real, e está aqui pela mesma razão.
   */
  invalidarSessoes(userId: UserId, barreira: Instant, agora: Instant): Promise<void> {
    this.invalidacoesDeSessao.push({ userId, barreira, agora });
    if (this.conta !== undefined) {
      this.conta = {
        ...this.conta,
        sessionsInvalidBefore: Math.max(barreira, this.conta.sessionsInvalidBefore) as Instant,
      };
    }
    return Promise.resolve();
  }
  /**
   * BICHUS-125: mesma razão do `invalidarSessoes` logo acima. Esta porta
   * REGISTRA em vez de gritar, porque o defeito que ela existe para pegar é
   * alguém **deixar** de revogar as famílias, e um dublê que só falha quando é
   * chamado fica verde exatamente nesse caso.
   */
  revogarTodasAsFamilias(
    userId: UserId,
    motivo: MotivoDeRevogacao,
    agora: Instant,
  ): Promise<number> {
    this.revogacoesEmMassa.push({ userId, motivo, agora });
    return Promise.resolve(this.familiasVivas);
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
  login?: CredencialLocal | undefined;
  agora?: Instant | undefined;
  /**
   * Relógio próprio, para o caso em que o tempo precisa ANDAR dentro de um
   * mesmo caso — duas revogações e um login entre elas não cabem num instante
   * só, e é justamente a distância entre eles que está sendo provada.
   */
  relogio?: Clock | undefined;
}): Bancada {
  const repo = new RepositorioFalso(
    opcoes.refresh,
    opcoes.conta,
    opcoes.redefinicao,
    opcoes.login,
  );
  const agoraDaBancada = opcoes.agora ?? AGORA;
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
  /**
   * O dublê do assinador guarda o `iat` de cada token que emitiu e devolve o
   * MESMO valor na verificação.
   *
   * Sem essa volta, `emitir` e `verificar` seriam dois dublês independentes e o
   * caso de BICHUS-132 não teria como provar nada: o que o defeito faz é a
   * emissão e a barreira discordarem sobre o mesmo token. O `Math.floor` é o do
   * emissor real (`rs256-token-signer.ts`) — um dublê que arredondasse de outro
   * jeito provaria a aritmética do dublê, e não a do produto.
   */
  const iatPorToken = new Map<string, number>();
  const assinador: TokenSigner = {
    emitir: (sub, agora, jti) => {
      const iat = Math.floor(agora / 1000);
      const token = `token-de-${sub}#${String(iatPorToken.size + 1)}`;
      iatPorToken.set(token, iat);
      return { token, expiresInSeconds: 900, issuedAt: iat, jti };
    },
    verificar: (token) => {
      if (opcoes.verificacao !== undefined) return opcoes.verificacao;
      const iat = iatPorToken.get(token);
      if (iat === undefined) return { ok: false, motivo: 'malformado' };
      return {
        ok: true,
        claims: {
          sub: VITIMA,
          iss: 'https://api.bichu.test',
          aud: 'https://api.bichu.test',
          iat,
          exp: iat + 900,
          jti: 'jti-1',
        },
      };
    },
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
      random80: () => new Uint8Array(10),
    },
    clock: opcoes.relogio ?? relogioParado(agoraDaBancada),
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
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log. Os que afirmam estão em
      // `cadastro-envia-verificacao.test.ts` (BICHUS-147).
    },
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, repo, eventos, avisos, mensagens };
}

function refreshArmazenado(campos: Partial<RefreshArmazenado>): RefreshArmazenado {
  return {
    id: 'refresh-1',
    userId: VITIMA,
    familyId: FAMILIA,
    issuedAt: AGORA,
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
    //
    // A `barreira` é o que vai para a coluna e o `agora` é o relógio da
    // operação. Sem revogação recente na conta os dois coincidem, e é assim que
    // tem de ser: `instanteDeRevogacao` só empurra quando a revogação cai dentro
    // do segundo que outra já cobriu.
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: AGORA, agora: AGORA },
    ]);
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

/**
 * Entrar no MESMO SEGUNDO em que a senha foi redefinida (BICHUS-132).
 *
 * Quem sofre o defeito é exatamente a pessoa que está recuperando uma conta
 * tomada. Ela acabou de escolher a senha nova, entra, e a primeira tela responde
 * "sua sessão terminou". Tenta de novo e funciona — mas já levou o susto no pior
 * momento possível, e algumas concluem que a conta continua nas mãos de outra
 * pessoa e desistem ali.
 *
 * Os casos sobem a pilha de verdade: `entrar()` emite, `autenticar()` verifica, e
 * a barreira do SEC-006 no meio é a de produção. O único dublê da rodada é o
 * assinador, e ele devolve na verificação o MESMO `iat` que gravou na emissão —
 * porque o defeito é justamente emissão e barreira discordarem sobre um token.
 *
 * O primeiro caso é a ISCA: reprova com o código antigo instalado. Os outros são
 * o CONTRAPESO, e existem porque uma "correção" que afrouxasse a comparação
 * passaria na isca e devolveria ao invasor a janela de um segundo que o
 * arredondamento de `tokenFoiRevogado` existe para tirar.
 */
void describe('entrar no mesmo segundo da redefinição de senha (BICHUS-132)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  // A política recusa senha derivada do endereço; uma senha que tropeçasse nisso
  // provaria a política em vez do que está sendo testado aqui.
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  /** O relógio do login: 734 ms depois da virada do segundo. */
  const LOGIN_EM = (INSTANTE_FIXO + 734) as Instant;
  /** A redefinição caiu 234 ms antes — o MESMO segundo de relógio. */
  const REDEFINIDA_EM = (INSTANTE_FIXO + 500) as Instant;
  /** A marca que a conta tinha antes de a vítima trocar a senha. */
  const ANTES_DA_TROCA = (INSTANTE_FIXO - 60_000) as Instant;

  // Derivar PBKDF2 são 210.000 iterações. Uma vez para o arquivo inteiro: o
  // custo é do algoritmo e não tem nada a ver com o que está sendo provado.
  let phcGuardado: string | undefined;
  async function phcDaSenhaNova(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA_NOVA);
    return phcGuardado;
  }

  async function bancadaDeLogin(sessionsInvalidBefore: Instant): Promise<Bancada> {
    return montar({
      conta: contaAtiva(sessionsInvalidBefore),
      agora: LOGIN_EM,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenhaNova(),
        mustChange: false,
      },
    });
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar(
      { email: EMAIL_DA_CONTA, password: SENHA_NOVA, staySignedIn: false },
      CONTEXTO,
    );

  void it('A ISCA: a primeira tela depois de redefinir a senha FUNCIONA', async () => {
    // O cenário inteiro, do jeito que a pessoa vive: a redefinição gravou
    // `sessions_invalid_before` com precisão de milissegundo, ela entra no mesmo
    // segundo, e o `iat` do token tem precisão de segundo. Sem a correção, o
    // token nasce do lado revogado e esta chamada responde 401 `token-expired`
    // — na PRIMEIRA requisição autenticada de quem acabou de retomar a conta.
    const bancada = await bancadaDeLogin(REDEFINIDA_EM);
    const sessao = await entrar(bancada);

    const autenticado = await bancada.servico.autenticar(sessao.access_token);
    assert.equal(autenticado.conta.id, VITIMA);
  });

  void it('O CONTRAPESO: o token do invasor, anterior à troca, continua recusado', async () => {
    // A sessão que já estava aberta quando a vítima trocou a senha. Sem este
    // caso, uma correção que simplesmente deixasse o empate passar em
    // `tokenFoiRevogado` ficaria verde na isca — e a troca de senha deixaria de
    // expulsar quem está dentro da conta, que é a única coisa que o produto pede
    // que a vítima faça.
    const bancada = await bancadaDeLogin(ANTES_DA_TROCA);
    const doInvasor = await entrar(bancada);

    // A vítima redefine a senha, 500 ms depois da virada.
    bancada.repo.conta = contaAtiva(REDEFINIDA_EM);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');
  });

  void it('os dois no MESMO segundo: o do invasor cai, o da vítima passa', async () => {
    // O par junto, na mesma linha do tempo e dentro do mesmo segundo de relógio
    // — que é o que separa a correção certa da que só afrouxa a comparação. Os
    // dois tokens têm `iat` diferente porque só a EMISSÃO se moveu; a barreira
    // continua exatamente onde estava.
    const bancada = await bancadaDeLogin(ANTES_DA_TROCA);
    const doInvasor = await entrar(bancada);

    bancada.repo.conta = contaAtiva(REDEFINIDA_EM);
    const daVitima = await entrar(bancada);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(erro.problemType, 'token-expired', 'quem estava dentro é expulso');

    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'quem acabou de retomar a conta entra');
  });

  void it('só o `iat` do token de acesso se move: refresh e trilha ficam em `agora`', async () => {
    // O terceiro contrapeso. Empurrar `agora` inteiro para o segundo seguinte
    // também faria a isca passar — e de quebra daria um segundo a mais de
    // validade à família de refresh e deslocaria a trilha, que é por onde alguém
    // reconstrói o que aconteceu quando a tutora liga dizendo "não fui eu".
    const bancada = await bancadaDeLogin(REDEFINIDA_EM);
    await entrar(bancada);

    assert.deepEqual(bancada.repo.loginsRegistrados, [{ identityId: IDENTIDADE, agora: LOGIN_EM }]);
    assert.equal(bancada.repo.familiasAbertas.length, 1);
    assert.equal(
      bancada.repo.familiasAbertas[0]?.expiresAt,
      LOGIN_EM + 30 * 86_400_000,
      'o prazo do refresh conta a partir do relógio da requisição, e não do empurrão',
    );
  });
});

/**
 * Duas revogações no MESMO SEGUNDO (SEC-006).
 *
 * O defeito, que a suíte de integração só acusava em máquina rápida o bastante
 * para duas rodadas caírem no mesmo segundo de relógio: a correção de
 * BICHUS-132 faz o token de acesso nascer com `iat` já arredondado para a virada
 * do segundo, e um token assim é **imune a qualquer revogação anterior àquela
 * virada**. A segunda revogação não move o teto além dele, e o token emitido
 * entre as duas sobrevive por até quinze minutos.
 *
 * Aqui o relógio é conduzido, e não torcido: os três instantes são constantes do
 * arquivo e cabem dentro do mesmo segundo por construção. Um caso que só
 * reprovasse em máquina rápida seria o defeito de hoje com outro nome.
 *
 * O cenário tem gente dentro. A tutora desconfia, aperta "não fui eu" (revogação
 * 1); quem tomou a conta ainda tem a senha e entra de novo no mesmo segundo; ela
 * então troca a senha (revogação 2), que é o gesto que o produto oferece para
 * expulsá-lo. Sem esta correção, ele fica.
 */
void describe('duas revogações no mesmo segundo (SEC-006)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  /** `INSTANTE_FIXO` é virada de segundo exata; os três cabem no mesmo segundo. */
  const PRIMEIRA_REVOGACAO = (INSTANTE_FIXO + 200) as Instant;
  const LOGIN_DO_INVASOR = (INSTANTE_FIXO + 400) as Instant;
  const SEGUNDA_REVOGACAO = (INSTANTE_FIXO + 600) as Instant;
  /** A marca que a conta tinha antes de tudo isso: nada de revogação recente. */
  const ANTES = (INSTANTE_FIXO - 60_000) as Instant;

  let phcGuardado: string | undefined;
  async function phcDaSenha(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA);
    return phcGuardado;
  }

  /** Bancada com relógio conduzido: `relogio.agora` é escrito pelo caso. */
  async function bancadaComRelogio(): Promise<{ bancada: Bancada; mover: (q: Instant) => void }> {
    let agora: Instant = ANTES;
    const bancada = montar({
      conta: contaAtiva(ANTES),
      relogio: { now: () => agora } satisfies Clock,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenha(),
        mustChange: false,
      },
    });
    return {
      bancada,
      mover: (quando: Instant) => {
        agora = quando;
      },
    };
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar({ email: EMAIL_DA_CONTA, password: SENHA, staySignedIn: false }, CONTEXTO);

  void it('A ISCA: o token emitido ENTRE as duas revogações não sobrevive à segunda', async () => {
    const { bancada, mover } = await bancadaComRelogio();

    // 1. "Não fui eu": a primeira revogação.
    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    // 2. Quem tomou a conta ainda tem a senha e entra de novo, 200 ms depois —
    //    dentro do mesmo segundo. O `iat` deste token sai empurrado para a
    //    virada por `instanteDeEmissaoDoAcesso`, e é ele que sobrevivia.
    mover(LOGIN_DO_INVASOR);
    const doInvasor = await entrar(bancada);
    const aindaVale = await bancada.servico.autenticar(doInvasor.access_token);
    assert.equal(aindaVale.conta.id, VITIMA, 'o token precisa ter VALIDO, senão não há o que revogar');

    // 3. A tutora troca a senha, 200 ms depois — ainda o mesmo segundo.
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const erro = await capturar(bancada.servico.autenticar(doInvasor.access_token));
    assert.equal(
      erro.problemType,
      'token-expired',
      'a segunda revogação não alcançou o token emitido depois da primeira: quem tomou a ' +
        'conta continua dentro por até quinze minutos, e a troca de senha prometeu expulsá-lo',
    );
    assert.equal(erro.status, 401);
  });

  void it('O CONTRAPESO: quem revoga continua conseguindo entrar em seguida', async () => {
    // A outra ponta, e sem ela a isca passaria com uma barreira que recusa
    // tudo: a tutora acabou de trocar a senha e a PRIMEIRA tela dela não pode
    // responder 401. É BICHUS-132, agora depois de duas revogações seguidas.
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const daVitima = await entrar(bancada);
    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'a primeira tela depois da troca não pode dar 401');
  });

  void it('sem revogação recente, a barreira gravada é `agora` ao milissegundo', async () => {
    // O contrapeso que protege o que NÃO é desta correção. `agora + 1` por
    // padrão mudaria a barreira de toda revogação do produto, e com ela o
    // empate do lado do refresh (`refreshFoiRevogado`, BICHUS-77), em que o
    // refresh nascido no mesmo milissegundo da barreira sobrevive de propósito.
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: PRIMEIRA_REVOGACAO, agora: PRIMEIRA_REVOGACAO },
    ]);
  });

  void it('o empurrão da segunda revogação é de no máximo um segundo', async () => {
    // O teto do custo, escrito. A barreira anda para a frente do relógio para
    // alcançar o `iat` empurrado, e nunca mais do que a virada seguinte — o
    // mesmo teto de `instanteDeEmissaoDoAcesso`, e bem abaixo dos 60 s de
    // tolerância de relógio de que os dois dependem.
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const segunda = bancada.repo.invalidacoesDeSessao[1];
    assert.ok(segunda !== undefined);
    assert.equal(segunda.agora, SEGUNDA_REVOGACAO, '`updated_at` continua no relógio da requisição');
    assert.ok(
      segunda.barreira > SEGUNDA_REVOGACAO,
      'a barreira precisa passar do `iat` que a emissão empurrou',
    );
    assert.ok(
      segunda.barreira - SEGUNDA_REVOGACAO <= 1000,
      'e não pode passar da virada seguinte: mais que isso é tempo de ninguém entrar',
    );
  });

  void it('a recusa é indistinguível de um token inválido qualquer', async () => {
    // Nada aqui pode virar oráculo. Um corpo próprio para "caiu na segunda
    // revogação" contaria a um estranho que aquela conta acabou de trocar a
    // senha — que é exatamente o que ele quer saber.
    const { bancada, mover } = await bancadaComRelogio();

    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);
    mover(LOGIN_DO_INVASOR);
    const doInvasor = await entrar(bancada);
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);

    const pelaSegundaRevogacao = await capturar(bancada.servico.autenticar(doInvasor.access_token));

    // O token de uma sessão simplesmente vencida, sem revogação nenhuma no meio.
    const outra = montar({ conta: contaAtiva(0 as Instant), verificacao: { ok: false, motivo: 'expirado' } });
    const qualquerUm = await capturar(outra.servico.autenticar('token-vencido'));

    assert.equal(pelaSegundaRevogacao.status, qualquerUm.status);
    assert.equal(pelaSegundaRevogacao.problemType, qualquerUm.problemType);
    assert.equal(pelaSegundaRevogacao.message, qualquerUm.message);
  });
});

/**
 * O refresh anterior à troca de senha (BICHUS-77 critério 5, BICHUS-125).
 *
 * O furo que estes casos fecham: a redefinição empurrava
 * `users.sessions_invalid_before`, `autenticar()` lia a coluna, e `renovar()`
 * **nunca a consultava**. Quem tivesse copiado o refresh antes da troca chamava
 * `POST /v1/auth/refresh`, recebia um token de acesso novo com `iat = agora`, e
 * esse token passava pela barreira sem esforço. A pessoa descobria que a conta
 * tinha sido invadida, trocava a senha — que é o único gesto que o produto
 * oferece para expulsar o invasor — e o invasor continuava dentro,
 * indefinidamente.
 *
 * O que estes casos afirmam é o EFEITO, e não o 401: a resposta da recusa é a
 * mesma de um refresh vencido, de propósito. Um caso que só olhasse o status
 * passaria com a comparação arrancada, porque `renovar()` já responde 401 por
 * meia dúzia de outros motivos.
 *
 * O caso que só confere "a coluna foi empurrada" — o que a suíte tinha — fica
 * verde com o furo inteiro de pé. É por isso que a prova aqui é a renovação
 * sendo RECUSADA, e não a chamada à porta sendo registrada.
 */
void describe('renovar() respeita sessions_invalid_before (BICHUS-77 critério 5)', () => {
  /** A troca de senha caiu 1 s depois de o refresh do invasor nascer. */
  const TROCA_EM = (AGORA + 1_000) as Instant;

  void it('A ISCA: recusa o refresh emitido ANTES da troca de senha', async () => {
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });

    const erro = await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.equal(erro.problemType, 'token-expired');

    // O que de fato importa: nenhum token novo saiu. Recusar depois de rotacionar
    // deixaria o sucessor gravado com `issued_at` posterior à barreira, e o
    // refresh recusado hoje passaria amanhã.
    assert.deepEqual(bancada.repo.rotacoes, [], 'a recusa vem ANTES da rotação');
  });

  void it('O CONTRAPESO: o refresh emitido DEPOIS da troca continua valendo', async () => {
    // Sem este caso, uma barreira que recusasse tudo passaria na isca — e
    // ninguém conseguiria continuar conectado depois de trocar a senha, que é o
    // oposto do que a história pede. O portão precisa ser portão, e não bloqueio.
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: (TROCA_EM + 1) as Instant }),
      conta: contaAtiva(TROCA_EM),
    });

    const sessao = await bancada.servico.renovar('refresh-legitimo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'rotacionou normalmente');
    assert.ok(sessao.access_token.length > 0);
  });

  void it('o empate sobrevive: refresh nascido no MESMO instante da barreira renova', async () => {
    // O terceiro caso existe para travar a correção errada, que é copiar o
    // `Math.ceil` de `tokenFoiRevogado`. Lá o arredondamento compensa o `iat` do
    // JWT, truncado ao segundo; aqui os dois lados são milissegundo gravado pelo
    // mesmo relógio, e não há nada a compensar. Arredondar recusaria o refresh de
    // quem acabou de retomar a conta — BICHUS-132 renascido na outra ponta.
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: TROCA_EM }),
      conta: contaAtiva(TROCA_EM),
    });

    await bancada.servico.renovar('refresh-do-mesmo-instante', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1);
  });

  void it('a recusa é indistinguível da de um refresh simplesmente vencido', async () => {
    // Critério de não-oráculo. Se a barreira tivesse status, `type` ou detalhe
    // próprio, qualquer pessoa de posse de um refresh velho descobriria que
    // aquela conta trocou a senha há pouco — que é justamente o sinal de que ali
    // houve incidente, e o convite para tentar de novo por outro caminho.
    const porBarreira = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });
    const porVencimento = montar({
      refresh: refreshArmazenado({ expiresAt: (AGORA - 1) as Instant }),
      conta: contaAtiva(0 as Instant),
    });

    const a = await capturar(porBarreira.servico.renovar('refresh-copiado', CONTEXTO));
    const b = await capturar(porVencimento.servico.renovar('refresh-vencido', CONTEXTO));

    assert.equal(a.status, b.status);
    assert.equal(a.problemType, b.problemType);
    assert.equal(a.message, b.message);
    assert.deepEqual(a.errors, b.errors);
  });

  void it('a tentativa negada entra na trilha, com a família como recurso', async () => {
    // Do lado de dentro a recusa precisa ser legível: quem atende a tutora que
    // liga dizendo "não fui eu" tem que ver que alguém continuou tentando renovar
    // DEPOIS da troca. Isto é trilha, não resposta — nada disso sai pela borda.
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: AGORA }),
      conta: contaAtiva(TROCA_EM),
    });
    await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));

    const negadas = bancada.eventos.filter(
      (e) => e.action === 'auth.refresh_rejected_revoked_session',
    );
    assert.equal(negadas.length, 1);
    assert.equal(negadas[0]?.resourceId, FAMILIA);
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'auth.session_refreshed').length,
      0,
      'renovação negada não é renovação',
    );
  });
});

/**
 * A ponta que faltava do critério 7 de BICHUS-126: a prova de que **empurrar
 * `sessions_invalid_before` tem efeito**.
 *
 * O que existia era um caso afirmando que a redefinição CHAMA `invalidarSessoes`.
 * Ele ficava verde com o furo inteiro de pé, porque ninguém verificava o outro
 * lado: a coluna era empurrada e `renovar()` não a lia. Aqui a bancada sobe a
 * pilha — `entrar()` grava a família, a redefinição move a conta de verdade, e o
 * MESMO refresh é apresentado de novo.
 */
void describe('a troca de senha derruba a renovação, de ponta a ponta (BICHUS-126 critério 7)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA_NOVA = 'chuva-de-marco-no-quintal';
  const LINK_DO_EMAIL = 'token-que-chegou-no-e-mail';
  const DONO: TokenConsumido = { userId: VITIMA, enviadoPara: EMAIL_DA_CONTA };

  let phcGuardado: string | undefined;
  async function credencial(): Promise<CredencialLocal> {
    phcGuardado ??= await gerarHashDeSenha(SENHA_NOVA);
    return {
      identityId: 'identidade-local-1',
      userId: VITIMA,
      passwordPhc: phcGuardado,
      mustChange: false,
    };
  }

  /**
   * O relógio ANDA aqui, e a razão é o cenário: o login, a renovação e a
   * redefinição acontecem em instantes diferentes, como na vida. Com o relógio
   * parado os três cairiam no mesmo milissegundo, o empate mandaria, e o caso
   * não provaria nada — que é o tipo de teste que fica verde sem olhar.
   */
  function relogioQueAnda(inicio: Instant): { clock: Clock; avancar: (ms: number) => void } {
    let agora = inicio;
    return { clock: { now: () => agora }, avancar: (ms) => { agora = (agora + ms) as Instant; } };
  }

  async function bancadaCompleta(relogio: Clock): Promise<Bancada> {
    const cred = await credencial();
    return montar({
      conta: contaAtiva(0 as Instant),
      login: cred,
      redefinicao: { pendente: DONO, consumido: DONO, credencial: cred },
      relogio,
    });
  }

  void it('o refresh que funcionava antes da troca deixa de funcionar depois dela', async () => {
    const tempo = relogioQueAnda(AGORA);
    const bancada = await bancadaCompleta(tempo.clock);

    // 1. A sessão existe e renova. Sem esta metade, um caso que só exigisse a
    //    recusa passaria com `renovar()` quebrada para todo mundo.
    await bancada.servico.entrar(
      { email: EMAIL_DA_CONTA, password: SENHA_NOVA, staySignedIn: false },
      CONTEXTO,
    );
    await bancada.servico.renovar('refresh-novo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'antes da troca, renova');

    // 2. Meio segundo depois, a vítima redefine a senha. O dublê move a conta,
    //    como o banco move.
    tempo.avancar(500);
    const TROCA = (AGORA + 500) as Instant;
    await bancada.servico.confirmarRedefinicaoDeSenha(LINK_DO_EMAIL, SENHA_NOVA, CONTEXTO);
    // `barreira` entrou com a SEC-006. Aqui ela e igual a `agora` porque a
    // conta nao tinha revogacao recente, e e exatamente isso que o contrapeso
    // do SEC-006 promete: fora do aperto de duas revogacoes no mesmo segundo,
    // a barreira gravada continua sendo o relogio ao milissegundo.
    assert.deepEqual(bancada.repo.invalidacoesDeSessao, [
      { userId: VITIMA, barreira: TROCA, agora: TROCA },
    ]);

    // 3. O MESMO refresh, agora. É este passo que o critério 7 nunca teve: a
    //    coluna empurrada só vale alguma coisa se alguém a ler do outro lado.
    const erro = await capturar(bancada.servico.renovar('refresh-novo', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.equal(bancada.repo.rotacoes.length, 1, 'depois da troca, não renova mais');
  });
});

/**
 * O refresh que nasce JÁ revogado, no encontro de BICHUS-207 com BICHUS-77.
 *
 * Os dois consertos estão certos, e é o encontro deles que abre o buraco:
 *
 * - BICHUS-207 (`instanteDeRevogacao`) faz a SEGUNDA revogação dentro do mesmo
 *   segundo gravar `sessions_invalid_before` **até 1 s à frente do relógio**,
 *   para alcançar o `iat` que a emissão empurrou.
 * - BICHUS-77 (`refreshFoiRevogado`) faz `renovar()` recusar todo refresh com
 *   `issued_at < sessions_invalid_before`.
 *
 * Juntos, o login que cai nesse ≤1 s de barreira adiantada grava um refresh com
 * `issued_at = agora`, abaixo da barreira, e a pessoa é derrubada na PRIMEIRA
 * renovação — sem ter feito nada, logo depois de entrar. O `Math.max` de
 * `abrirSessao` é o que fecha isso, e é o que estes casos protegem.
 *
 * **Fecha em vez de abrir: é regressão de disponibilidade, não de segurança.**
 * Quem cai é quem acabou de retomar a conta, que é a pessoa de menor paciência
 * do produto neste exato momento.
 *
 * O que estes casos afirmam é o EFEITO — a renovação acontecendo, com a rotação
 * gravada — e não a chamada. Um caso que só conferisse `issued_at` do lado do
 * repositório provaria a aritmética do teste; um que só olhasse o status ficaria
 * verde porque `renovar()` responde 401 por meia dúzia de outros motivos.
 *
 * O relógio é CONDUZIDO, como em BICHUS-207: os quatro instantes são constantes
 * do arquivo e caem no mesmo segundo **por construção**, nunca por velocidade de
 * máquina. Uma isca que dependesse de corrida seria o defeito de hoje com outro
 * nome.
 */
void describe('o refresh emitido logo depois de uma revogação dupla renova (BICHUS-207 + BICHUS-77)', () => {
  const EMAIL_DA_CONTA = 'tutora@exemplo.test';
  const SENHA = 'chuva-de-marco-no-quintal';
  const IDENTIDADE = 'identidade-local-1';

  /** `INSTANTE_FIXO` é virada de segundo exata; os quatro cabem no mesmo segundo. */
  const PRIMEIRA_REVOGACAO = (INSTANTE_FIXO + 200) as Instant;
  const SEGUNDA_REVOGACAO = (INSTANTE_FIXO + 400) as Instant;
  const LOGIN = (INSTANTE_FIXO + 600) as Instant;
  const PRIMEIRA_RENOVACAO = (INSTANTE_FIXO + 800) as Instant;
  /** A marca que a conta tinha antes de tudo isso: nada de revogação recente. */
  const ANTES = (INSTANTE_FIXO - 60_000) as Instant;

  /**
   * A barreira que a revogação dupla deixa gravada: `ceil((FIXO+200)/1000)*1000+1`.
   * São 601 ms À FRENTE do relógio da segunda revogação, e é essa dianteira que
   * o login seguinte tem de alcançar para não nascer condenado.
   */
  const BARREIRA_ADIANTADA = (INSTANTE_FIXO + 1_001) as Instant;

  let phcGuardado: string | undefined;
  async function phcDaSenha(): Promise<string> {
    phcGuardado ??= await gerarHashDeSenha(SENHA);
    return phcGuardado;
  }

  async function bancadaComRelogio(
    barreiraInicial: Instant,
  ): Promise<{ bancada: Bancada; mover: (q: Instant) => void }> {
    let agora: Instant = ANTES;
    const bancada = montar({
      conta: contaAtiva(barreiraInicial),
      relogio: { now: () => agora } satisfies Clock,
      login: {
        identityId: IDENTIDADE,
        userId: VITIMA,
        passwordPhc: await phcDaSenha(),
        mustChange: false,
      },
    });
    return { bancada, mover: (quando: Instant) => { agora = quando; } };
  }

  const entrar = (bancada: Bancada): Promise<{ access_token: string }> =>
    bancada.servico.entrar({ email: EMAIL_DA_CONTA, password: SENHA, staySignedIn: false }, CONTEXTO);

  void it('A ISCA: entra no ≤1 s seguinte a uma revogação dupla e a PRIMEIRA renovação funciona', async () => {
    const { bancada, mover } = await bancadaComRelogio(ANTES);

    // 1. "Não fui eu": a primeira revogação.
    mover(PRIMEIRA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'logout_all', CONTEXTO);

    // 2. A troca de senha, 200 ms depois — o MESMO segundo. É esta que empurra a
    //    barreira para a frente do relógio (BICHUS-207).
    mover(SEGUNDA_REVOGACAO);
    await bancada.servico.invalidarTodasAsSessoes(VITIMA, 'password_changed', CONTEXTO);
    assert.equal(
      bancada.repo.invalidacoesDeSessao.at(-1)?.barreira,
      BARREIRA_ADIANTADA,
      'o cenário só existe se a segunda revogação tiver mesmo adiantado a barreira',
    );

    // 3. A tutora entra com a senha nova, 200 ms depois da revogação — dentro do
    //    ≤1 s em que a barreira está à frente do relógio. O login FUNCIONA: o
    //    token de acesso dela nasce empurrado por `instanteDeEmissaoDoAcesso` e
    //    passa. É o refresh que nasce condenado, e ninguém percebe agora.
    mover(LOGIN);
    const daVitima = await entrar(bancada);
    const autenticado = await bancada.servico.autenticar(daVitima.access_token);
    assert.equal(autenticado.conta.id, VITIMA, 'o login em si precisa ter funcionado');

    // 4. A PRIMEIRA renovação, 200 ms depois. É aqui que a pessoa cai.
    //
    //    A recusa é COLHIDA em vez de subir. Deixá-la estourar faria o caso
    //    reprovar com o `AppError` cru e a pilha de `renovar()`, e quem olhasse o
    //    vermelho daqui a seis meses veria um 401 sem causa. O que reprova tem de
    //    dizer o que quebrou.
    mover(PRIMEIRA_RENOVACAO);
    const recusa = await bancada.servico
      .renovar('refresh-novo', CONTEXTO)
      .then(() => undefined, (erro: unknown) => erro);

    assert.equal(
      recusa,
      undefined,
      'a PRIMEIRA renovação de quem acabou de entrar foi recusada. O refresh do login nasceu ' +
        'com `issued_at = agora`, abaixo da barreira que a revogação dupla adiantou ' +
        '(BICHUS-207), e `refreshFoiRevogado` (BICHUS-77) o derrubou. Quem cai é a pessoa que ' +
        'acabou de retomar a conta, 200 ms depois de entrar. O `Math.max` de `abrirSessao` faz ' +
        'o refresh nascer NA barreira em vez de abaixo dela',
    );
    assert.equal(
      bancada.repo.rotacoes.length,
      1,
      'renovou de verdade: a rotação tem de estar gravada, e não só a chamada ter voltado',
    );
    assert.deepEqual(
      bancada.eventos.filter((e) => e.action === 'auth.refresh_rejected_revoked_session'),
      [],
      'a trilha registrou a renovação como se fosse sessão revogada, e a sessão é de 200 ms atrás',
    );
  });

  void it('O CONTRAPESO: sem revogação recente, o login renova normalmente', async () => {
    // A outra ponta, e sem ela a isca passaria com um `issuedAt` gravado sempre
    // no futuro — que faria toda renovação do produto passar e transformaria o
    // portão do SEC-006 em decoração. O que se protege aqui é `renovar()`
    // continuar sendo portão: o empurrão só pode existir quando há barreira
    // adiantada para alcançar.
    const { bancada, mover } = await bancadaComRelogio(ANTES);

    mover(LOGIN);
    await entrar(bancada);
    assert.equal(
      bancada.repo.familiasAbertas.at(-1)?.issuedAt,
      LOGIN,
      'sem barreira à frente do relógio, `issued_at` continua sendo `agora` ao milissegundo',
    );

    mover(PRIMEIRA_RENOVACAO);
    await bancada.servico.renovar('refresh-novo', CONTEXTO);
    assert.equal(bancada.repo.rotacoes.length, 1, 'renovou normalmente');
  });

  void it('O PORTÃO CONTINUA PORTÃO: o refresh anterior à barreira segue recusado', async () => {
    // O terceiro caso fecha a saída fácil. Uma "correção" que gravasse
    // `issued_at` sempre à frente da barreira passaria nos dois casos acima e
    // ressuscitaria o furo de BICHUS-77: quem copiou o refresh ANTES da troca de
    // senha voltaria a renovar. A barreira alcança o que nasceu antes dela, e
    // não alcança o que nasceu depois.
    const bancada = montar({
      refresh: refreshArmazenado({ issuedAt: LOGIN }),
      conta: contaAtiva(BARREIRA_ADIANTADA),
      agora: PRIMEIRA_RENOVACAO,
    });

    const erro = await capturar(bancada.servico.renovar('refresh-copiado', CONTEXTO));
    assert.equal(erro.status, 401);
    assert.deepEqual(bancada.repo.rotacoes, [], 'a recusa vem ANTES da rotação');
  });
});
