export const HOME = {
  titulo: 'Bichu',
  descricao: 'Bichu é a comunidade dos pets: publique no Mural, encontre os eventos do bairro na Rede, veja na Comunidade quem os vizinhos indicam e, quando um pet se perde, conte com os tutores por perto para achar.',

  hero: {
    titulo: 'A rede dos pets.',
    manuscrito: 'Pets conectam pessoas.',
    lead: 'Publique os momentos do seu pet no Mural, encontre os eventos e os tutores do bairro na Rede e, na Comunidade, os profissionais que os vizinhos indicam. E, quando um pet se perde, os tutores por perto ajudam a achar.',
    alt: 'Ilustração de três pessoas abraçadas a um cachorro e a um gato, com árvores e prédios ao fundo.',
  },

  pilares: {
    titulo: 'Uma comunidade para quem vive com pets',
    itens: [
      {
        chave: 'eventos',
        titulo: 'Eventos no bairro, na Rede',
        texto: 'Eventos em praças e parques para juntar os pets do bairro, criados pela equipe do Bichu e pela própria comunidade, com galeria de fotos.',
        link: { href: '#rede', texto: 'Como funcionam os eventos' },
      },
      {
        chave: 'profissionais',
        titulo: 'Indicados e avaliados, na Comunidade',
        texto: 'Veterinários, clínicas, hospitais, banhistas e adestradores indicados pelos vizinhos, com avaliação por nota e perfil oficial do profissional.',
        link: { href: '/comunidade#profissionais', texto: 'Como funciona a indicação' },
      },
    ],
  },

  rede: {
    sobretitulo: 'Rede',
    titulo: 'Na Rede ficam os eventos, e os pets do bairro se encontram na praça.',
    lead: 'Eventos em praças e parques, criados pela equipe do Bichu e pela própria comunidade. As fotos ficam juntas na página do evento, e é na Rede também que você busca outros tutores.',
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
        titulo: 'Publique os momentos do seu pet no Mural',
        texto: 'O Mural é a linha do tempo do Bichu: uma foto e um texto curto. Você escolhe o que publicar, e descreve a foto para quem usa leitor de tela.',
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
        titulo: 'Em Pets, perdido e achado a 5 km',
        texto: 'Os pets perdidos ficam na seção Pets. Marcou como perdido, os tutores do Bichu num raio de 5 km recebem o alerta com a foto. Quem acha a plaquinha avisa você pelo Bichu, sem precisar de conta nem de app.',
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
    texto: 'O aviso chega pelo Bichu, sem exigir conta de quem achou, e a conversa também acontece pelo Bichu, no AuAu. Telefone e endereço ficam de fora.',
  },

  loja: {
    titulo: 'A Loja do Bichu, com cupom de desconto.',
    texto: 'Na Loja ficam os produtos de sites parceiros, escolhidos pela equipe. Ajude a mantermos o Bichu gratuito e ainda ganhe descontos.',
    ressalva: 'A vitrine é escolhida a dedo pela equipe do Bichu e leva ao site da loja parceira. A compra é feita no site do parceiro: o Bichu não é o vendedor e não controla preço, estoque nem entrega.',
  },

  profissionais: {
    titulo: 'Você cuida de pets?',
    texto: 'No Bichu, quem indica é o vizinho. Veja como a comunidade leva o seu trabalho a quem mora perto.',
    botao: { href: '/para-profissionais', texto: 'Para profissionais' },
  },

  // PERGUNTAS FREQUENTES (cliente, 28/11/2026). A lista e DADO, nao marcacao:
  // pergunta nova entra como um objeto a mais aqui, sem mexer em `index.astro`
  // nem no CSS. A ordem da lista e a ordem da pagina.
  //
  // O que entra aqui passa pela mesma regra do resto do site: nao pode
  // prometer o que `api/openapi.yaml` e `migrations/` nao fazem.
  //
  // UMA PERGUNTA DO LOTE ESTA RETIDA, e isso e decisao de 28/11/2026 e nao
  // esquecimento: "Posso cadastrar o meu proprio negocio?". Hoje a resposta
  // teria de ser NAO, porque autocadastro nao existe em rota nenhuma -- o
  // unico `insertInto('professionals')` do repositorio esta em
  // `src/modules/professionals/adapters/persistence/kysely-diretorio-administrativo.ts`,
  // que e o painel, e `ORIGEM_DO_PAINEL` grava sempre `import`.
  //
  // O GATILHO DA VOLTA: ela entra junto com o formulario de cadastro de
  // profissional, pedido pelo cliente em 28/11/2026 e em desenho noutra
  // frente. Quem fechar esse formulario acrescenta a pergunta como UM objeto
  // a mais na lista abaixo, com a resposta que o formulario tornar verdadeira.
  // Pedido adiado nao volta sozinho: este paragrafo e o lembrete.
  faq: {
    sobretitulo: 'Perguntas frequentes',
    titulo: 'As dúvidas que mais chegam para a gente',
    itens: [
      {
        pergunta: 'O que é o Bichu?',
        resposta: 'O Bichu é a rede dos pets: uma comunidade de tutores que cuidam dos pets uns dos outros, com ajuda para pets perdidos, eventos e indicações de profissionais.',
      },
      {
        pergunta: 'Como o Bichu ajuda a encontrar um pet perdido?',
        resposta: 'Você marca o pet como perdido no app e a comunidade recebe o alerta. Quem encontrou conversa com você pelo chat do Bichu, sem necessidade de trocar telefone nem endereço.',
      },
      {
        pergunta: 'O Bichu cobra recompensa pelo pet encontrado?',
        resposta: 'Não. No Bichu, ajudar não custa nada: sem cobrança e sem recompensa. O Bichu também não intermedeia pagamento.',
      },
      {
        pergunta: 'Que tipo de profissional posso encontrar no Bichu?',
        resposta: 'Veterinários, banho e tosa, creches, adestradores, passeadores e outros profissionais e estabelecimentos que cuidam de pets.',
      },
      {
        pergunta: 'O que escrever em uma avaliação?',
        resposta: 'Conte como foi a sua experiência: atendimento, cuidado com o pet, pontualidade e ambiente. Seja claro, respeitoso e evite dados pessoais.',
      },
    ],
  },

  baixeApp: {
    titulo: 'Entre na rede com o seu pet.',
    texto: 'Cadastre seu pet em poucos minutos.',
  },
} as const;
