/**
 * O cadastro **exige o nome de exibição**, e a exigência é do servidor.
 *
 * ## A queixa, nas palavras do cliente (18/10/2026)
 *
 * *"o campo de nome no cadastro do usuario é obrigatorio, hoje ele esta
 * cadastrando sem esse campo"*.
 *
 * ## O que estava errado, e não era o campo faltando
 *
 * O campo `Nome` **já existia** na tela `F1.1`, e já aparecia sem "(opcional)"
 * no rótulo — ele PARECIA obrigatório. O que não existia era alguém exigindo:
 * a tela mandava `nome: null` quando o campo estava vazio
 * (`_nome.text.trim().isEmpty ? null : ...`), `RegisterRequest` listava
 * `required: [email, password]` e `cadastrar` validava o e-mail e a senha e
 * **nada** sobre o nome. As três camadas concordavam em não cobrar.
 *
 * ## Por que estes casos chamam o SERVIÇO, e não a tela
 *
 * `POST /v1/auth/register` tem `security: []` — é rota pública. Validação só
 * na tela trocaria a exigência por uma sugestão: quem chama a rota direto não
 * passa por widget nenhum. É por isso que estes casos entram pela aplicação,
 * com o dublê de repositório recusando tudo: o que eles afirmam é que **nada
 * foi gravado**.
 *
 * ## O caso que escapava de todos os outros
 *
 * `required` no schema recusa a chave ausente. `minLength: 1` recusa `""`.
 * Nenhum dos dois recusa `"   "`, que tem comprimento 3 e nenhum nome dentro —
 * e é esse que faria a conta nascer "sem nome" para as outras pessoas, porque
 * `camposPendentesDoPerfil` (`completude-do-perfil.ts`) já conta
 * `trim() === ''` como pendência. Quem recusa esse é o `trim` do `cadastrar`.
 *
 * ## O contrapeso é obrigatório aqui
 *
 * Sem o caso do nome BOM, uma recusa fixa — `cadastrar` passando a estourar
 * para qualquer entrada — deixaria os dois primeiros casos verdes. O terceiro
 * caso entra com repositório que ACEITA e afirma o nome que chegou na porta,
 * aparado: ele é a única coisa neste arquivo que prova que a trava recusa o
 * nome ausente e **só** ele.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Conta, FotoDoPerfil, IdentityRepository, NovaConta } from '../ports/identity-repository.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const SENHA_BOA = 'coleira-azul-do-bidu-2026';
const EMAIL = 'marina@exemplo.com.br';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (Android)',
};

function naoDeveriaTerChegado(nome: string): never {
  throw new assert.AssertionError({
    message:
      `o cadastro chamou \`${nome}\` sem nome de exibição. A recusa precisa acontecer ` +
      'ANTES de qualquer escrita: conta criada sem nome é a queixa de 18/10/2026, e ' +
      'tornar o campo obrigatório depois não preenche o que já nasceu vazio.',
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
  return new (class extends RepositorioQueRecusaTudo {
    // **A PROJECAO DA SESSAO LE A FOTO desde 21/10/2026**: `Me.photo` esta no
    // contrato desde 18/10 e `SessionResponse.user` nao a entregava, entao o
    // avatar da barra do app caia na inicial do nome em todas as paginas.
    // Qualquer caso que ABRE SESSAO passa por aqui agora -- por isso esta
    // porta responde em vez de recusar. `null` e a resposta certa: o dublê
    // nao tem foto, e e esse o estado de toda conta que nunca cadastrou uma.
    override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
      return Promise.resolve(null);
    }

    protected recusar(nome: string): never {
      return naoDeveriaTerChegado(nome);
    }
  })();
}

function contaRecemCriada(displayName: string | null): Conta {
  return {
    id: 'a1b2c3d4-0000-7000-8000-000000000001' as UserId,
    email: EMAIL,
    emailVerifiedAt: null,
    displayName,
    // `handle: null` e o estado NORMAL de conta sem apelido: o apelido entrou
    // em 18/10/2026 e **nenhum fluxo obriga a escolher** (plano 4-C.8).
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
 */
function montar(aceitandoEscrita = false): Bancada {
  const eventos: AuditEvent[] = [];
  const mensagens: Mensagem[] = [];
  const recebidas: NovaConta[] = [];

  const repositorio: IdentityRepository = aceitandoEscrita
    ? {
        ...repositorioQueRecusaTudo(),
        // **A FOTO PRECISA SER LISTADA AQUI, e o motivo e o espalhamento.**
        // `repositorioQueRecusaTudo()` devolve INSTANCIA DE CLASSE, e `...` copia
        // so propriedade propria e enumeravel -- metodo de classe mora no
        // prototipo e NAO vem. O objeto daqui tem exatamente as portas escritas
        // abaixo, e nenhuma outra.
        //
        // O `tsc` nao pega: o tipo do espalhamento inclui os membros herdados,
        // entao a compilacao passa e a falta aparece em tempo de execucao, como
        // `deps.repositorio.fotoDoPerfil is not a function`. Foi assim que ela
        // apareceu em 21/10/2026, quando a projecao da sessao passou a ler a
        // foto: este era o UNICO caso do repositorio que espalhava a classe.
        fotoDoPerfil: () => Promise.resolve(null),
        criarContaLocal: (nova: NovaConta) => {
          recebidas.push(nova);
          return Promise.resolve(contaRecemCriada(nova.displayName ?? null));
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

  return { servico, eventos, mensagens, recebidas };
}

/** Cadastra com o nome dado e devolve a recusa, ou reprova se foi aceito. */
async function recusaComNome(nome: string | undefined, rotulo: string): Promise<AppError> {
  const bancada = montar();
  try {
    await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        // `birthDate` entrou em 18/10/2026 com a idade minima de 16 anos. Data
        // fixa e longe do corte: este arquivo mede o NOME, nao a idade.
        birthDate: '1990-05-12',
        displayName: nome,
      },
      CONTEXTO,
    );
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError, e não por Error cru');
    assert.deepEqual(bancada.eventos, [], 'nenhum evento de trilha para uma conta que não nasceu');
    return erro;
  }
  throw new assert.AssertionError({
    message:
      `o cadastro aceitou ${rotulo}. É exatamente a queixa de 18/10/2026, e a rota é ` +
      'pública: sem a trava aqui, a tela é só uma sugestão.',
  });
}

void describe('o cadastro exige nome de exibição (queixa do cliente de 18/10/2026)', () => {
  /**
   * ISCA (a). Desligada: apagando a guarda
   * `if (displayName === undefined || displayName.length === 0)` de
   * `cadastrar`, este caso reprova em `criarContaLocal` — que é literalmente a
   * conta sem nome nascendo. Conferido antes de entregar.
   *
   * Entra pela APLICAÇÃO e não pela tela, de propósito: é a prova de que quem
   * chama `POST /v1/auth/register` direto também é recusado.
   */
  void it('chave `display_name` AUSENTE é recusada com 400, e nada é gravado', async () => {
    const erro = await recusaComNome(undefined, 'um cadastro sem a chave `display_name`');

    assert.equal(erro.status, 400, 'a resposta é 400, e nunca 201');
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  /** A string vazia, que é o que um formulário manda quando ninguém digitou. */
  void it('`display_name` vazio é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome('', 'um cadastro com `display_name` vazio');

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  /**
   * ISCA (b), E O CASO QUE ESCAPA DE TODOS OS OUTROS.
   *
   * Desligada: trocando `entrada.displayName?.trim()` por `entrada.displayName`
   * em `cadastrar`, os dois casos acima continuam VERDES e só este reprova — a
   * conta nasce com `"   "` no `display_name`, que não é nulo, não é vazio e
   * não é nome. `required` e `minLength: 1` do schema não alcançam este caso;
   * só o `trim` alcança.
   *
   * Os três espaços são escritos por `' '.repeat(3)` e não como literal, porque
   * espaço em branco no fim de uma string literal é a primeira coisa que um
   * formatador apara — e aparando, a isca passaria a testar a string vazia e
   * este caso viraria uma cópia do anterior sem ninguém notar.
   */
  void it('`display_name` SÓ COM ESPAÇO é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome(' '.repeat(3), 'um cadastro com `display_name` só com espaço');

    assert.equal(erro.status, 400);
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(
      erro.errors,
      [{ field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' }],
      'a recusa reaproveita o `code: required` que o contrato já declara, e não um código novo',
    );
  });

  /** O teto do contrato (`maxLength: 80`) também é do servidor. */
  void it('`display_name` acima de 80 caracteres é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome('a'.repeat(81), 'um nome de 81 caracteres');

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      {
        field: 'display_name',
        code: 'too_long',
        message: 'Use no máximo 80 caracteres no nome.',
      },
    ]);
  });

  /**
   * ISCA (c) — O CONTRAPESO, e sem ele este arquivo não vale nada.
   *
   * Uma recusa fixa em `cadastrar` — qualquer `throw` logo na entrada —
   * deixaria os quatro casos acima verdes. Este é o único que reprovaria, e é
   * por isso que ele existe.
   *
   * Ele afirma mais que "não estourou": afirma **o que chegou na porta de
   * escrita**, aparado. Um `cadastrar` que aceitasse o nome e gravasse
   * `" Marina "` passaria num caso que só olhasse o 201, e o espaço apareceria
   * depois em toda tela que mostra o nome.
   */
  void it('cadastro COM nome continua funcionando, e o que chega ao banco é o nome aparado', async () => {
    const bancada = montar(true);

    const sessao = await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: '1990-05-12',
        displayName: '  Marina  ',
      },
      CONTEXTO,
    );

    assert.equal(bancada.recebidas.length, 1, 'a conta foi criada uma vez');
    assert.equal(
      bancada.recebidas[0]?.displayName,
      'Marina',
      'o que vai para o banco é o nome APARADO: gravar " Marina " faria o espaço aparecer ' +
        'em toda tela que mostra o nome e ordenaria a conta antes de todas as outras',
    );
    assert.equal(sessao.user.email, EMAIL, 'a sessão nasce para a conta cadastrada');
    assert.equal(
      sessao.user.display_name,
      'Marina',
      'o nome aparado também é o que volta na resposta: se o corpo devolvesse " Marina ", ' +
        'o app mostraria o espaço mesmo com o banco correto',
    );
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'auth.account_created').length,
      1,
      'a trilha registrou a criação: o caminho inteiro foi percorrido, e não só a validação',
    );
  });
});
