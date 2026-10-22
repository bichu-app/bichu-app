// Textos de /comunidade (comunidade.html do prototipo). Fonte: secao
// "Prototipo v1", blocos P.2.1 a P.2.8, versao segura onde ha decisao do cliente.

export const COMUNIDADE = {
  titulo: 'Comunidade',
  descricao: 'Eventos na praça com os pets do bairro e profissionais indicados e avaliados por quem mora perto.',

  hero: {
    sobretitulo: 'Comunidade',
    titulo: 'Os pets do bairro e as pessoas que cuidam deles.',
    lead: 'No Bichu, a comunidade se encontra na praça e indica os profissionais em quem confia, sem mostrar o endereço de ninguém.',
    alt: 'Ilustração de três mulheres fazendo carinho num cachorro numa praça, com um gato ao lado, bandeirinhas, árvores e prédios ao fundo.',
  },

  eventos: {
    sobretitulo: 'Rede',
    titulo: 'Eventos na praça, com os pets do bairro',
    lead: 'Passeios e eventos em praças e parques, criados pela equipe do Bichu e pela própria comunidade.',
    passos: [
      { icone: 'event', titulo: 'Ache um evento perto de você', texto: 'Os eventos aparecem no app com data, horário, o nome da praça ou do parque e o bairro. Sem mapa e sem endereço de ninguém.' },
      { icone: 'how_to_reg', titulo: 'Faça check-in', texto: 'Chegou, faz o check-in pelo app. O check-in é seu, não do seu pet, e a página do evento mostra só quantas pessoas fizeram check-in.' },
      { icone: 'photo_library', titulo: 'Veja a galeria', texto: 'As fotos ficam reunidas na página do evento, sem o nome de quem enviou.' },
      { icone: 'add_location_alt', titulo: 'Proponha um evento', texto: 'Quem tem conta no Bichu pode propor um evento numa praça ou num parque do bairro. Local público, sempre.' },
    ],
    exemplo: {
      nota: 'Exemplo ilustrativo',
      data: 'Sábado, 9h',
      titulo: 'Evento de cachorros na praça',
      // P.2.2: versao segura, exemplo generico que nao coincide com lugar real.
      lugar: 'Praça do Coreto · seu bairro',
      vao: '12 pessoas vão',
      origem: 'Criado pela equipe do Bichu',
      checkin: 'Check-in pelo app',
      galeria: 'Fotos do evento',
      galeriaRotulo: 'Fotos ilustrativas do evento',
    },
  },

  garantias: {
    titulo: 'O que ninguém vê num evento',
    lead: 'O Bichu não usa o evento para mostrar onde você mora nem quais pets são seus.',
    itens: [
      { icone: 'format_list_numbered', titulo: 'Não existe lista de quem foi', texto: 'A página do evento mostra quantas pessoas fizeram check-in, e não os nomes delas.' },
      { icone: 'pets', titulo: 'O check-in é da pessoa, não do pet', texto: 'A página do evento não liga nenhum pet a nenhum tutor.' },
      { icone: 'hide_image', titulo: 'Foto sem autor', texto: 'As fotos pertencem ao evento. Quem enviou não aparece na galeria, mas a foto mostra o que estiver nela: envie só o que você aceita que o bairro veja.' },
      { icone: 'location_off', titulo: 'Lugar pelo nome, sem mapa', texto: 'O evento mostra o nome da praça ou do parque e o bairro. Nunca um ponto no mapa.' },
    ],
  },

  profissionais: {
    titulo: 'Quem indica é o vizinho',
    lead: 'Veterinários, banhistas, adestradores e passeadores indicados e avaliados por quem mora perto.',
    manuscrito: 'Vizinhos também cuidam de pets.',
    passos: [
      { icone: 'person_add', titulo: 'Indique alguém em quem você confia', texto: 'Você indica, o Bichu convida. O perfil do profissional só aparece depois que ele aceita.' },
      { icone: 'star', titulo: 'Avalie com nota', texto: 'Nota de 1 a 5 e um comentário. A avaliação é sua: o profissional pode responder, mas não pode apagar.' },
      { icone: 'verified', titulo: 'Perfil oficial', texto: 'O perfil diz o que foi conferido: CRMV, CNPJ ou telefone do estabelecimento.' },
    ],
    exemplo: {
      nota: 'Exemplo ilustrativo',
      nome: 'Nome do profissional',
      atividade: 'Veterinária',
      selo: 'CRMV verificado',
      estrelasRotulo: 'Exemplo de avaliação: 4 de 5',
      avaliacoes: 'Avaliações da comunidade',
      resposta: 'O profissional pode responder a cada avaliação.',
    },
    botao: { href: '/para-profissionais', texto: 'Para profissionais' },
  },

  faleConosco: {
    titulo: 'Tem uma ideia de evento no seu bairro?',
    texto: 'Proponha pelo app, ou escreva para a gente.',
  },

  baixeApp: {
    titulo: 'Entre na rede com o seu pet.',
    texto: 'Cadastre seu pet em poucos minutos.',
  },
} as const;
