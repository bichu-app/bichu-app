/**
 * Os rotulos de lista fechada do encontro dizem a MESMA coisa nas TRES
 * superficies -- e este arquivo e o unico lugar que confere isso.
 *
 * ## O QUE FOI MEDIDO, EM 21/10/2026, SOBRE `f60ba3fc`
 *
 * Tres mapas de rotulo (`NetworkEventDogAge`, `NetworkEventAmenity`,
 * `NetworkEventBringItem`) existem **tres vezes**, uma por superficie, com
 * **19 frases que o usuario le**:
 *
 * | superficie | arquivo                             | forma          |
 * | ---------- | ----------------------------------- | -------------- |
 * | app        | `app/lib/api/modelos_rede.dart`     | `enum` com rotulo |
 * | painel     | `admin/src/rede/dominio/rotulos.ts` | `Record<Enum, string>` |
 * | site       | `web/src/conteudo/encontro.ts`      | `ROTULOS`      |
 *
 * As 19 **concordavam** no dia da medicao. O problema nao e que elas divirjam
 * hoje: e que **nada reprovava se divergissem**. O comentario do site chega a
 * se declarar copia fiel -- *"com as palavras EXATAS do aplicativo"* -- sem
 * nenhuma conferencia que sustente a afirmacao. Foi assim que a frase de abrir
 * o app de mapas chegou a tres redacoes, **duas delas se declarando copia fiel
 * de uma quarta**, e foi assim que o rotulo do selo chegou a cinco.
 *
 * ## POR QUE UMA GUARDA, E NAO UMA FONTE UNICA
 *
 * As tres superficies sao tres builds: Dart, o pacote do painel e o do site.
 * Nao ha modulo que as tres importem, e **inventar um** -- um pacote de texto
 * publicado, ou geracao de codigo a partir do contrato -- e desenho novo, com
 * decisao de quem toca o produto, e nao refatoracao. Enquanto ele nao existir,
 * o que impede a quarta redacao e esta conferencia.
 *
 * **Portanto: a contagem de copias NAO caiu de 3 para 1 aqui.** Continuam tres.
 * O que mudou e que a divergencia passou a reprovar pelo nome do caso.
 *
 * ## ONDE ESTE ARQUIVO MORA, E POR QUE
 *
 * Em `src/tools/`, ao lado dos outros portoes que leem arquivo de fonte do
 * disco: o `eslint` deste repositorio recusa `node:fs` em `domain/` e
 * `application/`, e a `npm test` ja roda `src/**\/*.test.ts` -- entao esta
 * conferencia entra na esteira sem tocar no `Makefile` nem no `ci.yml`.
 * **Nenhum portao existente de `src/tools/` foi alterado.**
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const DART = 'app/lib/api/modelos_rede.dart';
const PAINEL = 'admin/src/rede/dominio/rotulos.ts';
const SITE = 'web/src/conteudo/encontro.ts';

type Mapa = Readonly<Record<string, string>>;

/**
 * Recorta o bloco de um seletor, e EXPLODE em vez de devolver vazio.
 *
 * Seletor que deixa de casar e o jeito classico de um portao destes ficar
 * verde sem medir: ele devolveria `{}` nas tres superficies e a comparacao
 * aprovaria por nao ter nada para comparar. Aqui ele estoura, e o controle
 * positivo abaixo ainda confere o TAMANHO de cada mapa.
 */
function recortar(texto: string, padrao: RegExp, onde: string): string {
  const casado = padrao.exec(texto);
  if (casado === null || casado[1] === undefined) {
    throw new Error(`o seletor ${padrao.source} não casou em ${onde}`);
  }
  return casado[1];
}

/** `qualquer('any', 'Qualquer idade'),` de dentro de um `enum` do Dart. */
function doEnumDart(texto: string, nomeDoEnum: string): Mapa {
  const bloco = recortar(texto, new RegExp(`enum ${nomeDoEnum} \\{([\\s\\S]*?)\\n\\n`), DART);
  const mapa: Record<string, string> = {};
  for (const m of bloco.matchAll(/\('([a-z_0-9]+)',\s*'([^']*)'\)/g)) {
    const chave = m[1];
    const rotulo = m[2];
    if (chave === undefined || rotulo === undefined) continue;
    mapa[chave] = rotulo;
  }
  return mapa;
}

/** `water: 'Água',` de dentro de um literal de objeto de TypeScript. */
function doObjetoTs(texto: string, abertura: string, onde: string): Mapa {
  const bloco = recortar(texto, new RegExp(`${abertura}([\\s\\S]*?)\\n\\s*\\}`), onde);
  const mapa: Record<string, string> = {};
  for (const m of bloco.matchAll(/^\s*([a-z_0-9]+):\s*'([^']*)',/gm)) {
    const chave = m[1];
    const rotulo = m[2];
    if (chave === undefined || rotulo === undefined) continue;
    mapa[chave] = rotulo;
  }
  return mapa;
}

const dart = readFileSync(DART, 'utf8');
const painel = readFileSync(PAINEL, 'utf8');
const site = readFileSync(SITE, 'utf8');

/** Os tres grupos, com o TAMANHO ESPERADO -- que e o controle positivo. */
const GRUPOS = [
  {
    nome: 'NetworkEventDogAge',
    quantos: 4,
    app: doEnumDart(dart, 'IdadeDosCaes'),
    painel: doObjetoTs(painel, 'export const IDADES: Record<IdadeDosCaes, string> = \\{', PAINEL),
    site: doObjetoTs(site, 'idade: \\{', SITE),
  },
  {
    nome: 'NetworkEventAmenity',
    quantos: 7,
    app: doEnumDart(dart, 'EstruturaDoLocal'),
    painel: doObjetoTs(painel, 'export const ESTRUTURAS: Record<Estrutura, string> = \\{', PAINEL),
    site: doObjetoTs(site, 'estrutura: \\{', SITE),
  },
  {
    nome: 'NetworkEventBringItem',
    quantos: 8,
    app: doEnumDart(dart, 'ItemParaLevar'),
    painel: doObjetoTs(painel, 'export const ITENS_PARA_LEVAR: Record<ItemParaLevar, string> = \\{', PAINEL),
    site: doObjetoTs(site, 'levar: \\{', SITE),
  },
] as const;

void describe('os rótulos do encontro dizem a mesma coisa no app, no painel e no site', () => {
  void it('a leitura achou os 19 rótulos nas três superfícies, e não mapas vazios', () => {
    // CONTROLE POSITIVO. Sem ele, um seletor que deixa de casar devolve `{}`
    // nas três, e a comparação abaixo aprova por não ter nada para comparar --
    // que é como portão deste repositório já ficou verde sem medir.
    for (const g of GRUPOS) {
      assert.equal(Object.keys(g.app).length, g.quantos, `${g.nome}: app`);
      assert.equal(Object.keys(g.painel).length, g.quantos, `${g.nome}: painel`);
      assert.equal(Object.keys(g.site).length, g.quantos, `${g.nome}: site`);
    }
  });

  for (const g of GRUPOS) {
    void it(`${g.nome}: as três superfícies têm as MESMAS chaves`, () => {
      const chaves = (m: Mapa): readonly string[] => Object.keys(m).sort();
      assert.deepEqual(chaves(g.painel), chaves(g.app), `${g.nome}: painel x app`);
      assert.deepEqual(chaves(g.site), chaves(g.app), `${g.nome}: site x app`);
    });

    void it(`${g.nome}: as três superfícies escrevem a MESMA frase`, () => {
      for (const [chave, noApp] of Object.entries(g.app)) {
        assert.equal(
          g.painel[chave],
          noApp,
          `${g.nome}.${chave}: o painel escreve ${JSON.stringify(g.painel[chave])} e o app ` +
            `escreve ${JSON.stringify(noApp)}. É a mesma frase para a mesma pessoa: ` +
            'alinhe as três, ou traga a decisão de mudar o texto para as três.',
        );
        assert.equal(
          g.site[chave],
          noApp,
          `${g.nome}.${chave}: o site escreve ${JSON.stringify(g.site[chave])} e o app ` +
            `escreve ${JSON.stringify(noApp)}. O cabeçalho de \`web/src/conteudo/encontro.ts\` ` +
            'promete "as palavras EXATAS do aplicativo" -- esta é a conferência da promessa.',
        );
      }
    });
  }
});
