import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** O texto publicado, relativo à raiz do repositório. */
export const POLITICA = 'web/src/conteudo/juridico/privacidade.md';

const COLUNA_DE_PRAZO = 'por quanto tempo';

/** A redação vaga, por extenso. */
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

/** As células de prazo de guarda da política. */
export function celulasDePrazo(conteudo: string): CelulaDePrazo[] {
  const linhas = conteudo.split('\n');
  const celulas: CelulaDePrazo[] = [];
  let colunaAtual: number | undefined;

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? '';
    const bruta = linha.trim();

    if (!bruta.startsWith('|')) {
      colunaAtual = undefined;
      const prosa = /^por quanto tempo\s*:\s*(.+)$/i.exec(bruta);
      if (prosa?.[1] !== undefined) {
        celulas.push({ linha: i + 1, texto: prosa[1], forma: 'prosa' });
        continue;
      }
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

/** As células vagas, e a contagem de quantas foram conferidas. */
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

const PADROES_DE_PRAZO: readonly RegExp[] = [
  /'(?:\w*(?:_at|_until))'\s*,\s*'<=?'/,
  /\b\w*(?:_at|_until)\b\s*<=?\s*[^=<]/,
  /\bmake_interval\s*\(/,
  /\binterval\s*'/,
];

export interface ExpurgoAchado {
  readonly onde: string;
  readonly tabela: string;
}

/** Os expurgos por prazo de um arquivo. */
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

/** `src/` sem teste, sem semente e sem este diretório. */
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

/** As iscas, e o que cada uma precisa provar. */
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
