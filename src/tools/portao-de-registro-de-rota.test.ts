import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  criarPrograma,
  medirBarreiraDeTipo,
  varrerRegistroDireto,
  MEMBROS_QUE_NAO_REGISTRAM,
  MEMBROS_QUE_O_OMIT_ESCONDE,
  PROPRIEDADE_INEXISTENTE,
  type ArquivosEmMemoria,
  type RegistroDireto,
} from './portao-de-registro-de-rota.js';

const raiz = process.cwd();
const dentroDeSrc = (nome: string): string => path.join(raiz, 'src', 'tools', '_iscas', nome);

const ISCA_ESCOPO = dentroDeSrc('escopo-prefixado.ts');
const ISCA_NOME_IMPROVAVEL = dentroDeSrc('nome-improvavel.ts');
const ISCA_COLCHETE = dentroDeSrc('acesso-por-colchete.ts');
const CONTROLE_NEGATIVO = dentroDeSrc('so-prosa.ts');

const ISCAS: ArquivosEmMemoria = new Map([
  [
    ISCA_ESCOPO,
    [
      "import type { FastifyInstance } from 'fastify';",
      'export function montar(app: FastifyInstance): void {',
      '  void app.register(',
      '    (escopo, _opcoes, pronto) => {',
      "      escopo.post('/isca-clandestina', async () => ({ ok: true }));",
      '      pronto();',
      '    },',
      "    { prefix: '/v1' },",
      '  );',
      '}',
    ].join('\n'),
  ],
  [
    ISCA_NOME_IMPROVAVEL,
    [
      "import type { FastifyInstance } from 'fastify';",
      'export function montar(oPortaoNaoSabeEsteNome: FastifyInstance): void {',
      "  oPortaoNaoSabeEsteNome.put('/isca-de-nome-nao-listado', async () => ({ ok: true }));",
      '}',
    ].join('\n'),
  ],
  [
    ISCA_COLCHETE,
    [
      "import type { FastifyInstance } from 'fastify';",
      'export function montar(x: FastifyInstance): void {',
      "  x['delete']('/isca-por-colchete', async () => ({ ok: true }));",
      '}',
    ].join('\n'),
  ],
  [
    CONTROLE_NEGATIVO,
    [
      "import type { FastifyInstance } from 'fastify';",
      '/**',
      ' * O registro era `app.post(rota.path, handler)`, e o teto ficava de fora.',
      ' */',
      'export function montar(app: FastifyInstance): void {',
      "  // app.get('/antigo', handler)",
      '  const exemplo = "app.delete(\'/em-texto\')";',
      '  void exemplo;',
      "  void app.addHook('onRequest', async () => undefined);",
      '}',
    ].join('\n'),
  ],
]);

const relativo = (absoluto: string): string => path.relative(raiz, absoluto);
const em = (achados: readonly RegistroDireto[], arquivo: string): readonly RegistroDireto[] =>
  achados.filter((achado) => achado.caminho === relativo(arquivo));

const varreduraReal = varrerRegistroDireto(criarPrograma(raiz), raiz);
const varreduraComIscas = varrerRegistroDireto(criarPrograma(raiz, ISCAS), raiz);

void describe('portão do registro de rota', () => {
  void it('a árvore de src/ registra tudo por registrarRota', () => {
    assert.ok(
      varreduraReal.arquivosVarridos > 50,
      `varreu ${String(varreduraReal.arquivosVarridos)} arquivos de src/, o que é pouco demais para ser a árvore inteira`,
    );

    assert.deepEqual(
      varreduraReal.clandestinos,
      [],
      'há registro de rota fora de `registrarRota`:\n' +
        varreduraReal.clandestinos
          .map((a) => `  ${a.caminho}:${String(a.linha)}  ${a.trecho}`)
          .join('\n'),
    );
  });

  void it('CONTROLE POSITIVO: o registro legítimo continua sendo visto', () => {
    assert.ok(
      varreduraReal.noAutorizado.length >= 1,
      'o portão não enxergou nem o registro legítimo dentro de `registrar-rota.ts`. ' +
        'Ele ficou cego, e o "zero clandestinos" do caso anterior não prova nada.',
    );
  });

  void it('ISCA 1: `escopo.post` dentro do register prefixado é encontrado', () => {
    const achados = em(varreduraComIscas.clandestinos, ISCA_ESCOPO);

    assert.equal(
      achados.length,
      1,
      'o portão não viu o registro direto por dentro do escopo prefixado. É o furo ' +
        'que a versão de expressão regular tinha: `escopo` não estava na lista de nomes, ' +
        'e é dentro dele que as seis famílias de rotas são registradas.',
    );
    assert.equal(achados[0]?.membro, 'post');
  });

  void it('ISCA 2: um nome de variável que ninguém listaria também é encontrado', () => {
    const achados = em(varreduraComIscas.clandestinos, ISCA_NOME_IMPROVAVEL);

    assert.equal(
      achados.length,
      1,
      'o portão voltou a depender do nome do receptor. Enquanto ele depender, a ' +
        'próxima variável com nome novo passa batida, que é a classe inteira do defeito.',
    );
    assert.equal(achados[0]?.membro, 'put');
  });

  void it('ISCA 3: o acesso por colchete é a mesma chamada, e também é encontrado', () => {
    const achados = em(varreduraComIscas.clandestinos, ISCA_COLCHETE);

    assert.equal(achados.length, 1, 'o portão só enxerga o acesso por ponto');
    assert.equal(achados[0]?.membro, 'delete');
  });

  void it('controle negativo: chamada citada em comentário ou em texto não é achado', () => {
    assert.deepEqual(em(varreduraComIscas.clandestinos, CONTROLE_NEGATIVO), []);
  });

  void it('a lista de permitidos não pode ganhar um verbo de registro', () => {
    const VERBOS_QUE_REGISTRAM = [
      'route',
      'all',
      'get',
      'head',
      'post',
      'put',
      'patch',
      'delete',
      'options',
    ];
    const vazados = VERBOS_QUE_REGISTRAM.filter((verbo) => MEMBROS_QUE_NAO_REGISTRAM.has(verbo));

    assert.deepEqual(
      vazados,
      [],
      `${vazados.join(', ')} registra(m) rota e está(ão) na lista de permitidos. ` +
        'A lista existe para o que NÃO registra; pôr um verbo nela é desligar o portão ' +
        'pelo lado de dentro.',
    );
  });
});

void describe('a barreira de tipo do RegistradorDeRotas', () => {
  const barreira = medirBarreiraDeTipo(raiz);

  void it('CONTROLE DE CEGUEIRA: a sonda enxergou o FastifyInstance inteiro', () => {
    assert.ok(
      barreira.membrosDoServidor > 20,
      `a sonda viu ${String(barreira.membrosDoServidor)} membros no FastifyInstance. ` +
        'O tipo não resolveu, então nada do que este bloco afirma foi medido de verdade.',
    );
  });

  void it('o Omit esconde exatamente os membros que registram rota', () => {
    assert.deepEqual(
      barreira.escondidos,
      [...MEMBROS_QUE_O_OMIT_ESCONDE],
      'o que `RegistradorDeRotas` esconde do `FastifyInstance` deixou de ser a lista de ' +
        'registro. Lista vazia significa que o `Omit` foi desfeito (é o que acontece com ' +
        '`= FastifyInstance`) e os dez pontos de rota voltaram a poder chamar `.post` ' +
        'direto; lista menor significa que um verbo caiu de `MetodoDeRegistro` e voltou a ' +
        'ser alcançável.',
    );
  });

  void it('a lista do que precisa ser escondido não pode encolher nem virar prosa', () => {
    assert.equal(
      MEMBROS_QUE_O_OMIT_ESCONDE.length,
      9,
      'a lista dos membros que o `Omit` precisa esconder mudou de tamanho. Encolhê-la é ' +
        'o jeito de fazer o caso anterior ficar verde sem barreira nenhuma.',
    );

    const nosDois = MEMBROS_QUE_O_OMIT_ESCONDE.filter((membro) =>
      MEMBROS_QUE_NAO_REGISTRAM.has(membro),
    );
    assert.deepEqual(
      nosDois,
      [],
      `${nosDois.join(', ')} está(ão) nas duas listas: escondido pelo tipo e permitido ` +
        'pela varredura. Uma das duas está errada, e a combinação desliga as duas camadas.',
    );
  });

  void it('ISCA: o registro clandestino sobre o RegistradorDeRotas NÃO compila', () => {
    assert.ok(
      barreira.errosNaChamadaEscondida.includes(PROPRIEDADE_INEXISTENTE),
      '`escopo.post(...)` COMPILOU sobre `RegistradorDeRotas`. A barreira que acusa no ' +
        'editor deixou de existir, e sobrou só a varredura, que acusa depois e só ' +
        `enquanto alguém a mantiver afiada. Erros vistos: [${barreira.errosNaChamadaEscondida.join(', ')}]`,
    );
  });

  void it('CONTROLE POSITIVO: a mesma chamada sobre o FastifyInstance compila limpa', () => {
    assert.deepEqual(
      barreira.errosNoControle,
      [],
      'a sonda de controle não compila, então o erro da isca pode não ter vindo da ' +
        `barreira. Erros: [${barreira.errosNoControle.join(', ')}]`,
    );
  });
});
