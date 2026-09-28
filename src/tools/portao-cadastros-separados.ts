/**
 * Portao dos cadastros separados: o codigo do painel nao cita tabela do app, e
 * o codigo do app nao cita tabela do painel (ADR-0027 item 20; D42 e P21 (c) de
 * `docs/04-seguranca.md` 22.11).
 *
 * O esquema ja impede a chave estrangeira (P21 (b), `cadastros-separados.test.ts`
 * na integracao). O que o esquema nao impede e uma consulta: `admin-access`
 * fazendo `selectFrom('users')` para "so conferir uma coisa" religaria os dois
 * cadastros sem nenhuma FK, e a porta do tutor voltaria a ser oraculo da senha
 * do painel (T2). Este portao reprova isso no codigo.
 *
 * ## O que ele le
 *
 * O texto dos literais de cadeia e de modelo (`'users'`, `` `from users` ``),
 * depois de tirar os comentarios. Comentario pode falar de `users` para
 * explicar a separacao, e explicar nao e consultar; literal e por onde o nome
 * da tabela chega ao Kysely e ao SQL cru.
 *
 * ## Tres decisoes que fazem ele valer alguma coisa
 *
 * 1. **Nao achar arquivo reprova.** Zero arquivos em qualquer um dos dois
 *    modulos e diretorio errado ou modulo renomeado, e "nada citado" teria a
 *    mesma cor de "conferi e esta limpo".
 * 2. **As iscas moram aqui e rodam sempre** (`autoTeste`): uma consulta a
 *    `users` em `admin-access`, uma a `admin_accounts` em `identity`, e um
 *    comentario que cita `users` e NAO pode ser acusado. Se qualquer uma sair
 *    do esperado, o portao reprova a si mesmo.
 * 3. **O alcance e o nome literal**, e isso fica dito: um nome de tabela
 *    montado por concatenacao passa. O que fecha esse caminho e a fronteira de
 *    modulo do ESLint (`admin-access` nao alcanca os repositorios de
 *    `identity`) e a revisao.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Arquivo {
  readonly caminho: string;
  readonly conteudo: string;
}

export interface Regra {
  /** O modulo vigiado, como diretorio sob `src/modules/`. */
  readonly modulo: string;
  /** As tabelas que ele NUNCA cita. */
  readonly proibidas: readonly string[];
}

/** As duas regras de P21 (c), por extenso. */
export const REGRAS: readonly Regra[] = [
  {
    modulo: 'admin-access',
    proibidas: ['users', 'user_identities', 'local_credentials', 'user_roles', 'refresh_tokens'],
  },
  {
    modulo: 'identity',
    proibidas: ['admin_accounts', 'admin_sessions', 'admin_reauth_tokens', 'admin_session_alerts'],
  },
];

/**
 * O texto dos literais de um arquivo TypeScript, sem os comentarios.
 *
 * Maquina de estados de um passo: codigo, comentario de linha, comentario de
 * bloco, cadeia com aspas simples ou duplas, e modelo com crase. Expressao
 * regular tambem e literal no TypeScript, mas nome de tabela nao chega ao banco
 * por ela, e tratar `/` como divisao aqui so arrisca ler um pedaco de regex
 * como codigo, o que nunca esconde literal nenhum.
 */
export function literaisDe(texto: string): string[] {
  const literais: string[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const proximo = texto[i + 1];
    if (c === '/' && proximo === '/') {
      const fim = texto.indexOf('\n', i);
      i = fim === -1 ? texto.length : fim;
    } else if (c === '/' && proximo === '*') {
      const fim = texto.indexOf('*/', i + 2);
      i = fim === -1 ? texto.length : fim + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let atual = '';
      while (j < texto.length && texto[j] !== c) {
        if (texto[j] === '\\') {
          atual += texto.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (c !== '`' && texto[j] === '\n') break;
        atual += texto[j];
        j += 1;
      }
      literais.push(atual);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return literais;
}

export interface Achado {
  readonly onde: string;
  readonly tabela: string;
}

export function inspecionar(arquivos: readonly Arquivo[], proibidas: readonly string[]): Achado[] {
  const padroes = proibidas.map((tabela) => ({ tabela, padrao: new RegExp(`(^|[^a-z0-9_])${tabela}($|[^a-z0-9_])`) }));
  const achados: Achado[] = [];
  for (const arquivo of arquivos) {
    const literais = literaisDe(arquivo.conteudo);
    for (const { tabela, padrao } of padroes) {
      if (literais.some((literal) => padrao.test(literal))) achados.push({ onde: arquivo.caminho, tabela });
    }
  }
  return achados;
}

function listar(raiz: string, diretorio: string, saida: Arquivo[]): void {
  for (const entrada of readdirSync(diretorio)) {
    const completo = join(diretorio, entrada);
    if (statSync(completo).isDirectory()) {
      listar(raiz, completo, saida);
    } else if (entrada.endsWith('.ts')) {
      saida.push({ caminho: relative(raiz, completo), conteudo: readFileSync(completo, 'utf8') });
    }
  }
}

export interface ResultadoDoPortao {
  readonly arquivosPorModulo: Readonly<Record<string, number>>;
  readonly violacoes: readonly string[];
}

export function conferirCadastrosSeparados(
  arquivosDoModulo: (modulo: string) => readonly Arquivo[],
): ResultadoDoPortao {
  const violacoes: string[] = [];
  const arquivosPorModulo: Record<string, number> = {};
  for (const regra of REGRAS) {
    const arquivos = arquivosDoModulo(regra.modulo);
    arquivosPorModulo[regra.modulo] = arquivos.length;
    if (arquivos.length === 0) {
      violacoes.push(`src/modules/${regra.modulo}/ sem nenhum arquivo .ts: o portao nao tem o que conferir`);
      continue;
    }
    for (const achado of inspecionar(arquivos, regra.proibidas)) {
      violacoes.push(`${achado.onde}: o modulo ${regra.modulo} cita a tabela ${achado.tabela} (D42, P21)`);
    }
  }
  return { arquivosPorModulo, violacoes };
}

/** Os arquivos reais de um modulo, a partir da raiz do projeto. */
export function arquivosReais(raiz: string): (modulo: string) => Arquivo[] {
  return (modulo) => {
    const saida: Arquivo[] = [];
    try {
      listar(raiz, join(raiz, 'src', 'modules', modulo), saida);
    } catch {
      // Diretorio ausente vira zero arquivos, e zero arquivos reprova acima.
    }
    return saida;
  };
}

// ---------------------------------------------------------------------------
// AS ISCAS
// ---------------------------------------------------------------------------

const ISCAS: Readonly<Record<string, readonly Arquivo[]>> = {
  'admin-access': [
    {
      caminho: 'src/modules/admin-access/isca.ts',
      conteudo:
        "// Explica a separacao: `users` e do app, e este comentario nao pode ser acusado.\n" +
        "export const x = (db: any) => db.selectFrom('users').select('email');\n",
    },
  ],
  identity: [
    {
      caminho: 'src/modules/identity/isca.ts',
      conteudo: 'export const y = (db: any) => db.selectFrom(`admin_accounts`).selectAll();\n',
    },
  ],
};

const ISCA_SO_COMENTARIO: Arquivo = {
  caminho: 'src/modules/admin-access/so-comentario.ts',
  conteudo: '/* O painel nunca le `users` nem `user_roles`. */\nexport const z = 1; // refresh_tokens tambem nao\n',
};

export function autoTeste(): string[] {
  const falhas: string[] = [];
  const comIscas = conferirCadastrosSeparados((modulo) => ISCAS[modulo] ?? []);
  if (!comIscas.violacoes.some((v) => v.includes('admin-access cita a tabela users'))) {
    falhas.push('a isca de admin-access consultando users passou: o portao parou de ler literal');
  }
  if (!comIscas.violacoes.some((v) => v.includes('identity cita a tabela admin_accounts'))) {
    falhas.push('a isca de identity consultando admin_accounts passou: o portao parou de ler modelo com crase');
  }
  if (inspecionar([ISCA_SO_COMENTARIO], REGRAS[0]?.proibidas ?? []).length > 0) {
    falhas.push('um comentario foi acusado como consulta: o portao passou a ler comentario');
  }
  const vazio = conferirCadastrosSeparados(() => []);
  if (!vazio.violacoes.some((v) => v.includes('sem nenhum arquivo'))) {
    falhas.push('com zero arquivos o portao aprovou: nao achar alvo tem de reprovar');
  }
  return falhas;
}
