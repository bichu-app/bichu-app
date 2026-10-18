/**
 * O dublê de `IdentityRepository` que recusa TODAS as portas, num lugar só.
 * Nunca é ligado em `api.ts`: só os testes de unidade do módulo o usam.
 *
 * ## Por que ele existe (e por que é mecanismo, não conveniência)
 *
 * Dez arquivos de teste do módulo montavam dublê de `IdentityRepository`, e
 * cada um listava as 27 portas à mão — 270 pontos de manutenção. Em 18/10/2026
 * isso custou o dia: o lote da mídia (`1d2ccac1`) acrescentou `fotoDoPerfil` e
 * `trocarFotoDoPerfil` à porta e corrigiu os dublês que existiam; outro ramo,
 * em paralelo, criou dois dublês novos contra a porta ANTIGA. **Nenhum dos dois
 * lados reprovava sozinho — só a união.** E como `npm test` compila com `tsc`
 * antes de rodar, o `TS2739` da união não derrubou dois casos: derrubou a
 * suíte INTEIRA, 2884 casos, e o projeto ficou sem medição nenhuma.
 *
 * A trava é estrutural, e não um aviso: um dublê que deriva desta classe **não
 * contém lista de portas**. Com isso
 *
 *  - acrescentar porta à interface reprova UM arquivo (este), não dez; e
 *  - o ramo que cresce a interface é obrigado a crescer este arquivo no MESMO
 *    commit, de modo que um dublê criado em outro ramo herda a porta nova em
 *    vez de nascer incompleto. O defeito da união deixa de ser possível, em
 *    vez de só ser detectado depois.
 *
 * ## Como se usa
 *
 * O dublê do arquivo de teste estende esta classe, diz como recusa, e
 * sobrescreve SÓ as portas que aquele arquivo exercita:
 *
 * ```ts
 * class RepositorioFalso extends RepositorioQueRecusaTudo {
 *   protected recusar(nome: string): never {
 *     return naoUsado(nome);
 *   }
 *   override buscarContaPorId(): Promise<Conta | undefined> {
 *     return Promise.resolve(this.conta);
 *   }
 * }
 * ```
 *
 * `recusar` fica com o arquivo de propósito: a mensagem de recusa é a
 * afirmação daquele teste ("o cadastro chamou X sem nome de exibição"), e
 * centralizá-la trocaria uma asserção específica por uma genérica.
 *
 * `noImplicitOverride` está ligado, então `override` é obrigatório — e é ele
 * que reprova uma sobrescrita cujo nome deixou de existir na porta.
 *
 * ## A isca
 *
 * `tests/.../` não cobre isto: a prova é o próprio `tsc`. O `implements
 * IdentityRepository` abaixo é a isca, e ela se demonstra por desligamento —
 * acrescente uma porta à interface sem acrescentá-la aqui e a compilação
 * reprova ESTE arquivo, com `TS2420`.
 */
import type { IdentityRepository } from '../../ports/identity-repository.js';

/** Porta da interface, pelo nome. */
type Porta = keyof IdentityRepository;

/**
 * Os parâmetros e o retorno saem da PRÓPRIA interface, e não de uma cópia.
 *
 * Declarar a assinatura à mão aqui recriaria o problema que esta classe
 * resolve, em menor escala: uma porta que mudasse de assinatura passaria a ter
 * duas versões, e a daqui venceria em silêncio para quem estende.
 */
type Argumentos<N extends Porta> = Parameters<IdentityRepository[N]>;
type Retorno<N extends Porta> = ReturnType<IdentityRepository[N]>;

export abstract class RepositorioQueRecusaTudo implements IdentityRepository {
  /**
   * Como este arquivo de teste recusa. Recebe o nome da porta tocada e o que
   * chegou nela — quem implementa pode ignorar o segundo parâmetro, e quase
   * todos ignoram: declarar `recusar(nome: string)` basta.
   *
   * Devolve `never` de propósito: um dublê que devolvesse `undefined` faria a
   * afirmação seguinte passar por acidente, que é a forma de um portão aprovar
   * por ausência.
   */
  protected abstract recusar(nome: string, argumentos: readonly unknown[]): never;

  criarContaLocal(...argumentos: Argumentos<'criarContaLocal'>): Retorno<'criarContaLocal'> {
    return this.recusar('criarContaLocal', argumentos);
  }

  buscarContaPorId(...argumentos: Argumentos<'buscarContaPorId'>): Retorno<'buscarContaPorId'> {
    return this.recusar('buscarContaPorId', argumentos);
  }

  atualizarPerfil(...argumentos: Argumentos<'atualizarPerfil'>): Retorno<'atualizarPerfil'> {
    return this.recusar('atualizarPerfil', argumentos);
  }

  fotoDoPerfil(...argumentos: Argumentos<'fotoDoPerfil'>): Retorno<'fotoDoPerfil'> {
    return this.recusar('fotoDoPerfil', argumentos);
  }

  trocarFotoDoPerfil(...argumentos: Argumentos<'trocarFotoDoPerfil'>): Retorno<'trocarFotoDoPerfil'> {
    return this.recusar('trocarFotoDoPerfil', argumentos);
  }

  buscarContaPorEmail(...argumentos: Argumentos<'buscarContaPorEmail'>): Retorno<'buscarContaPorEmail'> {
    return this.recusar('buscarContaPorEmail', argumentos);
  }

  buscarCredencialLocalPorEmail(
    ...argumentos: Argumentos<'buscarCredencialLocalPorEmail'>
  ): Retorno<'buscarCredencialLocalPorEmail'> {
    return this.recusar('buscarCredencialLocalPorEmail', argumentos);
  }

  regravarCredencial(...argumentos: Argumentos<'regravarCredencial'>): Retorno<'regravarCredencial'> {
    return this.recusar('regravarCredencial', argumentos);
  }

  registrarLogin(...argumentos: Argumentos<'registrarLogin'>): Retorno<'registrarLogin'> {
    return this.recusar('registrarLogin', argumentos);
  }

  gravarRefresh(...argumentos: Argumentos<'gravarRefresh'>): Retorno<'gravarRefresh'> {
    return this.recusar('gravarRefresh', argumentos);
  }

  buscarRefreshPorHash(...argumentos: Argumentos<'buscarRefreshPorHash'>): Retorno<'buscarRefreshPorHash'> {
    return this.recusar('buscarRefreshPorHash', argumentos);
  }

  rotacionar(...argumentos: Argumentos<'rotacionar'>): Retorno<'rotacionar'> {
    return this.recusar('rotacionar', argumentos);
  }

  revogarFamilia(...argumentos: Argumentos<'revogarFamilia'>): Retorno<'revogarFamilia'> {
    return this.recusar('revogarFamilia', argumentos);
  }

  revogarTodasAsFamilias(
    ...argumentos: Argumentos<'revogarTodasAsFamilias'>
  ): Retorno<'revogarTodasAsFamilias'> {
    return this.recusar('revogarTodasAsFamilias', argumentos);
  }

  invalidarSessoes(...argumentos: Argumentos<'invalidarSessoes'>): Retorno<'invalidarSessoes'> {
    return this.recusar('invalidarSessoes', argumentos);
  }

  criarTokenDeVerificacao(
    ...argumentos: Argumentos<'criarTokenDeVerificacao'>
  ): Retorno<'criarTokenDeVerificacao'> {
    return this.recusar('criarTokenDeVerificacao', argumentos);
  }

  consumirTokenDeVerificacao(
    ...argumentos: Argumentos<'consumirTokenDeVerificacao'>
  ): Retorno<'consumirTokenDeVerificacao'> {
    return this.recusar('consumirTokenDeVerificacao', argumentos);
  }

  conferirTokenDeVerificacao(
    ...argumentos: Argumentos<'conferirTokenDeVerificacao'>
  ): Retorno<'conferirTokenDeVerificacao'> {
    return this.recusar('conferirTokenDeVerificacao', argumentos);
  }

  invalidarTokensPendentes(
    ...argumentos: Argumentos<'invalidarTokensPendentes'>
  ): Retorno<'invalidarTokensPendentes'> {
    return this.recusar('invalidarTokensPendentes', argumentos);
  }

  marcarEmailVerificado(
    ...argumentos: Argumentos<'marcarEmailVerificado'>
  ): Retorno<'marcarEmailVerificado'> {
    return this.recusar('marcarEmailVerificado', argumentos);
  }

  criarJanelaDeReautenticacao(
    ...argumentos: Argumentos<'criarJanelaDeReautenticacao'>
  ): Retorno<'criarJanelaDeReautenticacao'> {
    return this.recusar('criarJanelaDeReautenticacao', argumentos);
  }

  consumirJanelaDeReautenticacao(
    ...argumentos: Argumentos<'consumirJanelaDeReautenticacao'>
  ): Retorno<'consumirJanelaDeReautenticacao'> {
    return this.recusar('consumirJanelaDeReautenticacao', argumentos);
  }

  registrarPedidoDeExclusao(
    ...argumentos: Argumentos<'registrarPedidoDeExclusao'>
  ): Retorno<'registrarPedidoDeExclusao'> {
    return this.recusar('registrarPedidoDeExclusao', argumentos);
  }

  contasAExpurgar(...argumentos: Argumentos<'contasAExpurgar'>): Retorno<'contasAExpurgar'> {
    return this.recusar('contasAExpurgar', argumentos);
  }

  registrarPedidoDeTrocaDeEmail(
    ...argumentos: Argumentos<'registrarPedidoDeTrocaDeEmail'>
  ): Retorno<'registrarPedidoDeTrocaDeEmail'> {
    return this.recusar('registrarPedidoDeTrocaDeEmail', argumentos);
  }

  concluirTrocaDeEmail(...argumentos: Argumentos<'concluirTrocaDeEmail'>): Retorno<'concluirTrocaDeEmail'> {
    return this.recusar('concluirTrocaDeEmail', argumentos);
  }

  cancelarTrocaDeEmailPendente(
    ...argumentos: Argumentos<'cancelarTrocaDeEmailPendente'>
  ): Retorno<'cancelarTrocaDeEmailPendente'> {
    return this.recusar('cancelarTrocaDeEmailPendente', argumentos);
  }
}
