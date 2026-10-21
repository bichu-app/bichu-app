/**
 * As ISCAS do perfil de outra pessoa, medidas no CASO DE USO e na PROJEÇÃO do
 * corpo — **as duas**, e não uma.
 *
 * ## Por que o corpo é medido aqui
 *
 * **Nenhum portão deste repositório confere o CORPO da resposta**: o Fastify
 * valida o corpo da REQUISIÇÃO contra o contrato, e a saída não passa por
 * validação nenhuma. Então um campo a mais no corpo não é pego por portão de
 * contrato, por `tsc` nem por lint — só por um caso que leia o objeto que a
 * borda envia. É `comoResposta` que este arquivo chama, e é por isso que ela é
 * exportada.
 *
 ## O que é dublado, e o que NÃO é
 *
 * `LeitorDeConexao` é dublado **pela porta**, e não por `conexoesEmMemoria`: a
 * fronteira da arquitetura corta em `connections/ports/`, e montar a bancada da
 * fatia F aqui seria `people` importando `connections/adapters/` — que o
 * `eslint` desta casa reprova, com razão. **O que aquela bancada provaria mora
 * onde ela pode morar**: `connections/application/leitor-de-conexao.test.ts`
 * mede, com `estadoNoApp` de verdade, que pendente expirado e recusa em
 * descanso devolvem `undefined`. Aqui se mede o RECORTE do perfil a partir do
 * estado, que é o que esta fatia decide.
 *
 * `PerfilDePessoaRepository` é dublado **generoso de propósito**: ele devolve
 * fotos para QUALQUER chamada de `vitrineDeConexao`, ignorando o par. É isso
 * que faz a isca (a) ter o que medir — se o dublê recusasse por conta própria,
 * o caso passaria mesmo com o recorte do caso de uso desligado, que é a
 * definição de portão cego. O predicado de verdade mora no `WHERE`, e quem o
 * mede é `autorizacao-na-clausula-where.test.ts`, ao lado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoObjectKey } from '../../media/ports/imagem-de-catalogo.js';
import type { ArestaVivaDoPar, LeitorDeConexao } from '../../connections/ports/conexao.js';
import { comoResposta } from '../adapters/http/person-profile-routes.js';
import { PerfilDePessoa } from './perfil-de-pessoa.js';
import type {
  FotoDoPerfilDeOutraPessoa,
  PerfilDePessoaRepository,
  PessoaVisivel,
} from '../ports/perfil-de-pessoa-repository.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../shared/types/brands.js';
import { AppError } from '../../../shared/http/errors.js';

const QUEM_OLHA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const MARINA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000 as Instant;
const BASE_DE_MIDIA = 'https://midia.exemplo/derivadas' as AbsoluteUrl;

/**
 * O nome do pet e a chave da foto dele existem SÓ aqui, como literais de
 * controle. Se algum dos dois aparecer na resposta, a isca (c) acusa pelo texto.
 */
const NOME_DO_PET = 'Bidu-o-terceiro';

const MARINA_VISIVEL: PessoaVisivel = {
  userId: MARINA,
  handle: 'marina-vet',
  publicRef: 'AbCdEfGhIjKlMnOpQrStUv',
  displayName: 'Marina',
  petsCount: 3,
};

/**
 * `comoObjectKey` e nao `as ObjectKey`: a marca sai da PORTA de `media`, e o
 * `as` seria a documentacao falsa que a regra `marca-so-pela-porta` recusa.
 *
 * **As chaves tem a forma REAL da derivada publica** (`people/{thumb|card}/…`),
 * e nao um texto inventado: `comoObjectKey` RECUSA forma que este sistema nao
 * escreve, e a primeira versao deste arquivo morreu na importacao com
 * "Chave de objeto recusada" por usar `people/thumb/um.jpg`. Dublê com forma
 * invalida nao prova nada sobre a URL que a borda monta.
 */
const TRES_FOTOS: readonly FotoDoPerfilDeOutraPessoa[] = [
  {
    gradeKey: comoObjectKey('people/thumb/um.jpg'),
    abertaKey: comoObjectKey('people/card/um.jpg'),
    altText: 'o quintal',
  },
  {
    gradeKey: comoObjectKey('people/thumb/dois.jpg'),
    abertaKey: comoObjectKey('people/card/dois.jpg'),
    altText: null,
  },
  {
    gradeKey: comoObjectKey('people/thumb/tres.jpg'),
    abertaKey: comoObjectKey('people/card/tres.jpg'),
    altText: null,
  },
];

interface Bancada {
  readonly servico: PerfilDePessoa;
  /** Quantas vezes o caso de uso PEDIU a vitrine. Zero é o que a isca (a) cobra. */
  readonly pedidosDeVitrine: { total: number };
  /** Quantas vezes o caso de uso perguntou a aresta. */
  readonly perguntasDeAresta: { total: number };
}

/**
 * `null` e nao `undefined` para "pessoa invisivel", e a escolha nao e estilo:
 * passar `undefined` a um parametro com valor padrao USA O PADRAO, e a primeira
 * versao deste arquivo fez exatamente isso -- a isca (d) media uma bancada em
 * que a pessoa estava visivel e passava vacuamente. `null` nao e substituido.
 */
function bancada(
  pessoa: PessoaVisivel | null = MARINA_VISIVEL,
  aresta: ArestaVivaDoPar | undefined = undefined,
  conexoesDaPessoa = 0,
): Bancada {
  const pedidosDeVitrine = { total: 0 };
  const perguntasDeAresta = { total: 0 };

  // A porta DUBLADA. O que ela devolve e o que a implementacao real devolveria;
  // que ela devolve isso para cada estado e medido em
  // `connections/application/leitor-de-conexao.test.ts`.
  const conexoes: LeitorDeConexao = {
    arestaVivaEntre: () => {
      perguntasDeAresta.total += 1;
      return Promise.resolve(aresta);
    },
    contarConexoes: () => Promise.resolve(conexoesDaPessoa),
    estaConectado: () => Promise.resolve(aresta?.estado === 'connected'),
  };

  const perfis: PerfilDePessoaRepository = {
    perfilPorApelido: (apelido: string) =>
      Promise.resolve(pessoa !== null && apelido === pessoa.handle ? pessoa : undefined),
    // **GENEROSO DE PROPÓSITO**: devolve foto para qualquer par. Ver o cabeçalho.
    vitrineDeConexao: () => {
      pedidosDeVitrine.total += 1;
      return Promise.resolve(TRES_FOTOS);
    },
  };

  return {
    servico: new PerfilDePessoa({
      perfis,
      conexoes,
      // Este arquivo mede `porApelido`, que nao toca o convite. O dublê que
      // nao resolve nada e o certo aqui: um que resolvesse faria estes casos
      // dependerem de um caminho que eles nao exercitam. `porConvite` tem iscas
      // proprias em `convite-resolve-no-mesmo-perfil.test.ts`.
      convites: { resolver: () => Promise.resolve(undefined) },
      clock: { now: () => AGORA },
    }),
    pedidosDeVitrine,
    perguntasDeAresta,
  };
}

async function corpoDe(b: Bancada): Promise<Record<string, unknown>> {
  return comoResposta(await b.servico.porApelido(QUEM_OLHA, 'marina-vet'), BASE_DE_MIDIA);
}

/** O texto do corpo, para as iscas que procuram literal de controle. */
async function textoDoCorpo(b: Bancada): Promise<string> {
  return JSON.stringify(await corpoDe(b));
}

async function erroDe(acao: () => Promise<unknown>): Promise<unknown> {
  try {
    await acao();
  } catch (erro) {
    return erro;
  }
  return undefined;
}

void describe('o perfil de outra pessoa (fatia G)', () => {
  // ------------------------------------------------------------------
  // ISCA (a): A VITRINE NÃO SAI PARA QUEM NÃO É CONEXÃO
  // ------------------------------------------------------------------

  void it('ISCA (a) -- nao-conexao NAO recebe foto da vitrine', async () => {
    const b = bancada();
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'none');
    assert.ok(
      !Object.hasOwn(corpo, 'showcase'),
      '`showcase` saiu no corpo de quem nao e conexao: a decisao do cliente de 19/10/2026 nega as fotos publicadas a essa pessoa',
    );
    // A chave é OMITIDA e não `[]`: lista vazia afirmaria "ela não tem foto".
    assert.doesNotMatch(await textoDoCorpo(b), /grid_url|open_url|people\/thumb/);
    // E a consulta não aconteceu: o recorte é do caso de uso, antes do banco.
    assert.equal(b.pedidosDeVitrine.total, 0, 'a vitrine foi CONSULTADA para quem nao e conexao');
  });

  void it('ISCA (a) -- pedido RECEBIDO ainda nao e conexao, e tambem nao recebe foto', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'pending_received', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'pending_received');
    assert.ok(!Object.hasOwn(corpo, 'showcase'), 'pendente nao e aceite: sem aceite nao ha dado de conectado');
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  void it('ISCA (a) -- pedido ENVIADO tambem nao recebe foto', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'pending_sent', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'pending_sent');
    assert.ok(!Object.hasOwn(corpo, 'showcase'));
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  void it('ISCA (a) -- aresta que nao se projeta cai para `none` e a vitrine continua fora', async () => {
    // `undefined` da porta funde "nunca houve nada", "pendente expirado" e
    // "recusa em descanso" -- e QUE ela funda os tres e medido em
    // `connections/application/leitor-de-conexao.test.ts`, onde `estadoNoApp` e
    // exercitado de verdade. Aqui se mede o que o perfil faz com o `undefined`:
    // `none`, `connection_ref` nulo e nenhuma consulta de vitrine.
    const b = bancada(MARINA_VISIVEL, undefined);
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'none');
    assert.equal(corpo['connection_ref'], null);
    assert.ok(!Object.hasOwn(corpo, 'showcase'));
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  void it('CONTRAPESO (a) -- a vitrine SAI para conexao ACEITA, com as duas derivadas', async () => {
    // Sem este caso, todos os de cima passariam num mundo em que a vitrine nunca
    // sai para ninguem -- que e a forma mais facil de um teste de omissao ficar
    // verde sem ter medido nada.
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'connected');
    assert.equal(b.pedidosDeVitrine.total, 1);
    const fotos = corpo['showcase'] as Record<string, unknown>[];
    assert.equal(fotos.length, 3);
    assert.deepEqual(Object.keys(fotos[0] ?? {}).sort(), ['alt_text', 'grid_url', 'open_url']);
    assert.equal(fotos[0]?.['grid_url'], `${BASE_DE_MIDIA}/people/thumb/um.jpg`);
    assert.equal(fotos[0]?.['open_url'], `${BASE_DE_MIDIA}/people/card/um.jpg`);
  });

  void it('CONTRAPESO (a) -- a foto de conexao NAO carrega estado de moderacao nem de edicao', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const texto = await textoDoCorpo(b);
    for (const proibido of ['status', 'rejection_reason', 'upload_id', 'position', 'caption', 'likes']) {
      assert.ok(
        !texto.includes(proibido),
        `\`${proibido}\` saiu na foto de outra pessoa: motivo de recusa e assunto entre o dono e quem modera`,
      );
    }
  });

  // ------------------------------------------------------------------
  // ISCA (b): NADA DE TIMELINE OU PUBLICAÇÃO
  // ------------------------------------------------------------------

  void it('ISCA (b) -- nao-conexao NAO recebe timeline nem publicacao', async () => {
    const corpo = await corpoDe(bancada());
    for (const proibido of [
      'timeline',
      'posts',
      'publications',
      'publication_ref',
      'feed',
      'stories',
      'activity',
      'followers',
      'followers_count',
      'following',
      'last_seen_at',
    ]) {
      assert.ok(
        !Object.hasOwn(corpo, proibido),
        `\`${proibido}\` apareceu no perfil: o cliente negou a timeline em 19/10/2026, e ela nao existe no produto (migracao 20261018000030)`,
      );
    }
  });

  void it('ISCA (b) -- conexao aceita tambem NAO recebe timeline: o aceite nao a inventa', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);
    for (const proibido of ['timeline', 'posts', 'publications', 'feed', 'activity']) {
      assert.ok(!Object.hasOwn(corpo, proibido));
    }
  });

  void it('CONTRAPESO (b) -- o corpo NAO esta vazio: as tres coisas que o cliente liberou estao la', async () => {
    // Sem este caso, a isca (b) passaria num corpo `{}` -- o rotulo de semantica
    // VAZIO que ja enganou este repositorio, na forma de `isNot(contains())`.
    const corpo = await corpoDe(bancada());
    assert.equal(corpo['display_name'], 'Marina');
    assert.equal(corpo['pets_count'], 3);
    assert.equal(corpo['connections_count'], 0);
  });

  // ------------------------------------------------------------------
  // ISCA (c): PET É CONTAGEM, E SÓ CONTAGEM
  // ------------------------------------------------------------------

  void it('ISCA (c) -- nao-conexao recebe a CONTAGEM de pets, e nunca nome nem miniatura', async () => {
    const b = bancada();
    const corpo = await corpoDe(b);
    const texto = await textoDoCorpo(b);

    assert.equal(corpo['pets_count'], 3, 'a contagem e o que a emenda 2 do ADR-0010 liberou');
    assert.ok(
      !texto.includes(NOME_DO_PET),
      'o nome de um pet apareceu no perfil de outra pessoa: o item 7 do ADR-0010 continua valendo para tudo que nao e a contagem',
    );
    for (const proibido of ['pets', 'pet_names', 'pet_slugs', 'pet_photos', 'pet_thumbs', 'animals']) {
      assert.ok(
        !Object.hasOwn(corpo, proibido),
        `\`${proibido}\` e agrupamento NAVEGAVEL de pets, e e isso que o item 7 proibe`,
      );
    }
    // `pets_count` é a ÚNICA chave que fala de pet, e o nome dela diz contagem.
    const quFalamDePet = Object.keys(corpo).filter((chave) => chave.includes('pet'));
    assert.deepEqual(quFalamDePet, ['pets_count']);
  });

  void it('ISCA (c) -- conexao aceita tambem recebe so a contagem: o aceite nao nomeia pet', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);
    assert.deepEqual(
      Object.keys(corpo).filter((chave) => chave.includes('pet')),
      ['pets_count'],
      'o cliente falou de QUANTIDADE em 19/10/2026; pets nomeados para conexao continua sendo decisao dele',
    );
  });

  void it('ISCA (c) -- o corpo inteiro tem a lista FECHADA de chaves do contrato', async () => {
    // Ancora no CONJUNTO e nao em "nao contem X": lista de proibidos falha
    // exatamente no item que ninguem previu, e falha para verde.
    assert.deepEqual((await corpoDe(bancada())).constructor, Object);
    assert.deepEqual(Object.keys(await corpoDe(bancada())).sort(), [
      'connection_ref',
      'connection_state',
      'connections_count',
      'display_name',
      'handle',
      'pets_count',
      'public_ref',
    ]);
  });

  void it('ISCA (c) -- nem cidade nem bairro: ele NAO mencionou nenhum dos dois', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);
    for (const proibido of [
      'city',
      'cidade',
      'neighbourhood',
      'neighborhood',
      'bairro',
      'location',
      'lat',
      'lng',
      'postal_code',
      'email',
      'phone',
      'phone_e164',
      'birth_date',
      'last_name',
    ]) {
      assert.ok(!Object.hasOwn(corpo, proibido), `\`${proibido}\` nao foi liberado por decisao nenhuma`);
    }
  });

  void it('ISCA (c) -- nenhum UUID no corpo, e `public_ref` NAO tem forma de UUID', async () => {
    const texto = await textoDoCorpo(bancada());
    assert.doesNotMatch(
      texto,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      'UUID interno em saida publica e o item 6 do ADR-0010, sem excecao',
    );
    assert.match(String((await corpoDe(bancada()))['public_ref']), /^[A-Za-z0-9_-]{22}$/);
  });

  // ------------------------------------------------------------------
  // ISCA (d): 404, NUNCA 403
  // ------------------------------------------------------------------

  void it('ISCA (d) -- perfil inexistente e perfil invisivel respondem 404 e nunca 403', async () => {
    // O repositório funde os seis motivos em `undefined` (é o `WHERE`, medido em
    // `autorizacao-na-clausula-where.test.ts`). O que ESTE caso prova é que o
    // caso de uso não tem um segundo ramo que escolha outro código.
    const invisivel = bancada(null);

    const erro = await erroDe(() => invisivel.servico.porApelido(QUEM_OLHA, 'nao-existe-aqui'));
    assert.ok(erro instanceof AppError, 'a recusa tem de ser um problema do contrato');
    assert.equal(erro.status, 404);
    assert.notEqual(erro.status, 403, '403 contaria que existe algo ali e que alguem decidiu barrar');

    // E o apelido CERTO, numa bancada em que a pessoa não é visível, dá o mesmo
    // 404: é a prova de que a borda não distingue "não existe" de "não é para
    // você".
    const outro = await erroDe(() => invisivel.servico.porApelido(QUEM_OLHA, 'marina-vet'));
    assert.ok(outro instanceof AppError);
    assert.equal(outro.status, 404);
    assert.deepEqual(
      { tipo: erro.problemType, titulo: erro.title },
      { tipo: outro.problemType, titulo: outro.title },
      'os dois 404 tem de ser indistinguiveis: corpo diferente e o oraculo de volta',
    );
  });

  void it('ISCA (d) -- `porApelido` nao consulta NADA depois do 404', async () => {
    // Trabalho a mais depois da recusa é tempo de resposta que varia conforme o
    // motivo, e o ADR-0021 proíbe vazar existência por tempo também.
    const invisivel = bancada(null);
    await erroDe(() => invisivel.servico.porApelido(QUEM_OLHA, 'marina-vet'));
    assert.equal(invisivel.pedidosDeVitrine.total, 0);
    assert.equal(invisivel.perguntasDeAresta.total, 0, 'a conexao foi perguntada depois do 404');
  });

  void it('CONTRAPESO (d) -- a MESMA bancada responde 200 quando a pessoa e visivel', async () => {
    // Sem ele, a isca (d) passaria num mundo em que `porApelido` sempre levanta
    // 404 -- e um 404 incondicional não é autorização, é a tela quebrada.
    const corpo = await corpoDe(bancada());
    assert.equal(corpo['handle'], 'marina-vet');
  });

  // ------------------------------------------------------------------
  // O ESTADO, E O `ref` DA ARESTA
  // ------------------------------------------------------------------

  void it('o `ref` que sai e da ARESTA, e vem nulo quando nao ha aresta viva', async () => {
    const semAresta = await corpoDe(bancada());
    assert.equal(semAresta['connection_ref'], null);

    const b = bancada(MARINA_VISIVEL, { estado: 'pending_received', ref: 'ref-da-aresta-0001' });
    const comAresta = await corpoDe(b);
    assert.equal(
      comAresta['connection_ref'],
      'ref-da-aresta-0001',
      'e o `ref` da aresta que deixa a tela aceitar sem uma segunda leitura',
    );
  });

  void it('a aresta e perguntada UMA vez, e junto da contagem', async () => {
    // Uma pergunta por leitura, e as duas em paralelo: o resumo nao atrasa a
    // aresta e a aresta nao atrasa o resumo. (Conta desabilitada do outro lado
    // tira o estado, e isso e medido onde o predicado mora:
    // `connections/application/leitor-de-conexao.test.ts` e o `WHERE` da
    // persistencia da fatia F.)
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    await corpoDe(b);
    assert.equal(b.perguntasDeAresta.total, 1);
  });

  void it('a contagem de conexoes e a DA PESSOA olhada, e nao a de quem olha', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' }, 12);
    const corpo = await corpoDe(b);
    assert.equal(corpo['connections_count'], 12);
  });
});
