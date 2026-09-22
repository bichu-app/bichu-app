/**
 * Identidade do build, calculada A PARTIR DO PRÓPRIO ARTEFATO.
 *
 * Por que este arquivo existe
 * ---------------------------
 * O critério 12 de BICHUS-13 pede portabilidade **provada por execução** nos
 * dois destinos. Até hoje a prova era: o mesmo código-fonte foi construído duas
 * vezes e as duas subiram. Isso não prova nada sobre o artefato — `compose.yaml`
 * declara `image: bichu-app:${IMAGE_TAG:-local}` **com** `build:`, então cada
 * destino constrói a própria imagem, em momento diferente, e nada compara as
 * duas. `/v1/health` devolvia `version: 0.1.0`, que é o `package.json` e é o
 * mesmo valor em qualquer build desde que alguém escreveu aquele número.
 *
 * O que este módulo calcula e o que ele NÃO calcula
 * -------------------------------------------------
 * `artifact` é um resumo SHA-256 sobre **os arquivos que o processo realmente
 * carrega**: todo `.js` de `dist` (o código compilado que está rodando), o contrato
 * (`api/openapi.yaml`, lido na subida por `carregarContrato`) e o
 * `package.json`. Ele é calculado lendo o disco de DENTRO do container, na
 * subida, e por isso não é declarado por ninguém: é evidência, não afirmação.
 *
 * Dois destinos com o mesmo `artifact` rodam o mesmo código compilado e o mesmo
 * contrato. É exatamente isso, e nada além disso:
 *
 *  - NÃO é o digest da imagem Docker. Base, `node_modules` e camadas do
 *    `Dockerfile` ficam de fora: dois builds do mesmo fonte com bases
 *    diferentes dariam o MESMO `artifact`. Quem quiser comparar imagem compara
 *    digest de registry, e isso exige publicar a imagem (ver o relatório de
 *    BICHUS-13, item 3 do QA).
 *  - NÃO distingue o alvo `dev` do alvo `prod`, e isso é de propósito: os dois
 *    copiam `--from=build /app/dist`, então o código que executa é o mesmo. A
 *    divergência de alvo entre destinos é declarada em
 *    `src/tools/comparar-destinos.ts`, que é onde ela pode ser conferida.
 *
 * `commit` é outra coisa, e a diferença está no nome do campo: ele é
 * **declarado** por quem constrói, pela variável `BUILD_COMMIT`. Ele não se
 * calcula do disco porque `.git` está no `.dockerignore` e a imagem final não
 * tem git — só pode ser dito por quem tem o repositório na mão. Era por isso
 * que `artifact` funcionava e ele não: um é evidência, o outro depende de
 * alguém fornecer, e ninguém fornecia.
 *
 * Desde a BICHUS-210 ele VIAJA DENTRO DA IMAGEM: o `Dockerfile` tem o `ARG
 * BUILD_COMMIT`, grava o valor como `ENV` nos três alvos finais e **reprova o
 * build** quando ele falta ou não tem forma de commit. Promover a imagem entre
 * ambientes promove o commit junto, e é isso que torna `commit` comparável
 * entre destinos — antes só `artifact` era.
 *
 * O que sobrou de `null` aqui, e por quê: fora de uma imagem construída não há
 * `ARG` nenhum. `npm test`, `npm run dev` e qualquer execução direta de `dist/`
 * no laptop caem nesse caso, e derrubar a subida ali trocaria um silêncio
 * honesto por um obstáculo em quem desenvolve. **Numa imagem construída `null`
 * não é estado alcançável**, e a esteira reprova se ele aparecer: ver
 * `infra/verificacao/verificar-commit-no-health.mjs`, que roda contra a pilha
 * de pé no job `integracao` e contra o destino hospedado em `dois-destinos`.
 */
/*
 * POR QUE O DIRETORIO SE CHAMA `artefato` E NAO `build`
 * -----------------------------------------------------
 * `.gitignore` tem `build/` na linha 64, sem ancora de raiz, e um padrao assim
 * casa em QUALQUER nivel: `src/shared/build/` entrava na lista de ignorados e
 * o modulo inteiro — com o teste ao lado — nunca chegaria a um commit. O `git
 * status` nao diz nada nesse caso; ele simplesmente nao lista o diretorio, e a
 * ausencia de uma linha e a coisa mais facil de nao ver.
 * Conferido com `git check-ignore -v` em 19/09.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { optionalEnv } from '../config/env.js';

export interface IdentidadeDoArtefato {
  /**
   * Resumo do conteúdo do artefato, 16 dígitos hexadecimais.
   *
   * Truncado porque ele **identifica**, não autentica: quem o compara está
   * conferindo se dois builds nossos coincidem, e 64 bits tornam a coincidência
   * por acaso impossível na prática. Um resumo inteiro na resposta da sonda só
   * aumentaria o corpo.
   */
  readonly artifact: string;
  /** Commit declarado em `BUILD_COMMIT`, ou `null` quando ninguém declarou. */
  readonly commit: string | null;
}

/**
 * O que entra no resumo. Lista fechada e explícita: varrer a raiz inteira faria
 * o resumo mudar com qualquer arquivo que alguém deixasse ao lado, e um
 * identificador que muda sozinho não identifica nada.
 */
const ARVORES = [{ caminho: 'dist', extensao: '.js' }] as const;
const ARQUIVOS = ['api/openapi.yaml', 'package.json'] as const;

/**
 * Diretório de RASCUNHO: nome começando com `_`, em qualquer nível de `dist`.
 *
 * `tsc -p tsconfig.build.json` nunca emite um diretório assim — não existe
 * `src/_*` — então a regra não corta nada do artefato. O que ela corta é a
 * saída de comando que escreve DENTRO de `dist` com outro `--outDir`, e isso
 * só acontece fora do container: `npm test` deixa `dist/_tests`, e nesta
 * máquina, em 19/09, havia também um `dist/_probe` que nenhum script do
 * repositório gera — alguém rodou `tsc` à mão e o diretório ficou.
 *
 * Sem este corte, os dois apareceram: o resumo calculado na raiz do
 * repositório deu `d5f7506186d57b6f` e o da MESMA fonte dentro da imagem deu
 * `e1a957e9ed3a0566`. A lista fixa que existia aqui (`_tests` e mais nada) teria
 * envelhecido no primeiro diretório novo, e o sintoma seria uma comparação
 * entre destinos reprovando sem que nada estivesse errado — que é como um
 * portão perde a confiança de quem o lê.
 */
function ehRascunho(nome: string): boolean {
  return nome.startsWith('_');
}

/** Erro de subida: o processo não consegue dizer o que ele é. */
export class ArtefatoIlegivel extends Error {}

function arquivosDaArvore(raizDaArvore: string, extensao: string): string[] {
  let entradas;
  try {
    entradas = readdirSync(raizDaArvore, { withFileTypes: true });
  } catch (erro) {
    throw new ArtefatoIlegivel(
      `não consegui ler ${raizDaArvore} para calcular a identidade do artefato: ${String(erro)}`,
    );
  }
  const encontrados: string[] = [];
  for (const entrada of entradas) {
    const completo = join(raizDaArvore, entrada.name);
    if (entrada.isDirectory()) {
      if (ehRascunho(entrada.name)) continue;
      encontrados.push(...arquivosDaArvore(completo, extensao));
    } else if (entrada.isFile() && entrada.name.endsWith(extensao)) {
      encontrados.push(completo);
    }
  }
  return encontrados;
}

/**
 * Raiz da aplicação deduzida da posição deste módulo compilado
 * (`dist/shared/artefato/identidade-do-artefato.js` -> três níveis acima).
 *
 * Calculada quando pedida, e não no carregamento: sob `npm test` o mesmo módulo
 * mora em `dist/_tests/src/shared/artefato/`, e um valor congelado na importação
 * apontaria para o lugar errado na suíte inteira. Quem testa passa a raiz.
 */
export function raizDaAplicacao(): string {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

/**
 * Resumo do conteúdo do artefato.
 *
 * O caminho relativo entra no resumo junto do conteúdo: sem ele, renomear um
 * arquivo sem mudar nenhum byte não mudaria o resumo. Os caminhos são
 * normalizados para `/` para que o valor não dependa do sistema de arquivos.
 */
export function resumirArtefato(raiz: string): string {
  const caminhos: string[] = [];
  for (const { caminho, extensao } of ARVORES) {
    caminhos.push(...arquivosDaArvore(join(raiz, caminho), extensao));
  }
  for (const caminho of ARQUIVOS) {
    const completo = join(raiz, caminho);
    try {
      if (!statSync(completo).isFile()) throw new Error('não é arquivo');
    } catch (erro) {
      throw new ArtefatoIlegivel(
        `${caminho} faz parte da identidade do artefato e não pôde ser lido em ${raiz}: ` +
          `${String(erro)}`,
      );
    }
    caminhos.push(completo);
  }

  if (caminhos.length === 0) {
    // Zero arquivo produziria um resumo perfeitamente estável e perfeitamente
    // vazio — o mesmo valor em qualquer build, que é o defeito que este módulo
    // existe para não ter.
    throw new ArtefatoIlegivel(
      `nenhum arquivo encontrado para a identidade do artefato em ${raiz}: o resumo seria o ` +
        'mesmo em qualquer build',
    );
  }

  const total = createHash('sha256');
  for (const completo of caminhos.map((c) => relative(raiz, c)).sort()) {
    const conteudo = readFileSync(join(raiz, completo));
    total.update(completo.split(sep).join('/'));
    total.update('\0');
    total.update(createHash('sha256').update(conteudo).digest());
    total.update('\n');
  }
  return total.digest('hex').slice(0, 16);
}

/**
 * `BUILD_COMMIT` conferido na forma.
 *
 * Valor com forma errada **derruba a subida** com o nome da variável na
 * mensagem, na mesma linha dos critérios 5 e 11: uma sonda que devolvesse
 * `commit: "ultimo"` seria pior que uma sem campo nenhum, porque a comparação
 * entre destinos passaria a comparar duas frases.
 */
export function lerCommitDeclarado(
  ler: (nome: string) => string | undefined = optionalEnv,
): string | null {
  const bruto = ler('BUILD_COMMIT');
  if (bruto === undefined) return null;
  const limpo = bruto.trim();
  if (!/^[0-9a-f]{7,40}$/.test(limpo)) {
    throw new ArtefatoIlegivel(
      `BUILD_COMMIT não parece um commit: esperado de 7 a 40 dígitos hexadecimais minúsculos, ` +
        `veio ${JSON.stringify(bruto)}. Deixe a variável ausente em vez de preenchê-la com ` +
        'qualquer coisa: `null` é honesto, um valor inventado não é',
    );
  }
  return limpo;
}

export function identidadeDoArtefato(raiz: string = raizDaAplicacao()): IdentidadeDoArtefato {
  return { artifact: resumirArtefato(raiz), commit: lerCommitDeclarado() };
}
