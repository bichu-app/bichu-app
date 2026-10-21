// Os textos de `/encontro/{slug}`, a pagina publica do encontro (emenda 4 do
// ADR-0017, decisao do cliente de 21/10/2026).
//
// Num arquivo so, e nao espalhados pelo `.astro`, pelo mesmo motivo dos outros
// `conteudo/`: microcopy que mora no meio da marcacao e microcopy que ninguem
// revisa. `tests/unidade/textos.test.ts` varre este diretorio.
//
// ## A VOZ AQUI E A DO SITE, e nao a do app
//
// O app e "Serio": ele e ferramenta de quem ja esta dentro. O site e a folha de
// identidade -- ilustracao, blob, manuscrito, patinha --, porque quem chega
// nele ainda nao conhece o Bichu. Esta pagina e o caso extremo dessa diferenca:
// ela e aberta por alguem que recebeu um link num grupo de WhatsApp e nunca
// ouviu falar do produto, e ela tem **dois trabalhos**: fazer a pessoa querer ir
// ao encontro, e mostrar o caminho para o aplicativo.

/** Os rotulos dos enums do contrato, com as palavras EXATAS do aplicativo. */
export const ROTULOS = {
  /** `NetworkEventDogAge`. */
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
    dog_water_fountain: 'Bebedouro para cães',
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
  /**
   * O titulo da aba e do cartao de pre-visualizacao. **Leva o titulo do
   * encontro**, porque e esse cartao que aparece no grupo de WhatsApp -- e era
   * exatamente ele que, antes desta pagina existir, dizia "Pagina nao
   * encontrada - Bichu".
   *
   * **Sem a marca aqui.** `Base.astro` monta `${titulo} · Bichu` por conta
   * dela, e por um instante esta funcao tambem a acrescentava: o `og:title`
   * medido saiu `Passeio matinal na Benedito Calixto · Bichu · Bichu`. O
   * defeito e pequeno e aparece no lugar mais visivel que esta pagina tem --
   * o cartao no grupo de WhatsApp, que e o motivo de ela existir.
   */
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
  areaCercada: 'O local tem área cercada para cães soltos.',
  semAreaCercada: 'Não há área cercada: mantenha o cão na guia.',

  /**
   * O cartao de cuidados. As MESMAS quatro frases do aplicativo (UX 28.7.1),
   * porque quem chega pelo link e quem chega pelo app vao ao mesmo encontro, e
   * duas listas de cuidados divergiriam na primeira revisao.
   */
  cuidados: 'Combinados do encontro',
  cuidadosLista: (areaCercada: boolean) => [
    'Recolha o cocô e descarte em local adequado.',
    areaCercada
      ? 'Na área cercada, o cão pode ficar solto. Fora dela, na guia.'
      : 'Mantenha o cão na guia o tempo todo.',
    'Se o seu cão parecer desconfortável, afaste-se do grupo com ele por um tempo.',
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

  /** O endereco do lugar NAO sai desta pagina. Ver `linhaDoLugar`. */
  semEndereco:
    'O endereço completo fica no aplicativo, para quem confirma presença.',

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
