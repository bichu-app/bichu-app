// Textos comuns a todas as paginas. Fonte: .jarvis/site-microcopy-revisada.md,
// secao "Prototipo v1" (rodada 3), regras 1 a 3 e blocos P.0 e P.1.8.
// Trocar texto e trocar aqui: nenhuma pagina escreve estas frases por conta propria.

export const MARCA = {
  nome: 'Bichu',
  descritor: 'a rede dos pets',
  altLogotipo: 'Bichu, a rede dos pets',
  rotuloInicio: 'Bichu, página inicial',
};

export const CONTATO = {
  email: 'oi@bichu.app',
  instagram: {
    usuario: '@bichu.app',
    url: 'https://www.instagram.com/bichu.app/',
  },
};

// Regra 1: sem selo e sem link de loja enquanto o app nao estiver publicado.
export const LOJAS = {
  emBreve: 'Em breve na App Store e no Google Play.',
};

export const NAVEGACAO = {
  rotulo: 'Principal',
  pular: 'Pular para o conteúdo',
  menu: 'Menu',
  // Regra 2: o rotulo de acao que nao pode acontecer vira "Em breve nas lojas".
  acao: 'Em breve nas lojas',
  links: [
    { href: '/comunidade', texto: 'Comunidade' },
    { href: '/como-funciona', texto: 'Como funciona' },
    { href: '/para-profissionais', texto: 'Para profissionais' },
    { href: '/sobre', texto: 'Sobre' },
    { href: '/contato', texto: 'Contato' },
  ],
};

export const RODAPE = {
  colunas: [
    {
      titulo: 'Produto',
      links: [
        { href: '/comunidade', texto: 'Comunidade' },
        { href: '/como-funciona', texto: 'Como funciona' },
        { href: '/para-profissionais', texto: 'Para profissionais' },
        { href: '/#baixe-app', texto: 'Em breve nas lojas' },
      ],
    },
    {
      titulo: 'Institucional',
      links: [
        { href: '/sobre', texto: 'Sobre' },
        { href: '/contato', texto: 'Contato' },
        { href: '/termos', texto: 'Termos de uso' },
        { href: '/privacidade', texto: 'Política de privacidade' },
      ],
    },
  ],
  instagramRotulo: 'Instagram do Bichu, @bichu.app (abre em nova aba)',
  emailRotulo: 'Escrever para o Bichu: oi@bichu.app',
  // Regra 3: a mesma frase da UX 12.1, com ponto, igual em todo lugar.
  legal: '© 2026 Bichu. Nunca pague recompensa por um pet. O Bichu não intermedeia pagamento.',
};

// Assinatura das paginas publicas: a marca so entra aqui (Mensagem da marca,
// "Onde a mensagem da marca nao entra").
export const RODAPE_ACHADOR = {
  assinatura: 'Bichu · a rede dos pets',
  termos: 'Termos de uso',
  privacidade: 'Privacidade',
};

// Aviso de golpe, UX 12.1. Uma frase so, reconhecida igual em todo lugar.
export const AVISO_RECOMPENSA = 'Nunca pague recompensa por um pet. O Bichu não intermedeia pagamento.';
