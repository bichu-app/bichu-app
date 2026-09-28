/**
 * A base de senhas vazadas (D43), conferida em todo login administrativo.
 *
 * `desconhecido` e resposta honesta quando a base nao pode ser consultada, e e
 * a unica que a implementacao de hoje da (`password-policy.ts` ja descrevia a
 * porta `PasswordBreachList` como nao implementada). O login trata
 * `desconhecido` como "nao sei", e nao como "limpa": a pendencia esta
 * registrada na entrega da BICHUS-259.
 */
export interface ListaDeSenhasVazadas {
  contem(senha: string): Promise<boolean | 'desconhecido'>;
}

export const listaDeSenhasVazadasIndisponivel: ListaDeSenhasVazadas = {
  contem: () => Promise.resolve('desconhecido'),
};
