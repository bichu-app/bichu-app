/**
 * Portão de saída: coluna marcada como "nunca sai do servidor" não aparece em
 * resposta nenhuma, nem em código que monta resposta.
 *
 * Por que ele existe. `professionals.created_by_user_id` era "quem cadastrou"
 * enquanto o perfil nascia da comunidade. A emenda 1 do ADR-0011 (21/09) negou
 * essa premissa, e com convite e aceite a coluna virou **"quem convidou"** —
 * um **vínculo entre duas pessoas**, que é exatamente o que a BICHUS-174 proíbe
 * expor em superfície pública, inclusive na forma de contagem e inclusive na
 * forma da existência. O ADR chama isso de "critério de reprovação em revisão".
 * Revisão humana esquece; este arquivo não.
 *
 * **Isto é restrição de SAÍDA, não de coluna.** A coluna fica, porque a trilha
 * precisa dela. O que não pode é ela atravessar a borda.
 *
 * Três decisões que fazem este portão valer alguma coisa:
 *
 * 1. **A lista de colunas é LIDA DAS MIGRAÇÕES, não escrita aqui.** Quem marcar
 *    uma coluna nova com `NUNCA sai do servidor` no `COMMENT ON COLUMN` ganha a
 *    cobertura sem precisar lembrar deste arquivo. Duas listas que precisam ser
 *    mantidas em sincronia divergem; uma fonte só, não.
 * 2. **Não achar alvo é reprovação.** Migração sem nenhuma coluna marcada,
 *    contrato que não carrega, `src/` que não existe: falha ruidosa com o
 *    motivo. Portão que não consegue verificar precisa reprovar, nunca aprovar.
 * 3. **O caso que ele PRECISA reprovar mora aqui dentro e roda sempre.** Hoje o
 *    contrato tem ZERO ocorrência das colunas marcadas, porque as tabelas
 *    nasceram sem rota. Sem a isca, este portão ficaria verde por não ter olhado
 *    para nada, e continuaria verde no dia em que quebrasse.
 *
 * Uso: `node dist/tools/portao-colunas-que-nao-saem.js [raiz-do-projeto]`
 * Saída: 0 aprovado, 1 reprovado.
 */
import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const VERSAO_DO_PORTAO = '1.0.0';

/**
 * A marca que promove uma coluna a "não sai". Ela é conferida contra o texto do
 * `COMMENT ON COLUMN`, e não contra o nome da coluna: nome muda, intenção
 * escrita no banco fica. O acento é opcional porque as migrações deste projeto
 * são escritas sem acento.
 */
const MARCA = /nunca sai do servidor/i;

/** Extrai `COMMENT ON COLUMN <tabela>.<coluna> IS '<corpo>'`. */
const COMENTARIO_DE_COLUNA = /COMMENT\s+ON\s+COLUMN\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+IS\s*'((?:[^']|'')*)'/gi;

export interface ColunaQueNaoSai {
  readonly tabela: string;
  readonly coluna: string;
  readonly origem: string;
}

export interface Achado {
  readonly onde: string;
  readonly coluna: string;
  readonly motivo: string;
}

export interface Arquivo {
  readonly caminho: string;
  readonly conteudo: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Lê as colunas marcadas a partir do texto das migrações.
 *
 * Duas migrações podem marcar colunas homônimas em tabelas diferentes; o
 * conjunto de NOMES é o que interessa para a busca, porque uma resposta JSON
 * não carrega o nome da tabela junto.
 */
export function lerColunasQueNaoSaem(migracoes: readonly Arquivo[]): ColunaQueNaoSai[] {
  const encontradas: ColunaQueNaoSai[] = [];
  for (const migracao of migracoes) {
    for (const achado of migracao.conteudo.matchAll(COMENTARIO_DE_COLUNA)) {
      const [, tabela, coluna, corpo] = achado;
      if (tabela === undefined || coluna === undefined || corpo === undefined) continue;
      if (!MARCA.test(corpo)) continue;
      encontradas.push({ tabela, coluna, origem: migracao.caminho });
    }
  }
  return encontradas;
}

/**
 * Percorre o contrato inteiro — **toda** operação, e não só as públicas.
 *
 * A leitura estreita seria "nenhuma resposta pública". O título da seção 4 do
 * ADR-0011 é mais forte e é o que vale aqui: *"`created_by_user_id` nunca sai do
 * servidor"*. Quem convidou quem é vínculo entre duas pessoas, e ele não fica
 * menos sensível porque o leitor tem conta: um profissional autenticado saberia
 * quais tutores o indicaram.
 */
export function inspecionarContrato(
  spec: Record<string, unknown>,
  proibidas: ReadonlySet<string>,
): Achado[] {
  const achados: Achado[] = [];
  const paths = spec['paths'];
  if (!ehObjeto(paths)) return achados;

  for (const [caminho, item] of Object.entries(paths)) {
    if (!ehObjeto(item)) continue;
    for (const [metodo, operacao] of Object.entries(item)) {
      if (!ehObjeto(operacao)) continue;
      const respostas = operacao['responses'];
      if (respostas === undefined) continue;
      const id =
        typeof operacao['operationId'] === 'string'
          ? operacao['operationId']
          : `${metodo.toUpperCase()} ${caminho}`;
      percorrer(respostas, spec, id, 'responses', new Set(), proibidas, achados);
    }
  }
  // Um schema de componente pode ser referenciado por uma resposta futura sem
  // que ninguém reabra este arquivo. Percorrer os componentes fecha essa porta
  // antes de ela existir.
  const componentes = spec['components'];
  if (componentes !== undefined) {
    percorrer(componentes, spec, 'components', 'components', new Set(), proibidas, achados);
  }
  return achados;
}

function percorrer(
  no: unknown,
  spec: Record<string, unknown>,
  operationId: string,
  onde: string,
  vistos: Set<string>,
  proibidas: ReadonlySet<string>,
  achados: Achado[],
): void {
  if (Array.isArray(no)) {
    for (const item of no) percorrer(item, spec, operationId, onde, vistos, proibidas, achados);
    return;
  }
  if (!ehObjeto(no)) return;

  const ref = no['$ref'];
  if (typeof ref === 'string') {
    if (vistos.has(ref)) return;
    vistos.add(ref);
    let alvo: unknown = spec;
    for (const parte of ref.replace(/^#\//, '').split('/')) {
      if (!ehObjeto(alvo)) return;
      alvo = alvo[parte];
    }
    percorrer(alvo, spec, operationId, `${onde} -> ${ref}`, vistos, proibidas, achados);
    return;
  }

  for (const [chave, valor] of Object.entries(no)) {
    if (proibidas.has(chave)) {
      achados.push({
        onde: `${operationId} (${onde})`,
        coluna: chave,
        motivo: 'coluna marcada como "nunca sai do servidor" declarada no contrato',
      });
    }
    percorrer(valor, spec, operationId, `${onde}.${chave}`, vistos, proibidas, achados);
  }
}

/**
 * Procura o nome da coluna no código que roda no servidor.
 *
 * **O alcance desta varredura é o nome literal, e isso precisa ser dito em voz
 * alta em vez de descoberto depois:** `select created_by_user_id as invited_by`
 * passa por aqui. Ela pega o caminho comum — a coluna carregada para dentro de
 * um DTO com o próprio nome — e não pega o apelido. O que fecha o apelido é
 * revisão, e é por isso que o comentário da migração diz a regra por extenso.
 */
export function inspecionarFontes(
  arquivos: readonly Arquivo[],
  proibidas: ReadonlySet<string>,
): Achado[] {
  const achados: Achado[] = [];
  for (const arquivo of arquivos) {
    for (const proibida of proibidas) {
      if (!arquivo.conteudo.includes(proibida)) continue;
      const linha =
        arquivo.conteudo.split('\n').findIndex((texto) => texto.includes(proibida)) + 1;
      achados.push({
        onde: `${arquivo.caminho}:${linha}`,
        coluna: proibida,
        motivo: 'coluna marcada como "nunca sai do servidor" citada em código de servidor',
      });
    }
  }
  return achados;
}

/**
 * Arquivos que **podem** citar o nome, porque eles são a regra e não a
 * violação. Comparação por componente de caminho, nunca por `startsWith` de
 * texto: `tools-outro/` começa com `tools` sem estar dentro dele.
 */
const DISPENSADOS: readonly string[][] = [
  ['src', 'tools', 'portao-colunas-que-nao-saem.ts'],
  ['src', 'tools', 'portao-colunas-que-nao-saem.test.ts'],
];

function ehDispensado(caminhoRelativo: string): boolean {
  const partes = caminhoRelativo.split(sep);
  return DISPENSADOS.some(
    (dispensado) =>
      dispensado.length === partes.length && dispensado.every((p, i) => p === partes[i]),
  );
}

function listarTypeScript(raiz: string, diretorio: string, saida: Arquivo[]): void {
  for (const entrada of readdirSync(diretorio)) {
    const completo = join(diretorio, entrada);
    if (statSync(completo).isDirectory()) {
      if (entrada === 'node_modules' || entrada === 'generated') continue;
      listarTypeScript(raiz, completo, saida);
      continue;
    }
    if (!entrada.endsWith('.ts') && !entrada.endsWith('.mjs')) continue;
    const relativo = relative(raiz, completo);
    if (ehDispensado(relativo)) continue;
    saida.push({ caminho: relativo, conteudo: readFileSync(completo, 'utf8') });
  }
}

// ---------------------------------------------------------------------------
// A ISCA
// ---------------------------------------------------------------------------
// Hoje o contrato tem ZERO ocorrência das colunas marcadas: `professionals` e
// `entity_verifications` nasceram vazias e sem rota, exatamente como o ADR
// manda. Isso significa que as duas varreduras acima, rodando sobre o material
// real, não têm nada para achar — e "não achei nada" tem a mesma cor de
// "conferi e está limpo".
//
// A isca desfaz o empate. Ela desliga a dúvida obrigando as três peças a
// acusarem, a cada execução, um caso construído para ser reprovado. Se a isca
// passar, o portão reprova a si mesmo e diz qual peça parou de enxergar.

const MIGRACAO_ISCA = `
CREATE TABLE isca (
  quem_convidou uuid,
  inocente      text
);
COMMENT ON COLUMN isca.quem_convidou IS
  'Vinculo entre duas pessoas: NUNCA sai do servidor.';
COMMENT ON COLUMN isca.inocente IS
  'Coluna comum, sem marca nenhuma.';
`;

const CONTRATO_ISCA = `
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /isca:
    get:
      operationId: iscaQueDeveReprovar
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  quem_convidou: { type: string, format: uuid }
                  inocente: { type: string }
`;

const FONTE_ISCA = `
export function montarResposta(linha: { quem_convidou: string }) {
  return { quem_convidou: linha.quem_convidou };
}
`;

export function autoTeste(): string[] {
  const falhas: string[] = [];

  // Peça 1: a leitura das migrações separa a coluna marcada da coluna comum.
  const colunas = lerColunasQueNaoSaem([{ caminho: 'isca.sql', conteudo: MIGRACAO_ISCA }]);
  const nomes = new Set(colunas.map((c) => c.coluna));
  if (!nomes.has('quem_convidou')) {
    falhas.push(
      'a isca de migração passou: o portão parou de ler `NUNCA sai do servidor` do COMMENT ON COLUMN, ' +
        'e a partir daí ele não tem mais o que procurar em lugar nenhum',
    );
  }
  if (nomes.has('inocente')) {
    falhas.push(
      'a isca marcou uma coluna SEM a marca: o portão virou fonte de achado falso, ' +
        'que é como portão perde a confiança de quem o lê',
    );
  }

  // Peça 2: o contrato. Com a coluna marcada e a inocente lado a lado, só a
  // primeira pode ser acusada.
  const spec = parseYaml(CONTRATO_ISCA) as Record<string, unknown>;
  const noContrato = inspecionarContrato(spec, new Set(['quem_convidou']));
  if (!noContrato.some((a) => a.coluna === 'quem_convidou')) {
    falhas.push('a isca de contrato passou: o portão parou de enxergar a coluna em resposta');
  }
  if (inspecionarContrato(spec, new Set(['inocente'])).length === 0) {
    falhas.push(
      'o percurso do contrato não achou nem a coluna inocente quando pedido: ' +
        'ele parou de percorrer o schema, e o silêncio da peça 2 deixou de significar limpeza',
    );
  }

  // Peça 3: a varredura de código.
  const naFonte = inspecionarFontes(
    [{ caminho: 'isca.ts', conteudo: FONTE_ISCA }],
    new Set(['quem_convidou']),
  );
  if (naFonte.length === 0) {
    falhas.push('a isca de código passou: o portão parou de enxergar a coluna em código de servidor');
  }

  return falhas;
}

export function executar(raiz: string): number {
  console.info(`portao-colunas-que-nao-saem ${VERSAO_DO_PORTAO} | node ${process.version}`);

  const falhasDoAutoTeste = autoTeste();
  if (falhasDoAutoTeste.length > 0) {
    console.error('REPROVADO — o portão não conseguiu verificar a si mesmo:');
    for (const falha of falhasDoAutoTeste) console.error(`  - ${falha}`);
    return 1;
  }
  console.info('autoteste: a isca foi reprovada como deveria.');

  const diretorioDeMigracoes = join(raiz, 'migrations');
  let migracoes: Arquivo[];
  try {
    migracoes = readdirSync(diretorioDeMigracoes)
      .filter((nome) => nome.endsWith('.sql'))
      .map((nome) => ({
        caminho: join('migrations', nome),
        conteudo: readFileSync(join(diretorioDeMigracoes, nome), 'utf8'),
      }));
  } catch (erro) {
    console.error(
      `REPROVADO — não consegui ler ${diretorioDeMigracoes}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return 1;
  }

  const colunas = lerColunasQueNaoSaem(migracoes);
  if (colunas.length === 0) {
    console.error(
      'REPROVADO — nenhuma coluna marcada com `NUNCA sai do servidor` nas migrações. ' +
        'Ou a marca foi apagada de um COMMENT ON COLUMN, ou o formato do comentário mudou. ' +
        'Nos dois casos este portão passaria a aprovar tudo, e é por isso que ele reprova aqui.',
    );
    return 1;
  }

  const proibidas = new Set(colunas.map((c) => c.coluna));
  console.info(
    `colunas que não saem (${colunas.length}): ` +
      colunas.map((c) => `${c.tabela}.${c.coluna} [${c.origem}]`).join(', '),
  );

  let spec: Record<string, unknown>;
  const caminhoDaSpec = join(raiz, 'api', 'openapi.yaml');
  try {
    spec = parseYaml(readFileSync(caminhoDaSpec, 'utf8')) as Record<string, unknown>;
  } catch (erro) {
    console.error(
      `REPROVADO — a especificação não carrega (${caminhoDaSpec}): ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return 1;
  }

  const fontes: Arquivo[] = [];
  try {
    listarTypeScript(raiz, join(raiz, 'src'), fontes);
  } catch (erro) {
    console.error(
      `REPROVADO — não consegui varrer src/: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return 1;
  }
  if (fontes.length === 0) {
    console.error('REPROVADO — nenhum arquivo TypeScript varrido. Varredura vazia termina verde.');
    return 1;
  }

  const achados = [
    ...inspecionarContrato(spec, proibidas),
    ...inspecionarFontes(fontes, proibidas),
  ];

  if (achados.length > 0) {
    console.error(`REPROVADO — ${achados.length} saída(s) indevida(s):`);
    for (const achado of achados) {
      console.error(`  - ${achado.onde}: ${achado.coluna} — ${achado.motivo}`);
    }
    return 1;
  }

  // O alcance é dito a cada execução. "Não havia o que conferir" não pode sair
  // igual a "conferi e está certo": hoje as duas tabelas não têm rota, então o
  // zero abaixo é esperado, e quem faz a regra valer é a isca acima.
  console.info(
    `APROVADO — ${Object.keys((spec['paths'] as Record<string, unknown>) ?? {}).length} caminhos do contrato ` +
      `e ${fontes.length} arquivos de src/ percorridos, zero saída indevida.`,
  );
  return 0;
}

const executadoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('portao-colunas-que-nao-saem.js');
if (executadoDiretamente) {
  process.exit(executar(process.argv[2] ?? process.cwd()));
}
