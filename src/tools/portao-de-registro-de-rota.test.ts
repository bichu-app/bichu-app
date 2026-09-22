/**
 * Critério 2 da BICHUS-178: *"teste ou portão que tenta registrar uma rota
 * contornando a aplicação e reprova se conseguir"*.
 *
 * As iscas vivem **em memória**, sobrepostas ao programa real pelo hospedeiro
 * de compilação. Isca gravada em `src/` deixa lixo quando o teste quebra no
 * meio, e lixo em `src/` é a próxima coisa que o portão enxerga.
 *
 * Quatro delas existem porque a versão anterior deste portão foi reprovada em
 * campo, e cada uma fixa um jeito de contorná-lo:
 *
 * 1. **`escopo`** — o furo de verdade. `app.register((escopo, ...) => ...)` em
 *    `src/bin/api.ts` é onde as seis famílias de rotas são registradas, e
 *    `escopo` não estava na lista de nomes da expressão regular antiga.
 * 2. **nome que ninguém listaria** — prova que a regra não depende de nome
 *    nenhum. Se um dia ela voltar a depender, é esta que reprova.
 * 3. **acesso por colchete** — a mesma chamada escrita de outra forma. A versão
 *    de texto só via o ponto.
 * 4. **a fixture "consertada"** — a lista de permitidos não pode ganhar um
 *    verbo de registro. É o jeito preguiçoso de fazer este arquivo ficar verde,
 *    e ele tem teste próprio.
 */
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

/**
 * As iscas reproduzem o `register` prefixado de `api.ts` letra por letra, sem
 * anotar o tipo do escopo: é o framework que o infere, e era exatamente por aí
 * que o registro clandestino passava.
 */
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

// Um programa por cenário, e só dois: montar o programa é o custo desta
// verificação (cerca de meio segundo), e um por caso multiplicaria isso por
// quatro sem medir nada a mais.
const varreduraReal = varrerRegistroDireto(criarPrograma(raiz), raiz);
const varreduraComIscas = varrerRegistroDireto(criarPrograma(raiz, ISCAS), raiz);

void describe('portão do registro de rota', () => {
  void it('a árvore de src/ registra tudo por registrarRota', () => {
    // Verificação que não consegue verificar REPROVA: uma varredura que não
    // achou arquivo nenhum passaria com zero achados, e zero achados é o
    // resultado que ela produz quando está funcionando.
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
    // Se o framework renomear a interface que o portão vigia, ele para de achar
    // qualquer coisa — inclusive a chamada que SABEMOS existir. Zero aqui é
    // cegueira, e cegueira precisa reprovar em vez de aprovar por silêncio.
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
    // O arquivo TEM um servidor de verdade e chama um membro permitido. Sem
    // isso, o "zero achados" viria da ausência de tipo, não da leitura correta.
    assert.deepEqual(em(varreduraComIscas.clandestinos, CONTROLE_NEGATIVO), []);
  });

  void it('a lista de permitidos não pode ganhar um verbo de registro', () => {
    // O jeito preguiçoso de fazer este arquivo ficar verde é acrescentar o
    // membro reprovado à lista de permitidos. Isto reprova esse conserto.
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

/**
 * BICHUS-217: a barreira de tipo passa a ter isca.
 *
 * `RegistradorDeRotas = Omit<FastifyInstance, MetodoDeRegistro>` era afirmada em
 * comentário e por mais nada. O QA trocou o `Omit` por `FastifyInstance` e mediu
 * 856 de 856 verdes com `eslint .` limpo: a primeira camada de defesa podia
 * sumir num refactor sem que nada acusasse.
 *
 * Os casos abaixo perguntam ao COMPILADOR, e sobre o EFEITO do tipo, nunca
 * sobre o texto dele. Varredura textual do nome é o furo que já custou dois
 * portões nesta sessão, e escrever um terceiro aqui seria repetir a classe:
 * `Omit<FastifyInstance, never>` casa com qualquer expressão regular razoável e
 * não esconde nada, enquanto um `Exclude` equivalente não casa com nenhuma e
 * esconde tudo.
 *
 * UM CASO POR REGRA, e nenhuma cadeia `if/elif`: uma isca que reprova por dois
 * motivos ao mesmo tempo aprova a regra quebrada, porque desligar a regra que
 * ela existe para testar deixa o outro motivo reprovando e o verde permanece.
 */
void describe('a barreira de tipo do RegistradorDeRotas', () => {
  // Uma medição só: montar o programa é o custo, e nenhum caso muda o estado.
  const barreira = medirBarreiraDeTipo(raiz);

  void it('CONTROLE DE CEGUEIRA: a sonda enxergou o FastifyInstance inteiro', () => {
    // Se o tipo não resolver -- dependência ausente, `import` renomeado, caminho
    // da sonda errado --, `escondidos` vem vazio, e vazio é indistinguível de
    // "a barreira foi desfeita". Sem este caso, o portão inteiro aprovaria por
    // cegueira, que é o defeito irmão desta entrega (BICHUS-216).
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
    // O conserto preguiçoso do caso acima é esvaziar a lista até ela concordar
    // com o `Omit` desfeito. Isto reprova esse conserto.
    assert.equal(
      MEMBROS_QUE_O_OMIT_ESCONDE.length,
      9,
      'a lista dos membros que o `Omit` precisa esconder mudou de tamanho. Encolhê-la é ' +
        'o jeito de fazer o caso anterior ficar verde sem barreira nenhuma.',
    );

    // E o outro conserto preguiçoso: mover o verbo para a lista de permitidos,
    // onde a varredura deixa de reprová-lo. As duas listas são complementares e
    // precisam continuar sendo.
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
    // A isca é o furo real escrito por extenso: `escopo.post(...)` com o tipo
    // que os dez pontos de rota recebem. Ela é a prova negativa guardada no
    // repositório, e não uma frase dizendo que alguém testou.
    assert.ok(
      barreira.errosNaChamadaEscondida.includes(PROPRIEDADE_INEXISTENTE),
      '`escopo.post(...)` COMPILOU sobre `RegistradorDeRotas`. A barreira que acusa no ' +
        'editor deixou de existir, e sobrou só a varredura, que acusa depois e só ' +
        `enquanto alguém a mantiver afiada. Erros vistos: [${barreira.errosNaChamadaEscondida.join(', ')}]`,
    );
  });

  void it('CONTROLE POSITIVO: a mesma chamada sobre o FastifyInstance compila limpa', () => {
    // Sem este caso, o anterior aprovaria por acidente: uma sonda que não
    // compila por qualquer outro motivo (import quebrado, caminho errado,
    // opção de compilação nova) também traria erro, e o erro seria lido como
    // "a barreira pegou". Aqui se prova que o que reprova lá é a barreira.
    assert.deepEqual(
      barreira.errosNoControle,
      [],
      'a sonda de controle não compila, então o erro da isca pode não ter vindo da ' +
        `barreira. Erros: [${barreira.errosNoControle.join(', ')}]`,
    );
  });
});
