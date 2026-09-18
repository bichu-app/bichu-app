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
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type {
  Conta,
  IdentityRepository,
  MotivoDeRevogacao,
  NovoRefresh,
  RefreshArmazenado,
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

class RepositorioFalso implements IdentityRepository {
  public readonly revogacoes: { familyId: string; motivo: MotivoDeRevogacao; agora: Instant }[] = [];
  public readonly rotacoes: NovoRefresh[] = [];

  constructor(
    private readonly refresh: RefreshArmazenado | undefined,
    private readonly conta: Conta | undefined,
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
  buscarCredencialLocalPorEmail(): never {
    return naoUsado('buscarCredencialLocalPorEmail');
  }
  regravarCredencial(): Promise<void> {
    return naoUsado('regravarCredencial');
  }
  registrarLogin(): Promise<void> {
    return naoUsado('registrarLogin');
  }
  gravarRefresh(): Promise<void> {
    return naoUsado('gravarRefresh');
  }
  invalidarSessoes(): Promise<void> {
    return naoUsado('invalidarSessoes');
  }
  criarTokenDeVerificacao(): Promise<void> {
    return naoUsado('criarTokenDeVerificacao');
  }
  consumirTokenDeVerificacao(): never {
    return naoUsado('consumirTokenDeVerificacao');
  }
  conferirTokenDeVerificacao(): never {
    return naoUsado('conferirTokenDeVerificacao');
  }
  invalidarTokensPendentes(): Promise<number> {
    return naoUsado('invalidarTokensPendentes');
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
}): Bancada {
  const repo = new RepositorioFalso(opcoes.refresh, opcoes.conta);
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
