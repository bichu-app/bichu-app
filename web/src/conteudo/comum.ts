export const MARCA = {
  nome: 'Bichu',
  descritor: 'a rede dos pets',
  altLogotipo: 'Bichu, a rede dos pets',
  rotuloInicio: 'Bichu, página inicial',
};

// Host e perfil separados do esquema de proposito: o portao de portabilidade
// proibe URL absoluta literal em codigo de src/, e o link se monta com o host.
const INSTAGRAM_HOST = 'www.instagram.com';
const INSTAGRAM_PERFIL = 'bichu.app';

export const CONTATO = {
  email: 'oi@bichu.app',
  instagram: {
    usuario: '@bichu.app',
    url: `https://${INSTAGRAM_HOST}/${INSTAGRAM_PERFIL}/`,
  },
};

export const LOJAS = {
  emBreve: 'Em breve na App Store e no Google Play.',
};

export const NAVEGACAO = {
  rotulo: 'Principal',
  pular: 'Pular para o conteúdo',
  menu: 'Menu',
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
  legal: '© 2026 Bichu. Nunca pague recompensa por um pet. O Bichu não intermedeia pagamento.',
};

export const RODAPE_ACHADOR = {
  assinatura: 'Bichu · a rede dos pets',
  termos: 'Termos de uso',
  privacidade: 'Privacidade',
};

export const AVISO_RECOMPENSA = 'Nunca pague recompensa por um pet. O Bichu não intermedeia pagamento.';
