// Textos da Home (index.html do prototipo, direcao A). Fonte:
// .jarvis/site-microcopy-revisada.md, secao "Prototipo v1", blocos P.1.1 a P.1.8,
// com a rodada 3. Onde havia [DECISAO DO CLIENTE], esta a versao segura.

export const HOME = {
  titulo: 'Bichu',
  descricao: 'Bichu é a rede dos pets: encontros no bairro e profissionais indicados e avaliados pela comunidade.',

  hero: {
    titulo: 'A rede dos pets.',
    // P.1.1: a frase manuscrita trocou para a assinatura da marca.
    manuscrito: 'Pets conectam pessoas.',
    lead: 'Uma comunidade de tutores do mesmo bairro: encontros com os pets e profissionais indicados e avaliados por quem mora perto.',
    alt: 'Ilustração de três pessoas abraçadas a um cão e a um gato, com árvores e prédios ao fundo.',
  },

  pilares: {
    titulo: 'Uma comunidade para quem vive com pets',
    itens: [
      {
        chave: 'eventos',
        titulo: 'Eventos e encontros',
        texto: 'Encontros em praças e parques para juntar os pets do bairro, criados pela equipe do Bichu e pela própria comunidade, com check-in e galeria de fotos.',
        link: { href: '#rede', texto: 'Como funcionam os encontros' },
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
    lead: 'Encontros em praças e parques, criados pela equipe do Bichu e pela própria comunidade. Você faz check-in quando chega, e as fotos do encontro ficam juntas na página do evento.',
    passos: [
      { icone: 'park', titulo: 'Encontros no bairro', texto: 'Passeios e encontros em praças e parques. O lugar aparece pelo nome da praça e do bairro, sem mapa.' },
      { icone: 'how_to_reg', titulo: 'Check-in no encontro', texto: 'Chegou, faz o check-in pelo app. A página do evento mostra quantas pessoas fizeram check-in, nunca quem.' },
      { icone: 'photo_library', titulo: 'Galeria do encontro', texto: 'As fotos ficam na página do evento, sem o nome de quem enviou.' },
    ],
    // P.1.3: versao segura, sem a linha do bairro.
    cartao: { titulo: 'Encontro no bairro', href: '/comunidade#eventos' },
    botao: { href: '/comunidade', texto: 'Conhecer a comunidade' },
  },

  vantagens: {
    titulo: 'Vantagens de estar na rede',
    itens: [
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

  profissionais: {
    titulo: 'Você cuida de pets?',
    texto: 'No Bichu, quem indica é o vizinho. Veja como a comunidade leva o seu trabalho a quem mora perto.',
    botao: { href: '/para-profissionais', texto: 'Para profissionais' },
  },

  baixeApp: {
    titulo: 'Entre na rede com o seu pet.',
    // P.1.7: versao segura.
    texto: 'Cadastre seu pet em poucos minutos.',
  },
} as const;
