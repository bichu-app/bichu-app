/**
 * A ordem dos acontecimentos no cadastro (BICHUS-198, critérios 2, 3 e 4).
 *
 * ## O que estava errado, e não era a segurança
 *
 * `a@b.test;x` passava na validação de forma, **a conta era criada**, a sessão
 * era aberta, a trilha gravava `auth.account_created` — e só então o envio da
 * verificação recusava o endereço. O `smtp-mailer` fazia a coisa certa; o que
 * estava na camada errada era a conferência. A pessoa recebia 500 com a conta
 * já existindo, em vez de 400 sem conta nenhuma. Tentar de novo com o endereço
 * corrigido esbarraria no 409 da própria conta fantasma.
 *
 * ## Por que o dublê de repositório recusa TUDO
 *
 * O que estes casos afirmam é uma **ausência**: nada foi gravado. Um dublê que
 * registrasse as chamadas numa lista provaria o mesmo, mas só para as chamadas
 * que alguém lembrasse de conferir. Este recusa qualquer método, dizendo o
 * nome — então uma implementação futura que gravasse a conta por outro caminho
 * (um `atualizarPerfil`, um `registrarLogin`) também reprova, sem que este
 * arquivo precise prever o caminho.
 *
 * O mailer segue a mesma regra: chegar ao envio já é o defeito.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, OpaqueToken } from '../../../shared/types/brands.js';
import { INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { Mailer } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const SENHA_BOA = 'coleira-azul-do-bidu-2026';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (iPhone)',
};

/**
 * O endereço do relato da issue. O `;` separa endereços numa lista de
 * cabeçalho — é o caractere que o `U+037E` grego produziria sob NFKC, e o mais
 * barato de digitar num formulário.
 */
const ENDERECO_DO_RELATO = 'a@b.test;x';

function naoDeveriaTerChegado(nome: string): never {
  throw new assert.AssertionError({
    message:
      `o cadastro chamou \`${nome}\` com um endereço que a borda tinha de ter recusado. ` +
      'A recusa precisa acontecer ANTES de qualquer escrita: conta criada e depois envio ' +
      'que falha é exatamente o defeito da BICHUS-198.',
  });
}

/** Toda porta de escrita e de leitura recusa: o caminho não pode chegar a nenhuma. */
function repositorioQueRecusaTudo(): IdentityRepository {
  return {
    criarContaLocal: () => naoDeveriaTerChegado('criarContaLocal'),
    criarTokenDeVerificacao: () => naoDeveriaTerChegado('criarTokenDeVerificacao'),
    gravarRefresh: () => naoDeveriaTerChegado('gravarRefresh'),
    buscarContaPorEmail: () => naoDeveriaTerChegado('buscarContaPorEmail'),
    buscarContaPorId: () => naoDeveriaTerChegado('buscarContaPorId'),
    papeisDaConta: () => naoDeveriaTerChegado('papeisDaConta'),
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
    expurgarConta: () => naoDeveriaTerChegado('expurgarConta'),
    registrarPedidoDeTrocaDeEmail: () => naoDeveriaTerChegado('registrarPedidoDeTrocaDeEmail'),
    concluirTrocaDeEmail: () => naoDeveriaTerChegado('concluirTrocaDeEmail'),
    cancelarTrocaDeEmailPendente: () => naoDeveriaTerChegado('cancelarTrocaDeEmailPendente'),
  };
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly eventos: AuditEvent[];
}

function montar(): Bancada {
  const eventos: AuditEvent[] = [];

  const assinador: TokenSigner = {
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

  const mailer: Mailer = {
    enviar: () => naoDeveriaTerChegado('Mailer.enviar'),
  };

  const servico = criarAuthService({
    repositorio: repositorioQueRecusaTudo(),
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

  return { servico, eventos };
}

async function recusaDe(email: string): Promise<AppError> {
  const bancada = montar();
  try {
    await bancada.servico.cadastrar({ email, password: SENHA_BOA, displayName: 'Tutora' }, CONTEXTO);
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError, e não por Error cru');
    assert.deepEqual(bancada.eventos, [], 'nenhum evento de trilha para uma conta que não nasceu');
    return erro;
  }
  throw new assert.AssertionError({
    message: `\`${email}\` foi aceito no cadastro. A borda precisa recusá-lo antes da escrita.`,
  });
}

void describe('BICHUS-198 — o cadastro recusa antes de criar a conta', () => {
  /**
   * ISCA do critério 2, e a que reproduz o relato da issue.
   *
   * Desligada uma vez: com `emailTemFormaValida` de volta no `!/\s/.test(email)`,
   * este caso reprova em `criarContaLocal` — que é literalmente a conta
   * nascendo antes de o envio falhar.
   */
  void it('`a@b.test;x` não chega a tocar o repositório nem o mailer', async () => {
    const erro = await recusaDe(ENDERECO_DO_RELATO);

    assert.equal(erro.status, 400, 'a resposta é 400, e nunca 500 (critério 3)');
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(erro.errors, [
      { field: 'email', code: 'format', message: 'Confira o endereço de e-mail.' },
    ]);
  });

  /**
   * A classe inteira, e não só o `;` do relato. Um a um, porque um caso que
   * varresse tudo num `for` e afirmasse só "algum recusou" ficaria verde com
   * metade da lista de pé.
   */
  void it('toda a classe de gramática é recusada com 400 no cadastro, e nenhuma escreve', async () => {
    // Por sequencia de escape, e NUNCA por literal: cinco destes sao
    // invisiveis no editor, e um deles e NUL. Escritos crus, eles fazem o
    // arquivo virar binario para o git, somem numa copia descuidada e levam
    // a defesa junto sem que a linha pareca ter mudado. E a mesma razao
    // pela qual `QUEBRAS_DE_LINHA_NO_ASSUNTO` e escrita por ponto de codigo.
    const perigosos: readonly (readonly [string, string])[] = [
      ['ponto e vírgula', 'a@b.test;x'],
      ['vírgula', 'a@b.test,x'],
      ['dois-pontos (rota de origem do RFC 821)', '@relay.mal.test:vitima@b.test'],
      ['maior-que (fecha o RCPT TO)', 'a@b.test>x'],
      ['menor-que', 'a<x@b.test'],
      ['aspas', 'a"x@b.test'],
      ['contrabarra', 'a\\x@b.test'],
      ['NUL', 'a\u0000x@b.test'],
      ['NEL (U+0085, fora do `\\s` do JavaScript)', 'a\u0085x@b.test'],
      ['VT', 'a\u000bx@b.test'],
      ['FF', 'a\u000cx@b.test'],
      ['separador de linha (U+2028)', 'a\u2028x@b.test'],
      ['CRLF', 'a@b.test\r\nBcc:x@mal.test'],
    ];

    for (const [nome, endereco] of perigosos) {
      const erro = await recusaDe(endereco);
      assert.equal(erro.status, 400, `${nome}: precisa ser 400`);
    }
  });

  /**
   * ISCA do critério 4. Endereço é dado pessoal e mensagem de erro vai para o
   * log — uma recusa que vazasse o endereço trocaria um defeito por outro.
   */
  void it('nem a mensagem nem o corpo do problema carregam o endereço recusado', async () => {
    const erro = await recusaDe('tutora.silva@exemplo.test;bcc@mal.test');
    const tudoQueSai = JSON.stringify({
      message: erro.message,
      title: erro.title,
      detail: erro.detail,
      errors: erro.errors,
    });

    assert.doesNotMatch(tudoQueSai, /tutora/, 'a parte local não pode aparecer');
    assert.doesNotMatch(tudoQueSai, /silva/, 'o sobrenome não pode aparecer');
    assert.doesNotMatch(tudoQueSai, /mal\.test/, 'o domínio enxertado não pode aparecer');
    assert.doesNotMatch(tudoQueSai, /@/, 'nenhum pedaço de endereço');
  });

  /**
   * A outra metade do critério 5, vista de cima: a borda não pode ficar mais
   * rígida que o fio. Sem este caso, uma "correção" que recusasse todo endereço
   * passaria em tudo acima e mataria o cadastro inteiro.
   */
  void it('endereço legítimo continua passando da borda para dentro', async () => {
    // O dublê recusa tudo, então o endereço legítimo termina numa exceção — mas
    // numa exceção DE OUTRO TIPO, vinda de `criarContaLocal`. É essa diferença
    // que prova que a borda deixou passar: um `AppError` de validação aqui
    // significaria que a correção passou a recusar endereço que o envio
    // entregaria, que é a outra metade do critério 5.
    const bancada = montar();
    await assert.rejects(
      bancada.servico.cadastrar(
        { email: 'ana.paula+bichu@exemplo.com.br', password: SENHA_BOA, displayName: 'Tutora' },
        CONTEXTO,
      ),
      (erro: unknown) => {
        assert.ok(
          !(erro instanceof AppError),
          'a borda recusou um endereço legítimo: ela ficou mais rígida que o fio',
        );
        assert.match(String(erro), /criarContaLocal/, 'o caminho tinha de ter chegado à escrita');
        return true;
      },
    );
  });
});
