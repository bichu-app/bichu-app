/**
 * Redação de canal mediado.
 *
 * O produto promete, numa tela já aprovada (`BICHUS-72`, critério 1), que
 * **telefone e endereço não aparecem para ninguém**. Esta função é onde essa
 * promessa é cumprida, e ela roda **antes de gravar** — nunca na leitura.
 *
 * O "antes de gravar" não é preferência de arquitetura. Dado sensível gravado
 * em claro já vazou para todo backup, toda réplica e todo log de replicação
 * antes de alguém pensar em redigir na saída; e basta uma consulta nova, escrita
 * por alguém que não conhece a regra, para publicar o que a leitura redigia.
 *
 * ## Por que não é só um punhado de expressões regulares
 *
 * Porque quem quer furar não escreve o telefone do jeito fácil. Os critérios 13
 * a 16 de `BICHUS-43` exigem que a redação sobreviva a três evasões, e as três
 * quebram a expressão regular ingênua de formas diferentes:
 *
 * - **Largura zero.** `1<zwsp>1<zwsp>9...` tem os dígitos na ordem certa e
 *   nenhuma regex de dígitos consecutivos casa.
 * - **Homóglifo.** `-` cirílico, `О` maiúsculo grego, dígitos de largura plena
 *   (`１１９`): parecem idênticos na tela e são outros pontos de código.
 * - **Número por extenso.** `nove nove um dois tres` é um telefone para o olho
 *   humano e é texto para a máquina.
 *
 * A saída atravessa essas três por construção: o texto é **normalizado para a
 * detecção** (largura zero cai, homóglifo vira o ASCII equivalente, palavra de
 * número vira dígito) e os trechos achados são mapeados **de volta às posições
 * do texto original**. Quem é redigido é o original, com a grafia que a pessoa
 * usou; quem é analisado é a forma canônica.
 *
 * ## O que a dica NÃO contém
 *
 * `hint` é um rótulo genérico, nunca um pedaço do que foi retirado. Devolver
 * "retirei o telefone 11 9xxxx-xxxx" entregaria pela porta do lado exatamente o
 * dado que a função existe para reter — e essa resposta vai para a tela, para o
 * log de aplicação e para a trilha de auditoria.
 */

/** Um trecho retirado. Espelha `TrechoRedigido` de `shared/db/schema.ts`. */
export interface TrechoRedigido {
  kind: 'phone' | 'email' | 'address' | 'external_link';
  /** Rótulo genérico para a tela. **Nunca** o conteúdo retirado. */
  hint: string;
}

export interface ResultadoDaRedacao {
  /** O texto já sem os trechos. É este que vai para o banco. */
  texto: string;
  /** O que saiu, na ordem em que aparecia. Vazio quando nada saiu. */
  retirados: TrechoRedigido[];
}

/** O que substitui o trecho. Curto de propósito: o campo tem 280 caracteres. */
const MARCA: Record<TrechoRedigido['kind'], string> = {
  phone: '[telefone removido]',
  email: '[e-mail removido]',
  address: '[endereço removido]',
  external_link: '[link removido]',
};

const DICA: Record<TrechoRedigido['kind'], string> = {
  phone: 'um número de telefone',
  email: 'um endereço de e-mail',
  address: 'um endereço',
  external_link: 'um link externo',
};

/**
 * Pontos de código que não desenham nada e servem para partir uma sequência.
 * Incluem o juntador de largura zero e as marcas de direção, que aparecem em
 * texto colado de aplicativo de mensagem sem que ninguém tenha digitado.
 */
const LARGURA_ZERO = /[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/u;

/**
 * Homóglifos: o que parece ASCII na tela e não é.
 *
 * A lista é deliberadamente curta e cobre o que aparece de verdade — dígitos e
 * letras de largura plena, cirílicos que se confundem com latinos, e os traços
 * e pontos tipográficos. Uma tabela Unicode inteira aqui seria varredura sem
 * dono; o portão que sustenta esta lista é a suíte de iscas, não o tamanho dela.
 */
const HOMOGLIFOS: Record<string, string> = {
  // Dígitos de largura plena.
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  // Latinos de largura plena que aparecem em endereço e link.
  'ａ': 'a', 'ｃ': 'c', 'ｅ': 'e', 'ｍ': 'm', 'ｏ': 'o',
  'ｒ': 'r', 'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', '．': '.',
  '＠': '@', '：': ':', '／': '/', '－': '-',
  // Cirílicos e gregos que passam por latinos.
  'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p',
  'х': 'x', 'у': 'y', 'і': 'i', 'ѕ': 's', 'ο': 'o',
  'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ο': 'o', 'Ρ': 'p',
  // Traços e pontos tipográficos usados para separar dígitos.
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  '·': '.', '•': '.', '․': '.',
};

/**
 * Palavra de número para dígito. Vai até `nove` porque é isso que constrói um
 * telefone soletrado; `dez` em diante é quantidade ("dez gotas"), não dígito.
 *
 * `meia` está aqui porque é como se fala 6 ao ditar número no Brasil, e é
 * justamente a forma que quem quer escapar usa.
 */
const NUMERO_POR_EXTENSO: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3',
  quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7',
  oito: '8', nove: '9',
};

/** `@` e `.` escritos por extenso, o disfarce mais comum de e-mail e de link. */
const SIMBOLO_POR_EXTENSO: Record<string, string> = {
  arroba: '@',
  ponto: '.',
};

/**
 * Uma unidade de texto: um pedaço do ORIGINAL e a forma canônica dele.
 *
 * Existe para que a detecção rode sobre a forma canônica e o corte aconteça no
 * original. Sem este par, redigir `nove nove um` obrigaria a adivinhar quantos
 * caracteres do original correspondem a `991`.
 */
interface Unidade {
  inicio: number;
  fim: number;
  canonico: string;
  /**
   * Verdadeiro quando esta unidade nasceu de uma PALAVRA que virou símbolo
   * (`arroba` → `@`, `ponto` → `.`). Quem escreve assim escreve com espaço em
   * volta, e `joao @ exemplo . com` não casa com nenhum detector de e-mail:
   * o espaço em torno do símbolo precisa sumir da forma canônica, e só em
   * torno DESTE símbolo — apagar espaço em volta de todo ponto colaria as
   * frases da nota umas nas outras.
   */
  deSimbolo?: boolean;
}

function tirarAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Quebra o original em unidades e devolve, junto, a forma canônica inteira e o
 * mapa de cada posição canônica para a unidade que a originou.
 */
function canonizar(original: string): {
  canonico: string;
  mapa: number[];
  unidades: Unidade[];
} {
  const unidades: Unidade[] = [];
  const palavra = /[\p{L}]/u;

  let i = 0;
  while (i < original.length) {
    const c = original[i]!;

    if (LARGURA_ZERO.test(c)) {
      // Some da forma canônica e continua existindo no original: por isso a
      // unidade é criada com `canonico` vazio, em vez de ser descartada. Ela
      // precisa entrar na faixa cortada, senão o caractere invisível sobra no
      // meio da marca de remoção.
      unidades.push({ inicio: i, fim: i + 1, canonico: '' });
      i += 1;
      continue;
    }

    if (palavra.test(c)) {
      let j = i;
      while (j < original.length && (palavra.test(original[j]!) || LARGURA_ZERO.test(original[j]!))) {
        j += 1;
      }
      const bruta = original.slice(i, j);
      const limpa = tirarAcento(bruta.replace(new RegExp(LARGURA_ZERO.source, 'gu'), '')).toLowerCase();
      const traduzida = NUMERO_POR_EXTENSO[limpa] ?? SIMBOLO_POR_EXTENSO[limpa];

      if (traduzida !== undefined) {
        // A palavra inteira vira UMA unidade de um caractere canônico. É o que
        // permite `nove nove` virar `99` e o corte voltar às oito posições do
        // original, e não às duas.
        unidades.push({
          inicio: i,
          fim: j,
          canonico: traduzida,
          deSimbolo: SIMBOLO_POR_EXTENSO[limpa] !== undefined,
        });
      } else {
        for (let k = i; k < j; k += 1) {
          const ch = original[k]!;
          const mapeado = HOMOGLIFOS[ch] ?? tirarAcento(ch).toLowerCase();
          unidades.push({ inicio: k, fim: k + 1, canonico: LARGURA_ZERO.test(ch) ? '' : mapeado });
        }
      }
      i = j;
      continue;
    }

    unidades.push({ inicio: i, fim: i + 1, canonico: HOMOGLIFOS[c] ?? c.toLowerCase() });
    i += 1;
  }

  // Espaço colado num símbolo escrito por extenso sai da forma canônica. O
  // original não é tocado: quem some é só a representação analisada.
  for (let n = 0; n < unidades.length; n += 1) {
    if (!unidades[n]!.deSimbolo) continue;
    for (const vizinho of [n - 1, n + 1]) {
      const u = unidades[vizinho];
      if (u && /^\s+$/.test(u.canonico)) u.canonico = '';
    }
  }

  let canonico = '';
  const mapa: number[] = [];
  unidades.forEach((u, indice) => {
    for (let n = 0; n < u.canonico.length; n += 1) {
      mapa.push(indice);
    }
    canonico += u.canonico;
  });

  return { canonico, mapa, unidades };
}

interface Achado {
  inicio: number;
  fim: number;
  kind: TrechoRedigido['kind'];
}

/**
 * Telefone: 8 a 13 dígitos com separador qualquer entre eles.
 *
 * O piso de 8 não é arbitrário e não é folga: `care_notes` legítimo é cheio de
 * número curto — "toma 2 comprimidos", "remédio às 8h", "3 vezes ao dia". Um
 * detector que casasse com qualquer sequência de dígitos redigiria a posologia,
 * que é exatamente a informação pela qual o campo existe.
 */
const TELEFONE = /(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d(?:[\s.()-]*\d){7,12}/g;
/**
 * E-mail. O olhar-para-trás na frente não é refinamento de casamento: é o que
 * torna o custo linear, e sem ele o resto desta expressão não adianta.
 *
 * Medido em Node 22 sobre o pior caso construído `a…a@a.a.a.…!`, que casa quase
 * tudo e falha no último caractere. Sem o olhar-para-trás o motor recomeça a
 * varredura a partir de **cada** posição do mesmo bloco de caracteres e o custo
 * cresce com o quadrado do tamanho: 240 ms em 16 KB, 118.870 ms em 256 KB. Com
 * ele sobram duas posições de partida em vez de n, e 256 KB custam 1,9 ms.
 *
 * Trocar só o domínio por rótulos separados, que é o que a regra S5852 sugere,
 * não resolve e piora: 122.850 ms nos mesmos 256 KB, medido. A ambiguidade
 * interna nunca foi a parte cara. Os rótulos ficam mesmo assim, porque são eles
 * que tiram do código a forma que a regra acusa.
 *
 * Quem prova isto é `tempo-da-redacao.test.ts`, com teto de 50 ms.
 */
const EMAIL = /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g;
/**
 * Link. O olhar-para-trás está **só** no segundo ramo, e de propósito.
 *
 * Este achado não estava na triagem: ela mediu os dois regex de e-mail e este
 * aqui é pior que os dois. `[a-z0-9-]+` seguido de `\.` sobre um bloco longo de
 * letras faz o motor desenrolar o bloco inteiro a cada posição de partida.
 * Medido em Node 22, 200 KB: `rua aaa…` custava 73.332 ms, `1-1-1…` 66.855 ms.
 * Com o olhar-para-trás, 1,5 ms nos dois.
 *
 * Pô-lo antes da alternância inteira mudaria o casamento: `xwww.foo.com` casa
 * hoje como `www.foo.com` pelo primeiro ramo, e um olhar-para-trás global
 * bloquearia esse ramo e devolveria `foo.com`. O primeiro ramo fica intacto.
 */
const LINK =
  /(?:https?:\/\/|www\.)[^\s]+|(?<![a-z0-9-])[a-z0-9-]+\.(?:com|net|org|br|me|io|app|link|gg)(?:\.br)?(?:\/[^\s]*)?/g;
const CEP = /\d{5}-?\d{3}/g;
/**
 * Endereço: a palavra de logradouro seguida do resto, com o número opcional.
 *
 * `praca`, `largo`, `quadra` e `viela` ficam de fora desta lista e têm a sua,
 * logo abaixo, **porque em português elas são ponto de encontro antes de serem
 * endereço**. "Vamos na praça central" é exatamente a mensagem que o canal
 * mediado existe para carregar — e é o que a própria mensagem de sistema do
 * Bichu pede, quando diz para combinar um ponto público e movimentado. Redigir
 * essa frase cumpriria a promessa de privacidade impedindo a devolução do
 * animal, que é o único desfecho pelo qual o produto existe.
 *
 * As palavras de rua continuam casando sem número: "moro na Rua das Acácias" é
 * revelação de onde a pessoa mora mesmo sem o `120` no fim.
 */
const LOGRADOURO =
  /\b(?:rua|r\.|av|av\.|avenida|alameda|al\.|travessa|tv\.|rodovia|rod\.|estrada)\s+[^,.;\n]{1,60}(?:,?\s*(?:n[o°º.]?\s*)?\d{1,6}\b)?/g;

/**
 * Ponto de encontro: só vira endereço **com número**.
 *
 * "Praça da Sé, 100" é endereço; "na praça da Sé" é onde as duas pessoas vão
 * se encontrar para devolver o animal. O número é o que distingue um do outro,
 * e é o que o item 2 do ADR-0010 nomeia: "endereço, CEP e **número de
 * residência**".
 */
const PONTO_DE_ENCONTRO =
  /\b(?:praca|largo|viela|quadra|qd\.?)\s+[^,.;\n]{1,60}?,?\s*(?:n[o°º.]?\s*)?\d{1,6}\b/g;

function achar(canonico: string, regex: RegExp, kind: Achado['kind']): Achado[] {
  const achados: Achado[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(canonico)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (kind === 'phone') {
      // O casamento traz separadores nas pontas; o que conta é o dígito.
      const digitos = m[0].replace(/\D/g, '').length;
      if (digitos < 8 || digitos > 13) continue;
    }
    achados.push({ inicio: m.index, fim: m.index + m[0].length, kind });
  }
  return achados;
}

/**
 * Redige telefone, e-mail, endereço e link externo de um texto livre.
 *
 * Idempotente: redigir de novo o que já saiu daqui não muda nada, porque as
 * marcas não casam com nenhum dos detectores. Isso importa porque a mesma nota
 * passa por aqui a cada edição do pet.
 */
export function redigirCanalMediado(entrada: string | null | undefined): ResultadoDaRedacao {
  if (entrada === null || entrada === undefined || entrada === '') {
    return { texto: entrada ?? '', retirados: [] };
  }

  const { canonico, mapa, unidades } = canonizar(entrada);

  // A ordem importa: e-mail antes de link e de telefone, porque `joao@x.com.br`
  // contém um domínio; CEP antes de telefone, porque 8 dígitos são as duas
  // coisas. Quem chega primeiro numa faixa fica com ela.
  const achados = [
    ...achar(canonico, EMAIL, 'email'),
    ...achar(canonico, LINK, 'external_link'),
    ...achar(canonico, CEP, 'address'),
    ...achar(canonico, LOGRADOURO, 'address'),
    ...achar(canonico, PONTO_DE_ENCONTRO, 'address'),
    ...achar(canonico, TELEFONE, 'phone'),
  ].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  const escolhidos: Achado[] = [];
  let limite = -1;
  for (const a of achados) {
    if (a.inicio >= limite) {
      escolhidos.push(a);
      limite = a.fim;
    }
  }

  if (escolhidos.length === 0) {
    return { texto: entrada, retirados: [] };
  }

  let saida = '';
  let cursor = 0;
  const retirados: TrechoRedigido[] = [];

  for (const a of escolhidos) {
    const unidadeInicial = unidades[mapa[a.inicio]!]!;
    const unidadeFinal = unidades[mapa[a.fim - 1]!]!;
    // A faixa do original engloba as unidades inteiras, inclusive as de largura
    // zero que ficaram entre elas com `canonico` vazio.
    const inicio = unidadeInicial.inicio;
    let fim = unidadeFinal.fim;
    while (fim < entrada.length && LARGURA_ZERO.test(entrada[fim]!)) fim += 1;

    saida += entrada.slice(cursor, inicio) + MARCA[a.kind];
    retirados.push({ kind: a.kind, hint: DICA[a.kind] });
    cursor = fim;
  }
  saida += entrada.slice(cursor);

  return { texto: saida, retirados };
}
