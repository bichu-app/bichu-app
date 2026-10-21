/**
 * As ISCAS do piso da busca de pessoas **na borda**, e elas medem uma coisa que
 * nenhuma isca deste repositório media: o que o SERVIDOR devolve.
 *
 * ## O defeito que estas iscas existem para prender
 *
 * `busca-de-pessoas.test.ts` já provava que o caso de uso devolve lista vazia
 * abaixo de três caracteres **sem consultar**. Ele passava verde, e o servidor
 * respondia **400 `validation-failed`** com `{"field":"q","code":"minLength"}` —
 * medido em homologação em 21/10/2026. As duas afirmações não se contradiziam:
 * o caso de uso nunca era chamado, porque o vigia de parâmetros
 * (`validacao-de-parametros.ts`) recusava a requisição na borda, usando o
 * `minLength: 3` que o contrato declara.
 *
 * E o contrato declara aquele `minLength` dizendo, por escrito, que ele **não**
 * recusa: *"`minLength: 3` nao e recusado com 400 quando menor (...) a resposta
 * e lista vazia"*. O código divergia do contrato, e num produto em que o
 * `openapi.yaml` manda em quatro aplicações a divergência é do código.
 *
 * ## Por que a bancada é um servidor de verdade, com o vigia instalado
 *
 * Porque é o vigia que produzia o 400. Uma bancada que chamasse
 * `BuscaDePessoas` direto mediria de novo o que já estava medido e verde, e
 * passaria com o defeito inteiro no lugar. O contrato vem do **disco**
 * (`api/openapi.yaml`), e não de uma cópia de mentira: o que se mede é o
 * documento que manda.
 *
 * ## As duas metades de cada isca, e a segunda é a que importa
 *
 * Cada caso abaixo afirma **o corpo** (200 e lista vazia) e **a ausência de
 * consulta** (o dublê do repositório registra cada termo que recebe; a lista
 * tem de ficar vazia). Só o corpo provaria que a resposta melhorou; só a
 * ausência de consulta provaria que alguém recusou em algum lugar. O freio que
 * o cliente pediu é *"abaixo do piso não se consulta o banco"*, e é isso que a
 * segunda metade mede.
 *
 * O **contrapeso** (`q` com três caracteres consulta e devolve) não é enfeite:
 * sem ele, "lista vazia sem consulta" seria verdade num mundo em que a busca
 * nunca busca — o pior defeito possível aqui, porque ele se parece com
 * segurança.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  vigiarParametrosDasRotas,
} from '../../../../shared/http/validacao-de-parametros.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import { BuscaDePessoas } from '../../application/busca-de-pessoas.js';
import { MINIMO_DE_CARACTERES_DA_BUSCA } from '../../domain/termo-de-busca.js';
import type {
  BuscaDePessoasRepository,
  PessoaEncontrada,
} from '../../ports/busca-de-pessoas-repository.js';
import { registrarRotasDeBuscaDePessoas } from './people-search-routes.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');
const PREFIXO = '/v1';
const BASE_DE_PROBLEMAS = 'https://problemas.invalid/problems/' as AbsoluteUrl;
const MIDIA = 'https://midia.exemplo.test' as AbsoluteUrl;
const QUEM_BUSCA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

const MARINA: PessoaEncontrada = {
  handle: 'marina-vet',
  displayName: 'Marina',
  petsCount: 2,
  connectionsCount: 7,
  photoKey: null,
};

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Os termos com que a PORTA foi chamada. Vazio = nenhuma consulta ao banco. */
  readonly termos: string[];
  /** Quantas vezes o token foi apresentado. Mede que a rota exige conta. */
  readonly autenticacoes: string[];
}

async function bancada(): Promise<Bancada> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  // O vigia de parâmetros é o que produzia o 400. Instalá-lo aqui é o ponto
  // inteiro da bancada: sem ele, estas iscas passariam com o defeito no lugar.
  vigiarParametrosDasRotas(app, contrato, PREFIXO);

  const termos: string[] = [];
  const autenticacoes: string[] = [];
  const repositorio: BuscaDePessoasRepository = {
    buscar: (termo: string) => {
      termos.push(termo);
      return Promise.resolve({ itens: [MARINA], total: 1 });
    },
  };

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeBuscaDePessoas(escopo, {
        busca: new BuscaDePessoas({ busca: repositorio }),
        autenticador: {
          autenticar: (token: string) => {
            autenticacoes.push(token);
            return Promise.resolve({ userId: QUEM_BUSCA });
          },
        },
        baseDeMidia: MIDIA,
      });
      pronto();
    },
    { prefix: PREFIXO },
  );
  await app.ready();
  return { app, termos, autenticacoes };
}

interface CorpoDaBusca {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

/**
 * Os casos que **não podem** virar consulta nem erro, com o nome de cada um.
 *
 * Separados num mapa e não num `for` sobre strings soltas porque o nome do caso
 * é o que aparece no relatório quando ele reprova — e `q` vazio e `q` curto são
 * pressões futuras diferentes (ver o cabeçalho de `termo-de-busca.ts`).
 */
interface CasoAbaixoDoPiso {
  readonly nome: string;
  readonly url: string;
  /** O termo que chega, já decodificado. `undefined` = `q` ausente. */
  readonly termo: string | undefined;
}

const ABAIXO_DO_PISO: readonly CasoAbaixoDoPiso[] = [
  { nome: 'DOIS caracteres', url: `${PREFIXO}/people?q=ma`, termo: 'ma' },
  { nome: 'UM caractere', url: `${PREFIXO}/people?q=m`, termo: 'm' },
  { nome: '`q` VAZIO', url: `${PREFIXO}/people?q=`, termo: '' },
  { nome: '`q` AUSENTE', url: `${PREFIXO}/people`, termo: undefined },
  { nome: '`q` só com espaço', url: `${PREFIXO}/people?q=%20%20`, termo: '  ' },
];

void describe('o piso da busca de pessoas NAO recusa na borda', () => {
  for (const caso of ABAIXO_DO_PISO) {
    void it(`ISCA: ${caso.nome} responde 200 com lista vazia, e NAO consulta o banco`, async () => {
      const { app, termos } = await bancada();
      try {
        const resposta = await app.inject({
          method: 'GET',
          url: caso.url,
          headers: { authorization: 'Bearer token-da-bancada' },
        });
        assert.equal(
          resposta.statusCode,
          200,
          `${caso.nome} respondeu ${resposta.statusCode} e o corpo foi ` +
            `${resposta.body}. O contrato declara, por escrito, que o ` +
            '`minLength: 3` de `q` NAO e recusado com 400 quando menor, e que a ' +
            'resposta e lista vazia. 400 aqui quebra todo cliente escrito contra ' +
            'o contrato.',
        );
        const corpo = resposta.json<CorpoDaBusca>();
        assert.deepEqual(corpo.items, [], `${caso.nome} devolveu gente`);
        assert.equal(corpo.total, 0, `${caso.nome} devolveu total diferente de zero`);
        assert.deepEqual(
          termos,
          [],
          `A CONSULTA aconteceu com ${caso.nome}. O freio que o cliente pediu e ` +
            '"abaixo do piso nao se consulta o banco": abaixo de tres caracteres o ' +
            'indice trigrama nao produz trigrama nenhum, e a consulta volta a varrer ' +
            'a tabela de contas inteira. Lista vazia DEPOIS de consultar nao e o freio.',
        );
      } finally {
        await app.close();
      }
    });
  }

  void it('CONTRAPESO: `q` com TRES caracteres consulta e devolve', async () => {
    const { app, termos } = await bancada();
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: `${PREFIXO}/people?q=mas`,
        headers: { authorization: 'Bearer token-da-bancada' },
      });
      assert.equal(resposta.statusCode, 200, resposta.body);
      const corpo = resposta.json<CorpoDaBusca>();
      assert.equal(
        corpo.items.length,
        1,
        'tres caracteres nao devolveram resultado. Sem este contrapeso as iscas ' +
          'acima seriam verdade num mundo em que a busca nunca busca.',
      );
      assert.deepEqual(
        termos,
        ['mas'],
        'a consulta nao aconteceu com tres caracteres, ou o termo chegou alterado ' +
          'na porta (a borda NAO normaliza: acento e caixa sao do banco)',
      );
    } finally {
      await app.close();
    }
  });

  void it('o piso medido aqui e o numero que a producao usa', () => {
    // Um caso que escrevesse `3` à mão passaria a medir outro número no dia em
    // que alguém mudasse o da produção. O que se afirma é que a lista acima
    // cobre o termo MAIOR que ainda não busca — `MINIMO - 1` caracteres — e que
    // nenhum caso dela já está no piso, o que faria uma isca "não consulta"
    // reprovar por estar certa.
    const maiorQueNaoBusca = MINIMO_DE_CARACTERES_DA_BUSCA - 1;
    assert.ok(
      ABAIXO_DO_PISO.some((caso) => (caso.termo?.trim().length ?? 0) === maiorQueNaoBusca),
      `nenhum caso mede o termo de ${maiorQueNaoBusca} caracteres, que e o maior ` +
        'que ainda nao busca. Sem ele o piso fica medido por folga.',
    );
    assert.deepEqual(
      ABAIXO_DO_PISO.filter(
        (caso) => (caso.termo?.trim().length ?? 0) >= MINIMO_DE_CARACTERES_DA_BUSCA,
      ).map((caso) => caso.nome),
      [],
      'ha caso na lista "abaixo do piso" cujo termo esta NO piso: ele deveria buscar',
    );
  });

  void it('ISCA QUE CONTINUA VALENDO: a busca EXIGE conta', async () => {
    const { app, termos } = await bancada();
    try {
      // Sem `Authorization` nenhum, e com um termo que BUSCARIA se houvesse
      // conta: é isso que separa "recusou por falta de conta" de "nao buscou
      // porque o termo era curto".
      const resposta = await app.inject({ method: 'GET', url: `${PREFIXO}/people?q=mas` });
      assert.equal(
        resposta.statusCode,
        401,
        `a busca respondeu ${resposta.statusCode} sem conta. "A busca exige conta" ` +
          'e o primeiro dos tres freios do cliente, e esta mudanca nao podia toca-lo.',
      );
      assert.deepEqual(termos, [], 'consultou o banco sem conta');
    } finally {
      await app.close();
    }
  });

  void it('ISCA: nenhuma pessoa a mais sai por causa da mudanca', async () => {
    // A diferença entre 400 e lista vazia é a FORMA da recusa, e nada mais.
    // Este caso varre todos os termos abaixo do piso e afirma que a soma de
    // gente devolvida por eles é ZERO — a afirmação que o cliente cobrou
    // explicitamente ao autorizar a mudança.
    const { app, termos } = await bancada();
    try {
      let pessoas = 0;
      for (const caso of ABAIXO_DO_PISO) {
        const resposta = await app.inject({
          method: 'GET',
          url: caso.url,
          headers: { authorization: 'Bearer token-da-bancada' },
        });
        pessoas += (resposta.json<CorpoDaBusca>().items ?? []).length;
      }
      assert.equal(pessoas, 0, 'a mudanca fez sair gente que o 400 nao fazia sair');
      assert.deepEqual(termos, [], 'a mudanca fez consultar o banco onde o 400 nao consultava');
    } finally {
      await app.close();
    }
  });
});

void describe('o `minLength` de `q` nao chega ao validador da borda', () => {
  void it('ISCA: o esquema de borda de `q` NAO tem `minLength`', () => {
    const esquemas = carregarContrato(CAMINHO_DA_SPEC).parameterSchemas('searchPeople');
    const q = (esquemas.querystring?.['properties'] as Record<string, unknown>)['q'];
    assert.deepEqual(
      q,
      { type: 'string', maxLength: 40 },
      'O esquema que o Fastify instala para `q` nao e o esperado. Com `minLength` ' +
        'aqui a rota responde 400 a dois caracteres, contra o que o contrato declara.',
    );
  });

  void it('o `maxLength` CONTINUA recusando: so o piso saiu', async () => {
    // A descrição do contrato isenta o `minLength`, e **só** ele. Termo de 41
    // caracteres continua sendo pedido malformado, e 400 continua sendo a
    // resposta certa — senão a correção teria aberto a borda inteira do `q`.
    const { app, termos } = await bancada();
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: `${PREFIXO}/people?q=${'m'.repeat(41)}`,
        headers: { authorization: 'Bearer token-da-bancada' },
      });
      assert.equal(resposta.statusCode, 400, resposta.body);
      assert.deepEqual(termos, []);
    } finally {
      await app.close();
    }
  });
});
