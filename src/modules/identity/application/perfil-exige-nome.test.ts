/**
 * A atualizacao do perfil **nao deixa a conta ficar sem nome**.
 *
 * ## A decisao, nas palavras do cliente (18/10/2026)
 *
 * *"atualizar o contrato para tornar o nome obrigatorio / nao permitir
 * atualizar o cadastro, se nao tiver algum nome cadastrado"*.
 *
 * ## A assimetria que isto fecha
 *
 * No mesmo dia o cadastro passou a exigir o nome
 * (`cadastro-exige-nome.test.ts`). Sobrou o outro lado: `MeUpdate` aceitava
 * `display_name: ""`, o repositorio so ignora `undefined`, e a coluna era
 * zerada. A tela de `Meus dados` **oferecia isso em texto** -- *"Escreva o seu
 * nome, ou deixe o campo vazio para tira-lo."* Exigir na entrada e permitir
 * apagar depois nao e regra, e so um pedagio.
 *
 * ## O RISCO DESTA HISTORIA E O BECO, E E O CASO (c) QUE RESPONDE POR ELE
 *
 * "Nao atualizar sem nome" aplicado sem cuidado prende as contas que **ja**
 * estao sem nome: elas nao poderiam atualizar nada, inclusive o nome, e nao
 * haveria saida nenhuma. Em homologacao sao 2 de 7 contas (medido em 18/10).
 *
 * A regra tem duas metades, e so a primeira e obvia:
 *
 * 1. nome que VEM no corpo precisa ter nome dentro -- fecha o apagar;
 * 2. nome que NAO vem exige que a conta ja tenha um -- cobra quem esta sem.
 *
 * A saida e a metade 1: quem esta sem nome manda `display_name` junto e salva.
 * O caso (c) deste arquivo e o unico que reprova se alguem endurecer a metade
 * 2 ate tapar essa porta, e e por isso que ele existe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type {
  CamposDoPerfil,
  Conta,
  IdentityRepository,
} from '../ports/identity-repository.js';
import type { Mailer } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const USUARIO = 'a1b2c3d4-0000-7000-8000-000000000001' as UserId;

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (Android)',
};

function naoDeveriaTerChegado(nome: string): never {
  throw new assert.AssertionError({
    message:
      `a atualizacao chamou \`${nome}\` deixando a conta sem nome. A recusa precisa ` +
      'acontecer ANTES da escrita: nome apagado volta a aparecer aos outros como ' +
      '"Tutor", que e o que a decisao de 18/10/2026 existe para impedir.',
  });
}

function conta(displayName: string | null): Conta {
  return {
    id: USUARIO,
    email: 'marina@exemplo.com.br',
    emailVerifiedAt: null,
    displayName,
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
  /** O que `atualizarPerfil` recebeu. Vazio = nada foi escrito. */
  readonly gravados: CamposDoPerfil[];
}

/**
 * `nomeAtual` e o estado da conta ANTES do PATCH: `null` e a conta sem nome,
 * que e o estado das 2 contas de homologacao.
 */
function montar(nomeAtual: string | null): Bancada {
  const eventos: AuditEvent[] = [];
  const gravados: CamposDoPerfil[] = [];

  const base: IdentityRepository = {
    // As duas da foto do perfil (migracao `20261018000008`). Elas entraram em
    // `IdentityRepository` com a frente das imagens e estes dois dubles nao
    // acompanharam: `origin/development` em 87979b6d NAO COMPILA por causa
    // disso, e a suite unitaria nao chega a rodar. Conserto de UMA LINHA cada,
    // no mesmo estilo do resto do duble -- recusar a chamada --, para que a
    // intencao original (qualquer chamada reprova) continue valendo.
    fotoDoPerfil: () => naoDeveriaTerChegado('fotoDoPerfil'),
    trocarFotoDoPerfil: () => naoDeveriaTerChegado('trocarFotoDoPerfil'),
    criarContaLocal: () => naoDeveriaTerChegado('criarContaLocal'),
    criarTokenDeVerificacao: () => naoDeveriaTerChegado('criarTokenDeVerificacao'),
    gravarRefresh: () => naoDeveriaTerChegado('gravarRefresh'),
    buscarContaPorEmail: () => naoDeveriaTerChegado('buscarContaPorEmail'),
    buscarContaPorId: () => Promise.resolve(conta(nomeAtual)),
    buscarRefreshPorHash: () => naoDeveriaTerChegado('buscarRefreshPorHash'),
    revogarFamilia: () => naoDeveriaTerChegado('revogarFamilia'),
    revogarTodasAsFamilias: () => naoDeveriaTerChegado('revogarTodasAsFamilias'),
    rotacionar: () => naoDeveriaTerChegado('rotacionar'),
    atualizarPerfil: (_id: UserId, campos: CamposDoPerfil) => {
      gravados.push(campos);
      const nome = campos.displayName;
      return Promise.resolve(conta(nome === undefined ? nomeAtual : nome));
    },
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
  };

  const assinador: TokenSigner = {
    emitir: (sub, agora: Instant, jti) => ({
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

  const mailer: Mailer = { enviar: () => naoDeveriaTerChegado('Mailer.enviar') };

  const servico = criarAuthService({
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio: base,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-1',
      opaqueToken: () => 'segredo-opaco' as OpaqueToken,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(INSTANTE_FIXO),
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

  return { servico, eventos, gravados };
}

/** Atualiza e devolve a recusa, ou reprova se foi aceito. */
async function recusaDe(
  nomeAtual: string | null,
  campos: CamposDoPerfil,
  rotulo: string,
): Promise<AppError> {
  const bancada = montar(nomeAtual);
  try {
    await bancada.servico.atualizarMeuPerfil(USUARIO, campos, CONTEXTO);
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError, e não por Error cru');
    assert.deepEqual(bancada.gravados, [], 'nada foi escrito');
    assert.deepEqual(bancada.eventos, [], 'nenhum `profile.updated` para um PATCH recusado');
    return erro;
  }
  throw new assert.AssertionError({
    message: `a atualizacao aceitou ${rotulo}, e a decisao de 18/10/2026 diz que nao.`,
  });
}

void describe('a atualizacao do perfil exige nome (decisão do cliente de 18/10/2026)', () => {
  /**
   * ISCA (a). Desligada: tirando o `nomeDeExibicaoAparado` do caminho de
   * `atualizarMeuPerfil`, este caso reprova em `atualizarPerfil` -- que e
   * literalmente o nome sendo apagado. Conferido.
   *
   * Entra pela APLICAÇÃO e não pela tela: `PATCH /v1/me` e alcancavel por
   * qualquer pessoa logada, sem passar por widget nenhum.
   */
  void it('`display_name` VAZIO no corpo é recusado, e nada é escrito', async () => {
    const erro = await recusaDe('Marina', { displayName: '' }, '`display_name` vazio');

    assert.equal(erro.status, 400);
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  /** `null` é o "apagar" explícito do repositório, e ele também cai. */
  void it('`display_name: null` é recusado, e nada é escrito', async () => {
    const erro = await recusaDe('Marina', { displayName: null }, '`display_name` nulo');

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  /**
   * O caso que escapa do schema. `minLength: 1` de `MeUpdate` nao alcanca
   * `"   "`; quem alcanca e o `trim` do servidor.
   *
   * Os tres espacos vem de `' '.repeat(3)` e nao de um literal: espaco no fim
   * de string literal e a primeira coisa que um formatador apara, e aparado
   * este caso viraria uma copia do primeiro sem ninguem notar.
   */
  void it('`display_name` SÓ COM ESPAÇO é recusado, e nada é escrito', async () => {
    const erro = await recusaDe(
      'Marina',
      { displayName: ' '.repeat(3) },
      '`display_name` só com espaço',
    );

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  /**
   * A metade 2 da regra: quem NAO tem nome e omite o campo nao atualiza.
   *
   * Esta e a parte literal do pedido do cliente -- *"nao permitir atualizar o
   * cadastro, se nao tiver algum nome cadastrado"*. A mensagem difere da das
   * outras de proposito: aqui a pessoa nao estava mexendo no nome, e precisa
   * saber que e ele que esta barrando ("para continuar").
   */
  void it('conta SEM nome que omite `display_name` não atualiza nada mais', async () => {
    const erro = await recusaDe(
      null,
      { phoneE164: '+5511987654321' },
      'um PATCH de telefone numa conta sem nome',
    );

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      {
        field: 'display_name',
        code: 'required',
        message: 'Diga como você quer ser chamado para continuar.',
      },
    ]);
  });

  /** A conta que JÁ tem nome segue podendo mexer em outro campo sozinho. */
  void it('conta COM nome atualiza outro campo sem reenviar o nome', async () => {
    const bancada = montar('Marina');

    await bancada.servico.atualizarMeuPerfil(
      USUARIO,
      { phoneE164: '+5511987654321' },
      CONTEXTO,
    );

    assert.equal(bancada.gravados.length, 1, 'escreveu uma vez');
    assert.equal(
      bancada.gravados[0]?.displayName,
      undefined,
      '`PATCH` de um campo continua sendo de um campo: o nome nao e reescrito a toa',
    );
  });

  /**
   * ISCA (b) — O CONTRAPESO.
   *
   * Uma recusa fixa em `atualizarMeuPerfil` deixaria todos os casos acima
   * verdes. Este e o primeiro que reprovaria. Ele afirma o que chegou na porta
   * de escrita, **aparado**.
   */
  void it('atualizar COM nome passa, e o que vai ao banco é o nome aparado', async () => {
    const bancada = montar('Marina');

    const atualizada = await bancada.servico.atualizarMeuPerfil(
      USUARIO,
      { displayName: '  Marina Prado  ' },
      CONTEXTO,
    );

    assert.equal(bancada.gravados.length, 1);
    assert.equal(
      bancada.gravados[0]?.displayName,
      'Marina Prado',
      'o nome vai APARADO: gravar "  Marina Prado  " faria o espaco aparecer em toda ' +
        'tela que mostra o nome e ordenaria a conta antes de todas as outras',
    );
    assert.equal(atualizada.displayName, 'Marina Prado');
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'profile.updated').length,
      1,
      'a trilha registrou: o caminho inteiro foi percorrido, e nao so a validacao',
    );
  });

  /**
   * ISCA (c) — A QUE PROTEGE CONTRA O BECO, e a razao de este arquivo existir
   * em vez de duas linhas dentro de outro.
   *
   * As 2 contas sem nome de homologacao precisam ter saida. Se alguem
   * endurecer a metade 2 da regra -- por exemplo lendo a conta e recusando
   * ANTES de olhar o corpo -- os quatro casos de recusa acima continuam
   * verdes, o contrapeso acima continua verde (a conta dele tem nome), e **so
   * este reprova**. Ele e a unica coisa que separa "cobrar o nome" de "prender
   * a conta".
   *
   * Desligada: pondo a leitura de `buscarContaPorId` fora do
   * `if (campaNome === undefined)` e recusando sempre que a conta nao tem
   * nome, este caso reprova e nenhum outro acusa.
   */
  void it('conta SEM nome CONSEGUE preencher o nome e salvar: não há beco', async () => {
    const bancada = montar(null);

    const atualizada = await bancada.servico.atualizarMeuPerfil(
      USUARIO,
      { displayName: 'Marina Prado' },
      CONTEXTO,
    );

    assert.equal(
      bancada.gravados.length,
      1,
      'a escrita aconteceu: quem esta sem nome tem como sair do estado',
    );
    assert.equal(bancada.gravados[0]?.displayName, 'Marina Prado');
    assert.equal(atualizada.displayName, 'Marina Prado');
  });

  /**
   * E a saida vale junto com os outros campos, que e como a tela de `Meus
   * dados` salva de verdade: um `PATCH` com tudo o que mudou.
   */
  void it('conta SEM nome salva o nome junto com os outros campos', async () => {
    const bancada = montar(null);

    await bancada.servico.atualizarMeuPerfil(
      USUARIO,
      { displayName: 'Marina Prado', phoneE164: '+5511987654321' },
      CONTEXTO,
    );

    assert.equal(bancada.gravados.length, 1);
    assert.equal(bancada.gravados[0]?.displayName, 'Marina Prado');
    assert.equal(bancada.gravados[0]?.phoneE164, '+5511987654321');
  });
});
