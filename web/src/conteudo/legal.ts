// Cabecalho das paginas de Termos e Privacidade. O corpo vem dos rascunhos em
// conteudo/juridico/*.md, copiados de .jarvis/juridico-rascunho-*.md (v0.3).
// As duas paginas sobem com noindex e com o aviso de rascunho visivel ate o
// cliente e o juridico aprovarem o texto: isso e pre-requisito de producao.
export const LEGAL = {
  aviso: 'Rascunho — pendente de revisão jurídica',
  versao: 'Versão 0.3 de 23/09/2026. O texto pode mudar antes da versão final.',
  termos: {
    titulo: 'Termos de Uso do Bichu',
    tituloDaPagina: 'Termos de uso',
    descricao: 'Termos de uso do Bichu, em rascunho.',
  },
  privacidade: {
    titulo: 'Política de Privacidade do Bichu',
    tituloDaPagina: 'Política de privacidade',
    descricao: 'Política de privacidade do Bichu, em rascunho.',
  },
};
