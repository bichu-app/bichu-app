/**
 * Portão da retenção declarada (ADR-0010, emenda 6 de 26/10/2026 — decisão do
 * cliente: *"não apague nada, mantenha e corrija a política"*).
 *
 * Ele responde duas perguntas diferentes, e elas têm forças diferentes. A
 * distinção está escrita aqui porque um portão que não diz o que NÃO mede é
 * lido como prova do que não provou.
 *
 * ## Pergunta 1 — a política publicada voltou a dizer prazo vago?
 *
 * **Isca provada.** O arquivo `web/src/conteudo/juridico/privacidade.md` é o
 * texto que vai ao ar em bichu.app. Em 26/10 ele tinha **dez** células de
 * "por quanto tempo" dizendo *"Ainda não definido"*, mais quatro frases de
 * prosa com a mesma lacuna. A emenda 6 as substituiu por redação que amarra a
 * guarda à finalidade. Esta parte do portão reprova se qualquer uma delas
 * voltar, e {@link autoTeste} prova que ela reprova — com célula vaga
 * sintética e com célula boa sintética, nas duas direções.
 *
 * ## Pergunta 2 — apareceu expurgo por prazo em `src/` sem decisão escrita?
 *
 * **GUARDA, e não isca provada contra a intenção.** Ela mede uma coisa bem
 * definida e NÃO mede outra, e a fronteira é esta:
 *
 * - **Mede:** um `DELETE` sobre tabela do produto cujo predicado compara uma
 *   coluna de tempo com um instante, feito em `src/` fora de teste, sobre uma
 *   tabela que não está em {@link EXPURGOS_DECLARADOS}. Reprova pelo nome da
 *   tabela.
 * - **Mede:** que cada entrada de {@link EXPURGOS_DECLARADOS} aponte para uma
 *   decisão escrita que **resolve** — o arquivo existe e contém o trecho
 *   citado. Decisão que some, ou que é reescrita, derruba o portão.
 * - **Mede:** que cada entrada declarada continue tendo expurgo no código. Uma
 *   lista que sobrevive ao código que ela descreve para de medir em silêncio, e
 *   esta é também a prova de que a varredura ainda está achando algo.
 * - **NÃO mede** se a decisão citada é de verdade uma decisão do cliente.
 *   Quem acrescentar uma entrada e escrever um arquivo de decisão para ela
 *   passa. O que o portão faz nesse caso é obrigar o ato a ser **deliberado e
 *   escrito** em vez de silencioso — e é só isso que ele faz.
 * - **NÃO mede** expurgo que não passe por `DELETE` em `src/`: `pg_cron`,
 *   política de ciclo de vida de balde, rotina em migração, `TRUNCATE`, ou
 *   apagamento feito à mão no banco. Em 26/10 nenhum desses existia
 *   (`grep -rniE "pg_cron|cron" migrations/ infra/` não achou agendador de
 *   banco), e o portão não alcançaria se existisse.
 * - **NÃO mede** nome de tabela montado por concatenação, pela mesma razão que
 *   `portao-cadastros-separados.ts` registra.
 *
 * ## Verificação que não consegue verificar REPROVA
 *
 * Política ilegível, zero células de prazo encontradas, zero arquivos varridos
 * em `src/`: todos terminam em reprovação com o motivo. Nenhum deles aprova por
 * falta do que conferir — "o filtro não casou" e "está limpo" não podem ter a
 * mesma cor.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** O texto publicado, relativo à raiz do repositório. */
export const POLITICA = 'web/src/conteudo/juridico/privacidade.md';

/** O cabeçalho que marca a coluna de prazo de guarda nas tabelas da política. */
const COLUNA_DE_PRAZO = 'por quanto tempo';

/**
 * A redação vaga, por extenso. São as formas que a política de fato usava antes
 * da emenda 6, mais as vizinhas óbvias — "a definir", "TBD", "indefinido".
 *
 * Comparação **sem acento e sem caixa**: `naoAcentuado` normaliza as duas
 * pontas, porque "Ainda Não Definido" e "ainda nao definido" são a mesma
 * lacuna, e um portão que só pega uma delas não pega nenhuma.
 */
export const REDACOES_VAGAS: readonly string[] = [
  'ainda nao definido',
  'ainda nao esta definido',
  'nao definido',
  'nao esta definido',
  'a definir',
  'a ser definido',
  'por definir',
  'indefinido',
  'sem prazo definido',
  'tbd',
  'a combinar',
  'em aberto',
];

/** Sem acento, sem caixa, com espaço colapsado. */
export function naoAcentuado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CelulaDePrazo {
  /** Linha no arquivo, base 1. */
  readonly linha: number;
  /** O que a célula diz. */
  readonly texto: string;
  /** `tabela` ou `prosa`, só para o relato. */
  readonly forma: 'tabela' | 'prosa';
}

/**
 * As células de prazo de guarda da política.
 *
 * Duas formas, porque a política usa as duas: a **coluna** "por quanto tempo"
 * das tabelas de cada seção 4.x, e a **prosa** `Por quanto tempo: …` das seções
 * que não têm tabela (4.13 e 4.16). Ler só as tabelas deixaria passar as duas
 * frases de prosa que diziam "ainda não definido" em 26/10.
 */
export function celulasDePrazo(conteudo: string): CelulaDePrazo[] {
  const linhas = conteudo.split('\n');
  const celulas: CelulaDePrazo[] = [];
  let colunaAtual: number | undefined;

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? '';
    const bruta = linha.trim();

    if (!bruta.startsWith('|')) {
      // Fora de tabela a coluna deixa de valer: duas tabelas seguidas podem ter
      // a coluna de prazo em posições diferentes, e herdar o índice da anterior
      // leria a célula errada com cara de certa.
      colunaAtual = undefined;
      const prosa = /^por quanto tempo\s*:\s*(.+)$/i.exec(bruta);
      if (prosa?.[1] !== undefined) {
        celulas.push({ linha: i + 1, texto: prosa[1], forma: 'prosa' });
        continue;
      }
      // `Base legal: …. Por quanto tempo: ….` numa frase só (é assim que 4.13 e
      // 4.16 escrevem).
      const embutida = /por quanto tempo\s*:\s*([^|]+)$/i.exec(bruta);
      if (embutida?.[1] !== undefined) {
        celulas.push({ linha: i + 1, texto: embutida[1], forma: 'prosa' });
      }
      continue;
    }

    const colunas = bruta.replace(/^\|/, '').replace(/\|$/, '').split('|');
    const cabecalho = colunas.findIndex((c) => naoAcentuado(c) === COLUNA_DE_PRAZO);
    if (cabecalho !== -1) {
      colunaAtual = cabecalho;
      continue;
    }
    // A linha de separador (`|---|---|`) não é dado.
    if (colunas.every((c) => /^[\s:-]*$/.test(c))) continue;
    if (colunaAtual === undefined) continue;
    const celula = colunas[colunaAtual];
    if (celula === undefined) continue;
    celulas.push({ linha: i + 1, texto: celula.trim(), forma: 'tabela' });
  }
  return celulas;
}

export interface CelulaVaga {
  readonly linha: number;
  readonly forma: 'tabela' | 'prosa';
  readonly texto: string;
  /** Qual redação vaga casou. */
  readonly redacao: string;
}

/**
 * As células vagas, e a contagem de quantas foram conferidas.
 *
 * `conferidas` sai junto do veredito de propósito: verde com zero células
 * conferidas é o arquivo que mudou de forma, não a política que ficou boa.
 */
export function conferirPolitica(conteudo: string): {
  readonly vagas: readonly CelulaVaga[];
  readonly conferidas: number;
} {
  const celulas = celulasDePrazo(conteudo);
  const vagas: CelulaVaga[] = [];
  for (const celula of celulas) {
    const normal = naoAcentuado(celula.texto);
    const redacao = REDACOES_VAGAS.find((vaga) => normal.includes(vaga));
    if (redacao !== undefined) {
      vagas.push({ linha: celula.linha, forma: celula.forma, texto: celula.texto, redacao });
    }
  }
  return { vagas, conferidas: celulas.length };
}

// ---------------------------------------------------------------------------
// Pergunta 2: expurgo por prazo em `src/`
// ---------------------------------------------------------------------------

export interface ExpurgoDeclarado {
  /** A tabela varrida. */
  readonly tabela: string;
  /** O arquivo de decisão, relativo à raiz. */
  readonly decisao: string;
  /** Um trecho que precisa existir naquele arquivo, palavra por palavra. */
  readonly trecho: string;
  /** Por que este expurgo sobrevive à emenda 6, em uma frase. */
  readonly porque: string;
}

/**
 * Os três expurgos por prazo que existiam em `src/` em 26/10, cada um com a
 * decisão que o sustenta.
 *
 * `trecho` é conferido palavra por palavra no arquivo citado. Não é enfeite: é
 * o que faz "decisão escrita" ser medida em vez de afirmada. Apagar a linha da
 * tabela do ADR-0010, ou reescrevê-la, derruba o portão — e isso é o
 * comportamento desejado, porque o expurgo passaria a rodar sem registro.
 */
export const EXPURGOS_DECLARADOS: readonly ExpurgoDeclarado[] = [
  {
    tabela: 'audit.events',
    decisao: 'adr/ADR-0010-privacidade-e-lgpd.md',
    trecho: '| Trilha de auditoria | 24 meses |',
    porque:
      'é o contrário de retenção de dado do titular: é a prova de que o pedido dele foi atendido. A emenda 6 a preserva por escrito.',
  },
  {
    tabela: 'user_reference_locations',
    decisao: 'adr/ADR-0010-privacidade-e-lgpd.md',
    trecho: 'só a última**, quantizada a ~100 m, validade de 30 dias',
    porque:
      'é tratada por consentimento, e o vencimento é parte da promessa de "só a última, sem histórico". A emenda 6 a preserva por escrito.',
  },
  {
    tabela: 'network_event_join_requests',
    decisao: 'adr/ADR-0027-backoffice-construido-pelo-squad.md',
    trecho: '**Retenção (D54):** o worker de expurgo apaga aprovado e recusado 30 dias',
    porque:
      'pedido de encontro vencido, decisão D54 do cliente registrada na ADR-0027. A decisão de 26/10 não o mencionou, e ele fica listado aqui para que a próxima leitura o encontre em vez de o descobrir.',
  },
];

/** O que torna um `DELETE` um expurgo **por prazo**, e não uma edição. */
const PADROES_DE_PRAZO: readonly RegExp[] = [
  // Kysely: `.where('expires_at', '<=', x)` / `.where('occurred_at', '<', x)`
  /'(?:\w*(?:_at|_until))'\s*,\s*'<=?'/,
  // SQL cru: `where occurred_at < $1`, `AND ends_at <= now()`
  /\b\w*(?:_at|_until)\b\s*<=?\s*[^=<]/,
  // SQL cru: `- make_interval(days => n)` / `now() - interval '90 days'`
  /\bmake_interval\s*\(/,
  /\binterval\s*'/,
];

export interface ExpurgoAchado {
  readonly onde: string;
  readonly tabela: string;
}

/**
 * Os expurgos por prazo de um arquivo.
 *
 * A janela vai do `DELETE` até o `;` que fecha o comando, no máximo 1500
 * caracteres. É ela, e não a linha, que carrega o predicado: tanto a cadeia do
 * Kysely quanto o literal de modelo do SQL cru ocupam várias linhas.
 *
 * **Comentário não conta.** O texto é limpo antes, porque este arquivo e os
 * três módulos de expurgo explicam em prosa o que apagam, e um portão que lesse
 * comentário acusaria a própria documentação da decisão.
 */
export function expurgosPorPrazoEm(caminho: string, conteudo: string): ExpurgoAchado[] {
  const texto = semComentarios(conteudo);
  const achados: ExpurgoAchado[] = [];
  const padrao = /(?:deleteFrom\(\s*'([\w.]+)'\s*\)|delete\s+from\s+([\w.]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(texto)) !== null) {
    const tabela = m[1] ?? m[2];
    if (tabela === undefined) continue;
    const fim = texto.indexOf(';', m.index);
    const limite = fim === -1 ? m.index + 1500 : Math.min(fim, m.index + 1500);
    const janela = texto.slice(m.index, limite);
    if (PADROES_DE_PRAZO.some((p) => p.test(janela))) achados.push({ onde: caminho, tabela });
  }
  return achados;
}

/** Tira comentário de linha e de bloco, preservando o resto. */
export function semComentarios(texto: string): string {
  let fora = '';
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const prox = texto[i + 1];
    if (c === '/' && prox === '/') {
      const fim = texto.indexOf('\n', i);
      i = fim === -1 ? texto.length : fim;
    } else if (c === '/' && prox === '*') {
      const fim = texto.indexOf('*/', i + 2);
      i = fim === -1 ? texto.length : fim + 2;
    } else if (c === '-' && prox === '-') {
      const fim = texto.indexOf('\n', i);
      i = fim === -1 ? texto.length : fim;
    } else {
      fora += c;
      i += 1;
    }
  }
  return fora;
}

export interface Arquivo {
  readonly caminho: string;
  readonly conteudo: string;
}

/**
 * `src/` sem teste, sem semente e sem este diretório.
 *
 * - **teste** apaga de propósito para montar cenário;
 * - **`src/bin/seed.ts`** é a massa de desenvolvimento, e ela apaga o que
 *   plantou;
 * - **`src/tools/`** é onde os portões moram, e este arquivo cita expurgo em
 *   literal de isca.
 */
export function arquivosDoProduto(raiz: string): Arquivo[] {
  const saida: Arquivo[] = [];
  const andar = (diretorio: string): void => {
    for (const nome of readdirSync(diretorio)) {
      const caminho = join(diretorio, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome === 'tools') continue;
        andar(caminho);
        continue;
      }
      if (!nome.endsWith('.ts')) continue;
      if (nome.endsWith('.test.ts')) continue;
      const rel = relative(raiz, caminho);
      if (rel === join('src', 'bin', 'seed.ts')) continue;
      saida.push({ caminho: rel, conteudo: readFileSync(caminho, 'utf8') });
    }
  };
  andar(join(raiz, 'src'));
  return saida;
}

export interface VeredictoDoExpurgo {
  /** Expurgo por prazo sobre tabela que ninguém declarou. */
  readonly semDecisao: readonly ExpurgoAchado[];
  /** Entrada declarada cuja decisão não resolve. */
  readonly decisaoQueNaoResolve: readonly string[];
  /** Entrada declarada que não tem mais expurgo no código. */
  readonly declaradoSemCodigo: readonly string[];
  /** Quantos arquivos foram varridos. */
  readonly varridos: number;
  /** Quantos expurgos por prazo foram achados. */
  readonly achados: number;
}

export function conferirExpurgos(
  arquivos: readonly Arquivo[],
  declarados: readonly ExpurgoDeclarado[],
  lerDecisao: (caminho: string) => string | undefined,
): VeredictoDoExpurgo {
  const todos = arquivos.flatMap((a) => expurgosPorPrazoEm(a.caminho, a.conteudo));
  const permitidas = new Set(declarados.map((d) => d.tabela));
  const semDecisao = todos.filter((a) => !permitidas.has(a.tabela));

  const decisaoQueNaoResolve: string[] = [];
  for (const d of declarados) {
    const conteudo = lerDecisao(d.decisao);
    if (conteudo === undefined) {
      decisaoQueNaoResolve.push(`${d.tabela}: ${d.decisao} nao existe`);
      continue;
    }
    if (!conteudo.includes(d.trecho)) {
      decisaoQueNaoResolve.push(`${d.tabela}: ${d.decisao} nao contem "${d.trecho}"`);
    }
  }

  const vistas = new Set(todos.map((a) => a.tabela));
  const declaradoSemCodigo = declarados
    .filter((d) => !vistas.has(d.tabela))
    .map((d) => d.tabela);

  return {
    semDecisao,
    decisaoQueNaoResolve,
    declaradoSemCodigo,
    varridos: arquivos.length,
    achados: todos.length,
  };
}

// ---------------------------------------------------------------------------
// As iscas, e elas rodam sempre
// ---------------------------------------------------------------------------

const POLITICA_VAGA = [
  '| O que | Para quê | Base legal | Por quanto tempo |',
  '|---|---|---|---|',
  '| Leituras da plaquinha | Perceber clonagem | Legítimo interesse | Ainda não definido |',
].join('\n');

const POLITICA_BOA = [
  '| O que | Para quê | Base legal | Por quanto tempo |',
  '|---|---|---|---|',
  '| Leituras da plaquinha | Perceber clonagem | Legítimo interesse | Enquanto a plaquinha existir. Não há apagamento por prazo |',
].join('\n');

const SRC_COM_EXPURGO_NOVO = [
  "export const x = db.deleteFrom('tag_scans')",
  "  .where('scanned_at', '<', corte)",
  '  .execute();',
].join('\n');

const SRC_COM_EDICAO = [
  "export const y = db.deleteFrom('user_blocks')",
  "  .where('blocker_user_id', '=', chamador)",
  "  .where('blocked_user_id', '=', alvo)",
  '  .execute();',
].join('\n');

/**
 * As iscas, e o que cada uma precisa provar. Devolve a lista de falhas: vazia é
 * aprovado.
 *
 * A quinta é a que dá dente à pergunta 2: uma entrada declarada cujo arquivo de
 * decisão não existe **reprova**. Sem ela, a lista de permissões seria uma lista
 * de nomes e nada mais.
 */
export function autoTeste(): string[] {
  const falhas: string[] = [];

  const vaga = conferirPolitica(POLITICA_VAGA);
  if (vaga.vagas.length !== 1) falhas.push('isca 1: celula "Ainda nao definido" NAO foi acusada');
  if (vaga.conferidas !== 1) falhas.push('isca 1: a coluna de prazo nao foi encontrada');

  const boa = conferirPolitica(POLITICA_BOA);
  if (boa.vagas.length !== 0) falhas.push('isca 2: celula boa foi acusada por engano');

  const novo = conferirExpurgos(
    [{ caminho: 'falso/novo.ts', conteudo: SRC_COM_EXPURGO_NOVO }],
    EXPURGOS_DECLARADOS,
    () => 'conteudo que nao importa aqui',
  );
  if (!novo.semDecisao.some((a) => a.tabela === 'tag_scans')) {
    falhas.push('isca 3: expurgo novo de tag_scans NAO foi acusado');
  }

  const edicao = conferirExpurgos(
    [{ caminho: 'falso/edicao.ts', conteudo: SRC_COM_EDICAO }],
    EXPURGOS_DECLARADOS,
    () => 'conteudo que nao importa aqui',
  );
  if (edicao.semDecisao.length !== 0) {
    falhas.push('isca 4: DELETE sem predicado de tempo foi acusado como expurgo');
  }

  const semDecisao = conferirExpurgos([], [EXPURGOS_DECLARADOS[0]!], () => undefined);
  if (semDecisao.decisaoQueNaoResolve.length !== 1) {
    falhas.push('isca 5: decisao que nao resolve NAO derrubou o portao');
  }

  return falhas;
}

/** A política de verdade, ou `undefined` se ela não está onde deveria. */
export function politicaReal(raiz: string): string | undefined {
  try {
    return readFileSync(join(raiz, POLITICA), 'utf8');
  } catch {
    return undefined;
  }
}

export function lerDaRaiz(raiz: string): (caminho: string) => string | undefined {
  return (caminho) => {
    try {
      return readFileSync(join(raiz, caminho), 'utf8');
    } catch {
      return undefined;
    }
  };
}
