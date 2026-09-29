// Textos de /como-funciona, /para-profissionais, /sobre e /contato. Fonte:
// secao "Prototipo v1", blocos P.3 a P.6, com a rodada 3. Onde ha decisao do
// cliente, esta a versao segura.

export const COMO_FUNCIONA = {
  titulo: 'Como funciona',
  descricao: 'O Bichu é a rede dos pets do seu bairro: cadastro do pet, encontros, profissionais indicados e a rede que procura quando ele some.',
  hero: {
    titulo: 'Como funciona',
    lead: 'O Bichu é a rede dos pets do seu bairro. Você cadastra o seu pet, encontra quem mora perto e, se ele sumir, a rede procura com você.',
    alt: 'Ilustração de três pessoas abraçadas a um cão e a um gato, com árvores e prédios ao fundo.',
  },
  passosTitulo: 'Os passos',
  // P.3.2: ordem da home. O numero aparece porque a ordem e informacao.
  passos: [
    { icone: 'pets', titulo: 'A identidade do seu pet', texto: 'Você cadastra o pet no app com foto, sinais e cuidados.' },
    { icone: 'park', titulo: 'Eventos e encontros', texto: 'Encontros em praças e parques, criados pela equipe do Bichu e pela comunidade. Você faz check-in pelo app.' },
    { icone: 'verified', titulo: 'Profissionais que a comunidade indica', texto: 'Veterinários, banhistas, adestradores e passeadores entram no Bichu pela indicação de quem já foi atendido e aceitam o convite. A nota é de quem mora perto.' },
  ],
  sumiu: {
    titulo: 'E se o seu pet sumir, a rede procura com você.',
    itens: [
      { icone: 'qr_code_2', titulo: 'Quem encontra, avisa você', texto: 'Quem acha o pet lê o QR com a câmera do celular. Não precisa de app nem de cadastro: é um toque para avisar. Você recebe o aviso pelo Bichu, e essa pessoa nunca vê seu telefone nem seu endereço.' },
      { icone: 'notifications_active', titulo: 'Alerta para os tutores por perto', texto: 'Marque como perdido e o alerta vai para os tutores do Bichu num raio de 5 km, com a foto e o bairro, nunca o endereço. Um cartaz pronto para imprimir e compartilhar sai junto.' },
    ],
  },
  baixeApp: { titulo: 'Cadastre seu pet pelo app.' },
} as const;

export const PARA_PROFISSIONAIS = {
  titulo: 'Para profissionais',
  descricao: 'No Bichu, o perfil do profissional nasce da indicação de quem ele atendeu e ganha força com as avaliações de quem mora perto.',
  hero: {
    titulo: 'Para profissionais',
    lead: 'No Bichu, quem coloca você no mapa é o tutor que você atendeu.',
    alt: 'Ilustração de um cachorro sorrindo numa praça.',
  },
  indicacao: {
    titulo: 'Indicação da comunidade',
    lead: 'O perfil de um profissional nasce da indicação de um tutor e do aceite do profissional, e ganha força com as avaliações de quem mora perto.',
    manuscrito: 'Vizinhos também cuidam de pets.',
  },
} as const;

export const SOBRE = {
  titulo: 'Sobre',
  descricao: 'O Bichu é a rede dos pets: uma comunidade de tutores do mesmo bairro.',
  hero: {
    titulo: 'Sobre o Bichu',
    manuscrito: 'Pets conectam pessoas.',
    lead: 'O Bichu é a rede dos pets: uma comunidade de tutores do mesmo bairro, para encontrar quem mora perto, trocar indicação e cuidar dos pets juntos.',
    alt: 'Ilustração de três mulheres com um cão e um gato numa praça.',
  },
  // P.5.2 "Por que existe": versao segura, o bloco sai.
  naoFaz: {
    titulo: 'O que a gente não faz',
    texto: 'Não mostramos seu telefone nem seu endereço para quem acha o seu pet e não intermediamos recompensa. Recompensa é a porta do golpe do falso achador.',
  },
} as const;

export const CONTATO_PAGINA = {
  titulo: 'Contato',
  descricao: 'Fale com o Bichu pelo e-mail oi@bichu.app.',
  hero: { titulo: 'Contato', lead: 'Fale com a gente pelos canais abaixo.' },
  canaisTitulo: 'Canais',
  email: 'E-mail',
  // Imprensa: versao segura, fica fora (P.6.2).
  socorro: {
    titulo: 'Achou um pet com a plaquinha do Bichu?',
    texto: 'Leia o QR com a câmera do celular e toque em "Avisar o tutor". Se o QR não ler, digite o endereço que está impresso na plaquinha. Não precisa escrever para a gente: o aviso chega direto ao tutor.',
  },
} as const;
