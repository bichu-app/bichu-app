/**
 * BICHUS-42 — o que só um teste de unidade prova na troca de e-mail.
 *
 * A prova contra Postgres está em `tests/integration/troca-de-email.test.ts`, e
 * é lá que moram as afirmações sobre coluna, expiração e teto. Aqui ficam as
 * três que o banco NÃO pega, porque não são sobre estado — são sobre **ordem**
 * e sobre **o que nunca chega a acontecer**:
 *
 * 1. **A ordem das duas mensagens.** O aviso ao endereço antigo tem de sair
 *    ANTES do link para o endereço novo. Depois que a troca vale, avisar não
 *    serve para nada: a recuperação de senha já mudou de dono. O banco não
 *    guarda ordem de envio; a bancada guarda.
 * 2. **O endereço injetável nunca alcança o mailer.** O caso histórico é o `>`
 *    fechando o `RCPT TO:` e enxertando parâmetro ESMTP sem nenhuma quebra de
 *    linha. Contra o banco isso não se vê: o pedido simplesmente não produz
 *    nada, e "nada aconteceu" é indistinguível de "o caso não rodou". Com
 *    dublê, dá para afirmar que o mailer **não foi chamado** e que o motivo
 *    ficou registrado.
 * 3. **Nenhum token é emitido quando o endereço já tem dono.** A resposta é
 *    idêntica (isso o teste de integração prova); o que só se vê por dentro é
 *    que `criarTokenDeVerificacao` não foi chamado.
 *
 * ## Iscas conferidas
 *
 * - aviso ao antigo movido para DEPOIS de `emitirEEnviarToken`: o caso 1
 *   reprova sozinho, imprimindo a ordem real das mensagens;
 * - a conferência de forma removida de `solicitarTrocaDeEmail`: o caso 2
 *   reprova dizendo que o endereço com `>` chegou ao mailer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Conta, IdentityRepository, NovoTokenDeVerificacao } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const AGORA = INSTANTE_FIXO;
const DONO: UserId = 'e7c2f0b6-0f1e-4a2b-9c3d-4e5f60718293' as UserId;
const EMAIL_ANTIGO = 'tutora-antiga@exemplo.invalid';
const EMAIL_NOVO = 'tutora-nova@exemplo.invalid';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '11111111-2222-3333-4444-555555555555',
  ip: '203.0.113.7',
  userAgent: 'teste',
};

function contaDe(email: string): Conta {
  return {
    id: DONO,
    email,
    emailVerifiedAt: dataFixa(AGORA),
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

function naoUsado(nome: string): never {
  throw new Error(`${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

class RepositorioDaTroca implements IdentityRepository {
  /** D42 (BICHUS-259): as contas deste dublê sao todas de tutor. */
  papeisDaConta(): Promise<readonly string[]> {
    return Promise.resolve(['tutor']);
  }

  public readonly tokensGravados: NovoTokenDeVerificacao[] = [];
  public readonly pedidosGravados: { userId: UserId; novoEmail: string }[] = [];

  /** `dono` é a conta que já ocupa o endereço novo, ou `undefined` se ele está livre. */
  constructor(private readonly dono: Conta | undefined) {}

  buscarContaPorId(): Promise<Conta | undefined> {
    return Promise.resolve(contaDe(EMAIL_ANTIGO));
  }

  buscarContaPorEmail(): Promise<Conta | undefined> {
    return Promise.resolve(this.dono);
  }

  criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
    this.tokensGravados.push(novo);
    return Promise.resolve();
  }

  registrarPedidoDeTrocaDeEmail(userId: UserId, novoEmail: string): Promise<void> {
    this.pedidosGravados.push({ userId, novoEmail });
    return Promise.resolve();
  }

  concluirTrocaDeEmail(): Promise<Conta | undefined> {
    return naoUsado('concluirTrocaDeEmail');
  }

  cancelarTrocaDeEmailPendente(): Promise<void> {
    return naoUsado('cancelarTrocaDeEmailPendente');
  }

  criarContaLocal(): Promise<Conta | undefined> {
    return naoUsado('criarContaLocal');
  }
  atualizarPerfil(): Promise<Conta | undefined> {
    return naoUsado('atualizarPerfil');
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
  buscarRefreshPorHash(): never {
    return naoUsado('buscarRefreshPorHash');
  }
  rotacionar(): Promise<boolean> {
    return naoUsado('rotacionar');
  }
  revogarFamilia(): Promise<number> {
    return naoUsado('revogarFamilia');
  }
  revogarTodasAsFamilias(): Promise<number> {
    return naoUsado('revogarTodasAsFamilias');
  }
  invalidarSessoes(): Promise<void> {
    return naoUsado('invalidarSessoes');
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
  criarJanelaDeReautenticacao(): Promise<void> {
    return naoUsado('criarJanelaDeReautenticacao');
  }
  consumirJanelaDeReautenticacao(): never {
    return naoUsado('consumirJanelaDeReautenticacao');
  }
  registrarPedidoDeExclusao(): never {
    return naoUsado('registrarPedidoDeExclusao');
  }
  contasAExpurgar(): never {
    return naoUsado('contasAExpurgar');
  }
  expurgarConta(): never {
    return naoUsado('expurgarConta');
  }
}

interface Registro {
  readonly dados: Record<string, unknown>;
  readonly mensagem: string;
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly repo: RepositorioDaTroca;
  readonly mensagens: Mensagem[];
  readonly registros: Registro[];
}

function montar(opcoes: { enderecoNovoTemDono?: boolean } = {}): Bancada {
  const repo = new RepositorioDaTroca(
    opcoes.enderecoNovoTemDono === true ? contaDe(EMAIL_NOVO) : undefined,
  );
  const mensagens: Mensagem[] = [];
  const registros: Registro[] = [];
  const eventos: AuditEvent[] = [];

  const mailer: Mailer = {
    enviar(mensagem) {
      mensagens.push(mensagem);
      return Promise.resolve();
    },
  };

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

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

  let contador = 0;
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
    mailer,
    registrarOcorrencia: (dados, mensagem) => {
      registros.push({ dados, mensagem });
    },
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, repo, mensagens, registros };
}

void describe('BICHUS-42 — a ordem dos avisos e o que nunca chega ao mailer', () => {
  void it('o aviso ao endereço ANTIGO sai ANTES do link para o endereço novo', async () => {
    const b = montar();
    await b.servico.solicitarTrocaDeEmail(DONO, EMAIL_NOVO, CONTEXTO);

    assert.equal(b.mensagens.length, 2, `saíram ${String(b.mensagens.length)} mensagens, esperava 2`);

    const destinos = b.mensagens.map((m) => m.para);
    assert.deepEqual(
      destinos,
      [EMAIL_ANTIGO, EMAIL_NOVO],
      'a ordem das mensagens está invertida. O aviso à testemunha precisa sair ' +
        'ANTES do link: é o intervalo entre os dois que dá ao titular a chance de ' +
        'trocar a senha e cancelar o pedido antes de a troca valer.',
    );

    // Só o endereço NOVO recebe link. O antigo recebe aviso, e aviso não confirma.
    assert.doesNotMatch((b.mensagens[0] as Mensagem).corpo, /[?&]token=/);
    assert.match((b.mensagens[1] as Mensagem).corpo, /[?&]token=/);
  });

  void it('ISCA — endereço com `>` não chega ao mailer, e o pedido não grava nada', async () => {
    const b = montar();
    // O caso histórico: o `>` fecha o `RCPT TO:<…>` e o resto vira argumento do
    // comando. Injeção de SMTP sem uma quebra de linha sequer.
    await b.servico.solicitarTrocaDeEmail(DONO, 'vitima@exemplo.invalid> NOTIFY=SUCCESS', CONTEXTO);

    assert.equal(
      b.mensagens.length,
      0,
      'o endereço injetável chegou ao mailer. A borda tem de recusar a MESMA classe ' +
        'de caractere que o fio recusa, e antes dele.',
    );
    assert.equal(b.repo.pedidosGravados.length, 0, '`pending_email` foi gravado mesmo assim');
    assert.equal(b.repo.tokensGravados.length, 0, 'um token foi emitido para um endereço recusado');

    const recusa = b.registros.filter((r) => r.dados['evento'] === 'email_change.refused');
    assert.equal(recusa.length, 1, 'a recusa não ficou registrada: ela some sem deixar rastro');
  });

  void it('endereço que já tem dono: nenhum token, nenhum pendente, e o aviso ao antigo sai igual', async () => {
    const b = montar({ enderecoNovoTemDono: true });
    await b.servico.solicitarTrocaDeEmail(DONO, EMAIL_NOVO, CONTEXTO);

    assert.equal(b.repo.tokensGravados.length, 0, 'emitimos token para endereço de outra conta');
    assert.equal(b.repo.pedidosGravados.length, 0, '`pending_email` reservou o endereço alheio');

    // O aviso ao endereço antigo sai NOS DOIS ramos, e com o mesmo texto: variar
    // aqui transformaria a caixa de entrada do titular num oráculo.
    const livre = montar();
    await livre.servico.solicitarTrocaDeEmail(DONO, EMAIL_NOVO, CONTEXTO);

    assert.equal(b.mensagens.length, 1, 'algo além do aviso saiu no ramo do endereço ocupado');
    assert.deepEqual(
      b.mensagens[0],
      livre.mensagens[0],
      'o aviso ao endereço antigo é diferente quando o endereço novo já tem dono',
    );
  });

  void it('pedir o endereço que a conta já usa não gasta e-mail nenhum', async () => {
    const b = montar();
    await b.servico.solicitarTrocaDeEmail(DONO, EMAIL_ANTIGO.toUpperCase(), CONTEXTO);

    assert.equal(b.mensagens.length, 0, 'mandamos e-mail por um pedido que não muda nada');
    assert.equal(b.repo.pedidosGravados.length, 0);
  });
});
