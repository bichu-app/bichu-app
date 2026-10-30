/** O dublê de `IdentityRepository` que recusa TODAS as portas, num lugar só. */
import type { IdentityRepository } from '../../ports/identity-repository.js';

/** Porta da interface, pelo nome. */
type Porta = keyof IdentityRepository;

/** Os parâmetros e o retorno saem da PRÓPRIA interface, e não de uma cópia. */
type Argumentos<N extends Porta> = Parameters<IdentityRepository[N]>;
type Retorno<N extends Porta> = ReturnType<IdentityRepository[N]>;

export abstract class RepositorioQueRecusaTudo implements IdentityRepository {
  /** Como este arquivo de teste recusa. */
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
