export const COMO_FUNCIONA = {
  titulo: 'Como funciona',
  descricao: 'O Bichu é a rede dos pets do seu bairro: cadastro do pet, o Mural das publicações, os eventos na Rede, os indicados na Comunidade e os tutores por perto quando um pet some.',
  hero: {
    titulo: 'Como funciona',
    lead: 'O Bichu é a rede dos pets do seu bairro. Você cadastra o seu pet, encontra quem mora perto e, se ele sumir, os tutores por perto procuram com você.',
    alt: 'Ilustração de três pessoas abraçadas a um cachorro e a um gato, com árvores e prédios ao fundo.',
  },

  // O PASSO A PASSO DO CADASTRO (cliente, 28/11/2026), texto dele.
  //
  // Ele e quem fica `numerados`, e os tres blocos de baixo DEIXARAM de ser:
  // numero em lista e promessa de ordem, e identidade, eventos e indicacao nao
  // acontecem em sequencia -- este aqui acontece. Com os dois numerados a
  // pagina tinha duas listas comecando em 1, uma ao lado da outra.
  //
  // SAO QUATRO E ELE ESCREVEU CINCO. O passo da indicacao ficou FORA, e a
  // decisao e do cliente, nao deste arquivo: ele dizia que cadastrar uma
  // indicacao faz o profissional passar a aparecer para a comunidade, e
  // `POST /v1/directory/suggestions` diz o contrario no contrato -- "a
  // sugestao nasce `pending` e NAO publica nada, nem agora nem
  // automaticamente depois". Quem publica e o painel, aprovando
  // (`approveAdminDirectorySuggestion`). Publicar o passo como escrito
  // prometeria o que o produto nao faz E contradiria `passos` logo abaixo,
  // que fala de convite e aceite. Passo novo entra como UM objeto aqui.
  cadastroTitulo: 'Como funciona',
  cadastroSobretitulo: 'Passo a passo',
  cadastro: [
    { icone: 'how_to_reg', titulo: 'Baixe o app e cadastre-se.', texto: 'Crie sua conta no Bichu e cadastre seu pet em poucos minutos.' },
    { icone: 'location_on', titulo: 'Encontre profissionais e estabelecimentos.', texto: 'Busque pelo tipo de serviço, como veterinário, banho e tosa ou creche.' },
    { icone: 'visibility', titulo: 'Veja o perfil e as avaliações.', texto: 'Cada perfil reúne informações, notas e os comentários de outros tutores para ajudar na sua escolha.' },
    { icone: 'star', titulo: 'Avalie.', texto: 'Conte como foi o atendimento, com uma nota de 1 a 5 e um comentário.' },
  ],

  passosTitulo: 'O que você encontra no Bichu',
  passos: [
    { icone: 'pets', titulo: 'A identidade do seu pet', texto: 'Você cadastra o pet no app com foto, sinais e cuidados. Os pets perdidos ficam na seção Pets.' },
    { icone: 'park', titulo: 'Eventos no bairro, na Rede', texto: 'Eventos em praças e parques, criados pela equipe do Bichu e pela comunidade. É na Rede também que você busca outros tutores.' },
    { icone: 'verified', titulo: 'Na Comunidade, quem os vizinhos indicam', texto: 'Veterinários, clínicas, hospitais, banhistas, adestradores e passeadores entram no Bichu pela indicação de quem já foi atendido e aceitam o convite. A nota é de quem mora perto.' },
  ],
  sumiu: {
    titulo: 'E se o seu pet sumir, os tutores por perto procuram com você.',
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
    lead: 'O perfil de um profissional nasce da indicação de um tutor e do aceite do profissional, e ganha força com as avaliações de quem mora perto. Ele aparece na Comunidade, junto das clínicas e dos hospitais indicados.',
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
    alt: 'Ilustração de três mulheres com um cachorro e um gato numa praça.',
  },
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
  socorro: {
    titulo: 'Achou um pet com a plaquinha do Bichu?',
    texto: 'Leia o QR com a câmera do celular e toque em "Avisar o tutor". Se o QR não ler, digite o endereço que está impresso na plaquinha. Não precisa escrever para a gente: o aviso chega direto ao tutor.',
  },
} as const;
