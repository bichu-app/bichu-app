/** A base de senhas vazadas (D43), conferida em todo login administrativo. */
export interface ListaDeSenhasVazadas {
  contem(senha: string): Promise<boolean | 'desconhecido'>;
}

export const listaDeSenhasVazadasIndisponivel: ListaDeSenhasVazadas = {
  contem: () => Promise.resolve('desconhecido'),
};
