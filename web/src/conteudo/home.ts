export const HOME = {
  titulo: 'Bichu',
  descricao: 'Bichu é a comunidade dos pets: publique os momentos do seu pet, conecte-se com os tutores do bairro, encontre os pets na praça e, quando um se perde, a rede ajuda a achar.',

  hero: {
    titulo: 'A rede dos pets.',
    manuscrito: 'Pets conectam pessoas.',
    lead: 'Publique os momentos do seu pet, conecte-se com os tutores do bairro, encontre os pets na praça e os profissionais que os vizinhos indicam. E, quando um pet se perde, a rede ajuda a achar.',
    alt: 'Ilustração de três pessoas abraçadas a um cachorro e a um gato, com árvores e prédios ao fundo.',
  },

  pilares: {
    titulo: 'Uma comunidade para quem vive com pets',
    itens: [
      {
        chave: 'eventos',
        titulo: 'Eventos no bairro',
        texto: 'Eventos em praças e parques para juntar os pets do bairro, criados pela equipe do Bichu e pela própria comunidade, com galeria de fotos.',
        link: { href: '#rede', texto: 'Como funcionam os eventos' },
      },
      {
        chave: 'profissionais',
        titulo: 'Profissionais indicados e avaliados',
        texto: 'Veterinários, banhistas e adestradores indicados pelos vizinhos, com avaliação por nota e perfil oficial do profissional.',
        link: { href: '/comunidade#profissionais', texto: 'Como funciona a indicação' },
      },
    ],
  },

  rede: {
    sobretitulo: 'Rede',
    titulo: 'Na Rede, os pets do bairro se encontram na praça.',
    lead: 'Eventos em praças e parques, criados pela equipe do Bichu e pela própria comunidade. As fotos ficam juntas na página do evento.',
    passos: [
      { icone: 'park', titulo: 'Eventos no bairro', texto: 'Passeios e eventos em praças e parques. O lugar aparece pelo nome da praça e do bairro, sem mapa.' },
      { icone: 'photo_library', titulo: 'Galeria do evento', texto: 'As fotos ficam na página do evento, sem o nome de quem enviou.' },
    ],
    cartao: { titulo: 'Evento no bairro', href: '/comunidade#eventos' },
    botao: { href: '/comunidade', texto: 'Conhecer a comunidade' },
  },

  vantagens: {
    titulo: 'O que você faz no Bichu',
    itens: [
      {
        icone: 'photo_camera',
        titulo: 'Publique os momentos do seu pet',
        texto: 'No Mural, uma foto e um texto curto. Você escolhe o que publicar, e descreve a foto para quem usa leitor de tela.',
      },
      {
        icone: 'group',
        titulo: 'Conecte-se com os tutores do bairro',
        texto: 'Você pede conexão, a outra pessoa aceita. Sem conexão, o perfil dela mostra o nome, quantos pets tem e quantas conexões. Depois do aceite, você vê as fotos e as publicações dela.',
      },
      {
        icone: 'qr_code_2',
        titulo: 'Identidade com QR na coleira',
        texto: 'Cada pet ganha uma página e um QR para a coleira. Quem encontrar lê com a câmera do celular, sem precisar de app.',
      },
      {
        icone: 'notifications_active',
        titulo: 'Perdido e achado a 5 km',
        texto: 'Marcou como perdido, os tutores do Bichu num raio de 5 km recebem o alerta com a foto. Quem acha a plaquinha avisa você pelo Bichu, sem precisar de conta nem de app.',
      },
      {
        icone: 'badge',
        titulo: 'RG Animal guardado',
        texto: 'Já tem o RG Animal do SinPatinhas? Guarde o número no cadastro do pet. O Bichu só guarda o número: não consulta, não valida e não altera nada no registro oficial.',
      },
    ],
  },

  privacidade: {
    titulo: 'Quem acha seu pet avisa você. E nunca vê seu telefone nem seu endereço.',
    texto: 'O aviso chega pelo Bichu, sem exigir conta de quem achou, e a conversa também acontece pelo Bichu. Telefone e endereço ficam de fora.',
  },

  loja: {
    titulo: 'A Loja do Bichu, com cupom de desconto.',
    texto: 'Ajude a mantermos o Bichu gratuito e ainda ganhe descontos comprando em nossas lojas parceiras.',
    ressalva: 'A vitrine é escolhida a dedo pela equipe do Bichu e leva ao site da loja parceira. A compra é feita no site do parceiro: o Bichu não é o vendedor e não controla preço, estoque nem entrega.',
  },

  profissionais: {
    titulo: 'Você cuida de pets?',
    texto: 'No Bichu, quem indica é o vizinho. Veja como a comunidade leva o seu trabalho a quem mora perto.',
    botao: { href: '/para-profissionais', texto: 'Para profissionais' },
  },

  baixeApp: {
    titulo: 'Entre na rede com o seu pet.',
    texto: 'Cadastre seu pet em poucos minutos.',
  },
} as const;
