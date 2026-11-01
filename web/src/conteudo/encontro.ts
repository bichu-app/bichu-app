export const ROTULOS = {
  idade: {
    any: 'Qualquer idade',
    from_4_months: 'A partir de 4 meses',
    from_1_year: 'A partir de 1 ano',
    up_to_1_year: 'Até 1 ano',
  } as Record<string, string>,
  /** `NetworkEventAmenity`. */
  estrutura: {
    level_ground_or_ramp: 'Piso plano ou rampa',
    accessible_restroom: 'Banheiro acessível',
    public_restroom_nearby: 'Banheiro público próximo',
    shade: 'Sombra',
    benches: 'Bancos',
    dog_water_fountain: 'Bebedouro para cachorros',
    parking_nearby: 'Estacionamento próximo',
  } as Record<string, string>,
  /** `NetworkEventBringItem`. */
  levar: {
    water: 'Água',
    water_bowl: 'Pote de água',
    leash: 'Guia',
    poop_bags: 'Saquinhos para cocô',
    treats: 'Petisco',
    towel: 'Toalha',
    vaccination_card: 'Carteira de vacinação',
    toy: 'Brinquedo',
  } as Record<string, string>,
} as const;

export const ENCONTRO = {
  tituloDaAba: (titulo: string) => titulo,
  descricao: (titulo: string, regiao: string) =>
    `${titulo} — um encontro de tutores e pets em ${regiao}. Veja os detalhes no Bichu.`,

  sobretitulo: 'Encontro da comunidade',
  /** O acento manuscrito da folha. Decorativo, e redundante com o texto ao lado. */
  manuscrito: 'vamos juntos?',

  /** Os blocos da pagina. */
  quando: 'Quando',
  onde: 'Onde',
  entrada: 'Entrada',
  sobre: 'Sobre o encontro',
  quemPodeIr: 'Quem pode ir',
  oQueLevar: 'O que levar',
  estrutura: 'O que tem no local',
  observacoes: 'Observações de quem organiza',
  fotos: 'Fotos do local',
  convite: 'Comprar ingresso',
  instagram: 'Ver no Instagram',

  /** Porte: o app escreve "Todos os portes" quando os quatro estao marcados. */
  todosOsPortes: 'Todos os portes',
  portes: (lista: string) => `Portes ${lista}`,
  vacinaExigida: 'Carteira de vacinação em dia é exigida.',
  areaCercada: 'O local tem área cercada para cachorros soltos.',
  semAreaCercada: 'Não há área cercada: mantenha o cachorro na guia.',

  /**
   * O cartao de cuidados. As MESMAS quatro frases do aplicativo (UX 28.7.1),
   * porque quem chega pelo link e quem chega pelo app vao ao mesmo encontro, e
   * duas listas de cuidados divergiriam na primeira revisao.
   */
  cuidados: 'Combinados do encontro',
  cuidadosLista: (areaCercada: boolean) => [
    'Recolha o cocô e descarte em local adequado.',
    areaCercada
      ? 'Na área cercada, o cachorro pode ficar solto. Fora dela, na guia.'
      : 'Mantenha o cachorro na guia o tempo todo.',
    'Se o seu cachorro parecer desconfortável, afaste-se do grupo com ele por um tempo.',
    'Fêmea no cio fica em casa.',
  ],

  /**
   * O caminho para o aplicativo, que e o segundo trabalho da pagina.
   *
   * **Sem link de loja e sem selo**, pela regra 1 da revisao de microcopy do
   * site: o app nao esta publicado, e `EmBreveLojas` e quem diz isso num lugar
   * so. No dia em que houver endereco de loja, ele entra la e esta pagina
   * ganha o botao sem mudar uma palavra.
   */
  chamada: {
    titulo: 'Os encontros acontecem no Bichu',
    texto:
      'O Bichu é onde tutores do bairro se encontram, indicam profissionais de '
      + 'confiança e ajudam a achar quem se perdeu. Os encontros da comunidade '
      + 'são combinados por aqui.',
  },

  /**
   * O endereco do lugar NAO sai desta pagina. Ver `linhaDoLugar`.
   *
   * **"para quem tem conta", e nao "para quem confirma presenca"** (21/10/2026).
   * A frase anterior afirmava duas coisas falsas:
   *
   *   1. **O ato nao existe.** Check-in e lista de presenca sairam desta versao
   *      por decisao do cliente (ADR-0027 12.4): `checkInNetworkEvent` nao esta
   *      no contrato, e `app/lib/telas/rede/encontro_da_rede.dart` nao tem o
   *      fluxo. A frase mandava a pessoa fazer uma coisa que nao ha onde fazer.
   *   2. **Nao ha grupo restrito.** `getNetworkEventLocation` exige
   *      `bearerAuth` e nada mais: QUALQUER conta le o endereco de um encontro
   *      publico, nao so quem fez algo. Dizer o contrario prometia ao
   *      organizador uma protecao que o contrato nao da.
   *
   * O que a frase NAO pode voltar a dizer esta na isca
   * `a frase do endereco nao promete confirmacao de presenca` em
   * `tests/unidade/telas-do-encontro.test.ts`.
   */
  semEndereco:
    'O endereço completo fica no aplicativo, para quem tem conta.',

  /**
   * A TELA UNICA das seis situacoes em que nao ha encontro para mostrar (ver
   * `TelaDoEncontro` em `dominio/telas-do-encontro.ts`).
   *
   * **Ela nao conta qual das seis aconteceu**, de proposito, e por isso a frase
   * e curta e nao tem variacao: cancelado, encerrado, privado, retirado, em
   * revisao e inexistente leem exatamente este texto. Dizer qual contaria a um
   * estranho o que a moderacao fez, ou que aquele `slug` existiu.
   *
   * O que ela TEM e saida: a agenda da comunidade, que e publica e tem outros
   * encontros.
   */
  indisponivel: {
    titulo: 'Este encontro não está disponível',
    texto:
      'O link pode ter expirado, ou o encontro já aconteceu. Veja como funcionam '
      + 'os encontros da comunidade e encontre outros perto de você.',
    acao: 'Ver a comunidade',
    acaoHref: '/comunidade',
  },

  espere: {
    titulo: 'Muita gente ao mesmo tempo',
    texto: 'Aguarde alguns instantes e abra o link de novo.',
  },
  foraDoAr: {
    titulo: 'Não conseguimos carregar o encontro',
    texto: 'Foi um problema nosso, e não o seu link. Tente de novo em instantes.',
  },
  erro: {
    titulo: 'Algo deu errado',
    texto: 'Tente abrir o link de novo. Se continuar, fale com a gente.',
  },
} as const;
