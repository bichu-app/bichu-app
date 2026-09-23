/**
 * Ponto de extensao da sessao do backoffice. NENHUM modelo esta escolhido.
 *
 * Como o navegador carrega a credencial (cookie httpOnly com `credentials:
 * 'include'`, ou Bearer mantido em memoria) esta em decisao por ADR. As duas
 * formas cabem neste contrato, porque as duas sao uma transformacao da
 * requisicao antes de ela sair:
 *
 * - cookie httpOnly: devolve `new Request(requisicao, { credentials: 'include' })`;
 * - Bearer em memoria: devolve a requisicao com `Authorization` preenchido.
 *
 * Quando a ADR sair, a estrategia escolhida implementa esta interface e e
 * passada a `criarClienteDaApi`. Nada mais no cliente muda.
 */
export interface EstrategiaDeSessao {
  /** Ajusta a requisicao antes do envio. */
  prepararRequisicao(requisicao: Request): Request | Promise<Request>;
  /** Chamado quando a API responde 401. */
  aoPerderAutorizacao?(resposta: Response): void;
}

/**
 * O padrao enquanto a ADR nao sai: nao anexa credencial nenhuma. Toda rota
 * protegida de `/v1/admin` responde 401, que e o comportamento correto para
 * quem ainda nao tem sessao.
 */
export const semSessao: EstrategiaDeSessao = {
  prepararRequisicao: (requisicao) => requisicao,
};
