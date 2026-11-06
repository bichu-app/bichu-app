import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DIMENSAO_MINIMA,
  LARGURA_MINIMA,
  alturaDoPiso,
  proporcaoDaMoldura,
  recusarDimensaoDeclaradaPequena,
  textoDaRecusaPorDimensao,
  type PropositoDaImagem,
} from '../modules/media/ports/imagem-de-catalogo.js';

const FONTE = 'src/modules/media/ports/imagem-de-catalogo.ts';

const ESTE_ARQUIVO = 'src/tools/dimensao-declarada-numa-fonte-so.test.ts';

const FRASE = /Mínimo de \$\{String\(/;

/** O espelho do piso no painel, que typecheca junto mas nao importa daqui. */
const FONTE_DO_PAINEL = 'admin/src/componentes/piso-da-imagem.ts';

/** A frase do worker, que vai para `rejection_reason` e o APP mostra. */
const FRASE_DO_WORKER = /A imagem precisa ter pelo menos \$\{String\(/;

/**
 * A fábrica do problema 422, que monta a MESMA frase -- e pode.
 *
 * Ela **recebe** o piso como parâmetro (`minima`) em vez de indexar a tabela,
 * então não tem como divergir dele: é o mesmo número por construção. A frase
 * dela não é igual à do worker de propósito -- a do 422 termina em *"Escolha
 * outra."* porque é resposta de rota, e a do worker vira `rejection_reason`.
 */
const FABRICA_DO_PROBLEMA = 'src/shared/http/errors.ts';

function montaARecusaNaMao(texto: string): boolean {
  return /dimensaoDeclaradaAbaixoDaMinima\(/.test(texto) && /DIMENSAO_MINIMA\[/.test(texto);
}

function todosOsFontes(raiz: string): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'generated' || entrada.name === 'node_modules') continue;
      achados.push(...todosOsFontes(caminho));
    } else if (entrada.name.endsWith('.ts')) {
      achados.push(caminho);
    }
  }
  return achados;
}

void describe('a recusa de dimensão declarada pequena tem uma fonte só', () => {
  const fontes = todosOsFontes('src');

  void it('a varredura alcança a árvore de verdade, e não uma lista vazia', () => {
    assert.ok(fontes.length > 300, `a varredura achou só ${String(fontes.length)} arquivos`);
    assert.ok(fontes.includes(FONTE), `a fonte ${FONTE} não está na varredura`);
    assert.ok(fontes.includes(ESTE_ARQUIVO), `a exclusão aponta para ${ESTE_ARQUIVO}, que não existe`);
  });

  void it('só a fonte monta a frase `Mínimo de N pixels.`', () => {
    const outros = fontes
      .filter((f) => f !== FONTE && f !== ESTE_ARQUIVO)
      .filter((f) => FRASE.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      outros,
      [],
      'a frase que o usuário lê voltou a ser montada fora da fonte. Chame ' +
        '`recusarDimensaoDeclaradaPequena` em vez de copiar: foram CINCO cópias em 21/10/2026.',
    );
  });

  void it('só a fonte junta `dimensaoDeclaradaAbaixoDaMinima` com `DIMENSAO_MINIMA[`', () => {
    const outros = fontes
      .filter((f) => f !== FONTE && f !== ESTE_ARQUIVO)
      .filter((f) => montaARecusaNaMao(readFileSync(f, 'utf8')));
    assert.deepEqual(outros, [], 'o bloco da recusa foi remontado fora da fonte');
  });

  void it('a recusa sai com o campo, o código e a frase, para os DEZ propósitos', () => {
    for (const [purpose, minima] of Object.entries(DIMENSAO_MINIMA)) {
      assert.throws(
        () =>
          recusarDimensaoDeclaradaPequena(
            purpose as keyof typeof DIMENSAO_MINIMA,
            minima.largura - 1,
            minima.altura - 1,
          ),
        (erro: unknown) => {
          const problema = erro as {
            problemType?: string;
            errors?: readonly { field: string; code: string; message: string }[];
          };
          assert.equal(problema.problemType, 'image-too-small', `propósito ${purpose}`);
          assert.deepEqual(
            problema.errors,
            [
              { field: 'width', code: 'minimum', message: `Mínimo de ${String(minima.largura)} pixels.` },
              { field: 'height', code: 'minimum', message: `Mínimo de ${String(minima.altura)} pixels.` },
            ],
            `propósito ${purpose}`,
          );
          return true;
        },
        `propósito ${purpose} não recusou a dimensão abaixo da mínima`,
      );
    }
  });

  void it('dimensão na mínima, acima dela e ausente NÃO são recusadas', () => {
    for (const [purpose, minima] of Object.entries(DIMENSAO_MINIMA)) {
      const p = purpose as keyof typeof DIMENSAO_MINIMA;
      recusarDimensaoDeclaradaPequena(p, minima.largura, minima.altura);
      recusarDimensaoDeclaradaPequena(p, minima.largura + 1, minima.altura + 1);
      recusarDimensaoDeclaradaPequena(p, undefined, undefined);
    }
  });

  void it('só a fonte monta a frase que o WORKER grava em `rejection_reason`', () => {
    const outros = fontes
      .filter((f) => f !== FONTE && f !== ESTE_ARQUIVO && f !== FABRICA_DO_PROBLEMA)
      .filter((f) => FRASE_DO_WORKER.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      outros,
      [],
      'a frase da recusa por dimensão voltou a ser montada fora da fonte. Chame ' +
        '`textoDaRecusaPorDimensao`: até 03/11/2026 ela era montada dentro de ' +
        '`processar-imagem-de-catalogo.ts`, longe da tabela do piso.',
    );
  });

  /**
   * ## O PISO É DERIVADO, E A LARGURA É A DECIDIDA
   *
   * Até 03/11/2026 `DIMENSAO_MINIMA` era uma tabela de PARES escritos à mão, e
   * foi por isso que o número da logo (600, que É quadrado) vazou para uma
   * moldura 16:9 em 18/10/2026 e travou o cliente duas vezes. Agora só a
   * largura é decidida; a altura sai da proporção da maior derivada.
   *
   * Os pares abaixo estão escritos à mão **de propósito**: recalcular com a
   * mesma `alturaDoPiso` que monta a tabela seria tautologia, e um portão que
   * não pode reprovar não mede nada.
   */
  void it('a LARGURA mínima de cada propósito é a decidida', () => {
    assert.deepEqual(LARGURA_MINIMA, {
      store_item: 800,
      network_event: 600,
      directory_logo: 256,
      directory_photo: 1280,
      directory_gallery: 1280,
      directory_suggestion_logo: 256,
      directory_suggestion_photo: 600,
      user_photo: 300,
      user_showcase: 600,
      user_publication: 600,
      // A FOTO DE CAPA DO PET (cliente, 06/11/2026). 1280 e a MESMA largura de
      // `directory_photo`, a outra faixa 16:9 do produto, e vem da decisao do
      // cliente de 02/11/2026. A altura NAO esta aqui, e e esse o ponto do
      // arquivo: ela sai da proporcao da `banner` 1280 x 720 e da 720, o que o
      // caso abaixo confere com o par escrito a mao.
      pet_cover: 1280,
    });
  });

  void it('o par de cada propósito é o que a moldura impõe à largura decidida', () => {
    assert.deepEqual(DIMENSAO_MINIMA, {
      store_item: { largura: 800, altura: 800 },
      network_event: { largura: 600, altura: 338 },
      directory_logo: { largura: 256, altura: 256 },
      directory_photo: { largura: 1280, altura: 720 },
      directory_gallery: { largura: 1280, altura: 720 },
      directory_suggestion_logo: { largura: 256, altura: 256 },
      directory_suggestion_photo: { largura: 600, altura: 338 },
      user_photo: { largura: 300, altura: 300 },
      user_showcase: { largura: 600, altura: 600 },
      user_publication: { largura: 600, altura: 600 },
      // 1280 / (16/9) = 720, e o par fecha. O quadrado de 600 x 600 do RETRATO
      // (`DIMENSAO_MINIMA_DA_FOTO_DE_PET`) NAO entra aqui: a capa anda na
      // esteira de catalogo e o retrato na dele, e aplicar piso quadrado a
      // recorte 16:9 e a regra impossivel que travou o cliente em 02/11/2026.
      pet_cover: { largura: 1280, altura: 720 },
    });
  });

  void it('a proporção sai da MAIOR derivada com altura, e a Loja é livre', () => {
    assert.equal(proporcaoDaMoldura('store_item'), null, 'a Loja não corta: `fit: inside`');
    assert.equal(proporcaoDaMoldura('network_event'), 16 / 9);
    assert.equal(proporcaoDaMoldura('directory_photo'), 16 / 9);
    assert.equal(proporcaoDaMoldura('directory_suggestion_photo'), 16 / 9);
    assert.equal(proporcaoDaMoldura('directory_logo'), 1);
    assert.equal(proporcaoDaMoldura('user_showcase'), 1);
    // A `thumb` do encontro é 480 x 360, que é 4:3: por isso a regra é "a MAIOR
    // com altura", e não "todas as derivadas concordam".
    assert.notEqual(480 / 360, 16 / 9);
  });

  void it('a altura de todo propósito é a derivada, e nenhuma é escrita ao lado', () => {
    for (const purpose of Object.keys(LARGURA_MINIMA) as PropositoDaImagem[]) {
      assert.equal(
        DIMENSAO_MINIMA[purpose].altura,
        alturaDoPiso(LARGURA_MINIMA[purpose], proporcaoDaMoldura(purpose)),
        `propósito ${purpose}`,
      );
    }
  });

  /**
   * ## O PAINEL E O SERVIDOR TÊM DE CONCORDAR, E NADA COBRAVA ISSO
   *
   * São duas árvores: o painel não importa daqui (resolução de pacote sobe para
   * a raiz, mas o módulo é outro), então a concordância era só de palavra. Aqui
   * ela é medida, lendo a fonte do painel como TEXTO -- o idioma que os outros
   * portões desta pasta já usam.
   */
  void it('as larguras decididas do painel são as mesmas do servidor', () => {
    const texto = readFileSync(FONTE_DO_PAINEL, 'utf8');
    const bloco = /export const LARGURA_MINIMA: Record<Proposito, number> = \{([^}]*)\}/.exec(texto);
    const corpo = bloco?.[1];
    assert.ok(corpo, `não achei \`LARGURA_MINIMA\` em ${FONTE_DO_PAINEL}`);
    const doPainel = Object.fromEntries(
      [...corpo.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [String(m[1]), Number(m[2])]),
    );
    // O controle positivo: lista vazia aprovaria qualquer divergência.
    assert.equal(Object.keys(doPainel).length, 5, `o painel declara ${String(Object.keys(doPainel).length)} propósitos`);
    for (const [purpose, largura] of Object.entries(doPainel)) {
      assert.equal(
        largura,
        LARGURA_MINIMA[purpose as PropositoDaImagem],
        `\`${purpose}\` discorda entre o painel e o servidor`,
      );
    }
  });

  void it('a fábrica do 422 RECEBE o piso, e não escreve número nenhum', () => {
    const texto = readFileSync(FABRICA_DO_PROBLEMA, 'utf8');
    const bloco = /imagemPequenaDemais:[\s\S]*?\}\),/.exec(texto);
    assert.ok(bloco, `não achei \`imagemPequenaDemais\` em ${FABRICA_DO_PROBLEMA}`);
    assert.match(bloco[0], /minima: \{ largura: number; altura: number \}/, 'ela deixou de receber o piso');
    assert.match(bloco[0], /minima\.largura/, 'ela deixou de usar o piso recebido');
    assert.deepEqual(
      bloco[0].match(/\b\d{3,4}\b/g),
      null,
      'a fábrica do 422 passou a ter dimensão escrita à mão: ela tem de receber o piso.',
    );
  });

  void it('a frase do worker carrega os números da tabela, e não escritos à mão', () => {
    assert.equal(textoDaRecusaPorDimensao('network_event'), 'A imagem precisa ter pelo menos 600 x 338 pixels.');
    assert.equal(
      textoDaRecusaPorDimensao('directory_suggestion_photo'),
      'A imagem precisa ter pelo menos 600 x 338 pixels.',
    );
    // Estes dois NÃO mudaram de número, e é por isso que a grafia `x` ficou.
    assert.equal(textoDaRecusaPorDimensao('user_showcase'), 'A imagem precisa ter pelo menos 600 x 600 pixels.');
    assert.equal(textoDaRecusaPorDimensao('directory_photo'), 'A imagem precisa ter pelo menos 1280 x 720 pixels.');
  });
});
