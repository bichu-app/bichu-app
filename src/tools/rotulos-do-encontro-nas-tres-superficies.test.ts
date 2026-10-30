/**
 * Os rotulos de lista fechada do encontro dizem a MESMA coisa nas TRES superficies
 * -- e este arquivo e o unico lugar que confere isso.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const DART = 'app/lib/api/modelos_rede.dart';
const PAINEL = 'admin/src/rede/dominio/rotulos.ts';
const SITE = 'web/src/conteudo/encontro.ts';

type Mapa = Readonly<Record<string, string>>;

/** Recorta o bloco de um seletor, e EXPLODE em vez de devolver vazio. */
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
