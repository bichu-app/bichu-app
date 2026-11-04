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

const NOME_DO_PET = 'Bidu-o-terceiro';

const MARINA_VISIVEL: PessoaVisivel = {
  userId: MARINA,
  handle: 'marina-vet',
  publicRef: 'AbCdEfGhIjKlMnOpQrStUv',
  displayName: 'Marina',
  petsCount: 3,
  canalVerificado: true,
};

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

/** As fotos que a vitrine PROPRIA devolve, distintas das de conexao de propósito. */
const DUAS_FOTOS_PROPRIAS: readonly FotoDoPerfilDeOutraPessoa[] = [
  {
    gradeKey: comoObjectKey('people/thumb/minha-um.jpg'),
    abertaKey: comoObjectKey('people/card/minha-um.jpg'),
    altText: 'o meu quintal',
  },
  {
    gradeKey: comoObjectKey('people/thumb/minha-dois.jpg'),
    abertaKey: comoObjectKey('people/card/minha-dois.jpg'),
    altText: null,
  },
];

interface Bancada {
  readonly servico: PerfilDePessoa;
  readonly pedidosDeVitrine: { total: number };
  readonly pedidosDeVitrinePropria: { total: number };
  readonly perguntasDeAresta: { total: number };
}

function bancada(
  pessoa: PessoaVisivel | null = MARINA_VISIVEL,
  aresta: ArestaVivaDoPar | undefined = undefined,
  conexoesDaPessoa = 0,
): Bancada {
  const pedidosDeVitrine = { total: 0 };
  const pedidosDeVitrinePropria = { total: 0 };
  const perguntasDeAresta = { total: 0 };

  const conexoes: LeitorDeConexao = {
    arestaVivaEntre: () => {
      perguntasDeAresta.total += 1;
      return Promise.resolve(aresta);
    },
    contarConexoes: () => Promise.resolve(conexoesDaPessoa),
    estaConectado: () => Promise.resolve(aresta?.estado === 'connected'),
    estadosPorApelido: () => {
      throw new Error('o perfil de UMA pessoa nao pergunta estado em lote');
    },
  };

  const perfis: PerfilDePessoaRepository = {
    perfilPorApelido: (apelido: string) =>
      Promise.resolve(pessoa !== null && apelido === pessoa.handle ? pessoa : undefined),
    vitrineDeConexao: () => {
      pedidosDeVitrine.total += 1;
      return Promise.resolve(TRES_FOTOS);
    },
    // **FOTOS DIFERENTES DAS DE CONEXAO, e isso e o que torna o caso
    // mensuravel:** com as mesmas fotos nas duas portas, um caso que pedisse a
    // porta errada passaria igual. Aqui o corpo DIZ qual das duas respondeu.
    vitrinePropria: () => {
      pedidosDeVitrinePropria.total += 1;
      return Promise.resolve(DUAS_FOTOS_PROPRIAS);
    },
  };

  return {
    servico: new PerfilDePessoa({
      perfis,
      conexoes,
      convites: { resolver: () => Promise.resolve(undefined) },
      clock: { now: () => AGORA },
    }),
    pedidosDeVitrine,
    pedidosDeVitrinePropria,
    perguntasDeAresta,
  };
}

async function corpoDe(b: Bancada): Promise<Record<string, unknown>> {
  return comoResposta(await b.servico.porApelido(QUEM_OLHA, 'marina-vet'), BASE_DE_MIDIA);
}

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

  void it('ISCA (a) -- nao-conexao NAO recebe foto da vitrine', async () => {
    const b = bancada();
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'none');
    assert.ok(
      !Object.hasOwn(corpo, 'showcase'),
      '`showcase` saiu no corpo de quem nao e conexao: a decisao do cliente de 19/10/2026 nega as fotos publicadas a essa pessoa',
    );
    assert.doesNotMatch(await textoDoCorpo(b), /grid_url|open_url|people\/thumb/);
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
    const b = bancada(MARINA_VISIVEL, undefined);
    const corpo = await corpoDe(b);

    assert.equal(corpo['connection_state'], 'none');
    assert.equal(corpo['connection_ref'], null);
    assert.ok(!Object.hasOwn(corpo, 'showcase'));
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  void it('CONTRAPESO (a) -- a vitrine SAI para conexao ACEITA, com as duas derivadas', async () => {
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
    const corpo = await corpoDe(bancada());
    assert.equal(corpo['display_name'], 'Marina');
    assert.equal(corpo['pets_count'], 3);
    assert.equal(corpo['connections_count'], 0);
  });

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
    assert.deepEqual((await corpoDe(bancada())).constructor, Object);
    assert.deepEqual(Object.keys(await corpoDe(bancada())).sort(), [
      'connection_ref',
      'connection_state',
      'connections_count',
      'contact_channel_verified',
      'display_name',
      'handle',
      // A SEGUNDA EMENDA A LISTA FECHADA (03/11/2026, decisao do cliente), e
      // ela entra aqui pela mesma forma que `contact_channel_verified` entrou:
      // nomeada, com data e com motivo. Ver `PersonProfile.is_self` no
      // contrato para por que o aplicativo nao tem como derivar isto.
      'is_self',
      'pets_count',
      'public_ref',
    ]);
  });

  void it('EMENDA 21/10 -- o SELO DE VALIDADO sai nos QUATRO estados de conexao', async () => {
    for (const aresta of [
      undefined,
      { estado: 'pending_sent' as const, ref: 'ref-da-aresta-0001' },
      { estado: 'pending_received' as const, ref: 'ref-da-aresta-0001' },
      { estado: 'connected' as const, ref: 'ref-da-aresta-0001' },
    ]) {
      const corpo = await corpoDe(bancada(MARINA_VISIVEL, aresta));
      assert.equal(
        corpo['contact_channel_verified'],
        true,
        `o selo sumiu no estado ${String(aresta?.estado ?? 'none')}`,
      );
    }
  });

  void it('EMENDA 21/10 -- conta SEM canal confirmado sai com o selo `false`, e nao ausente', async () => {
    const corpo = await corpoDe(bancada({ ...MARINA_VISIVEL, canalVerificado: false }));
    assert.ok(Object.hasOwn(corpo, 'contact_channel_verified'));
    assert.equal(corpo['contact_channel_verified'], false);
  });

  void it('EMENDA 21/10 -- o corpo traz o BOOLEANO, e nunca a data nem o endereco', async () => {
    const corpo = await corpoDe(bancada());
    assert.equal(typeof corpo['contact_channel_verified'], 'boolean');
    for (const proibido of [
      'email_verified_at',
      'phone_verified_at',
      'email_verified',
      'phone_verified',
      'verified_at',
      'verified_channel',
    ]) {
      assert.ok(
        !Object.hasOwn(corpo, proibido),
        `\`${proibido}\` apareceu no perfil: o que sai e o booleano, e a data de ` +
          'confirmacao nao e assunto de terceiro',
      );
    }
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

  void it('ISCA (d) -- perfil inexistente e perfil invisivel respondem 404 e nunca 403', async () => {
    const invisivel = bancada(null);

    const erro = await erroDe(() => invisivel.servico.porApelido(QUEM_OLHA, 'nao-existe-aqui'));
    assert.ok(erro instanceof AppError, 'a recusa tem de ser um problema do contrato');
    assert.equal(erro.status, 404);
    assert.notEqual(erro.status, 403, '403 contaria que existe algo ali e que alguem decidiu barrar');

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
    const invisivel = bancada(null);
    await erroDe(() => invisivel.servico.porApelido(QUEM_OLHA, 'marina-vet'));
    assert.equal(invisivel.pedidosDeVitrine.total, 0);
    assert.equal(invisivel.perguntasDeAresta.total, 0, 'a conexao foi perguntada depois do 404');
  });

  void it('CONTRAPESO (d) -- a MESMA bancada responde 200 quando a pessoa e visivel', async () => {
    const corpo = await corpoDe(bancada());
    assert.equal(corpo['handle'], 'marina-vet');
  });

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
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    await corpoDe(b);
    assert.equal(b.perguntasDeAresta.total, 1);
  });

  void it('a contagem de conexoes e a DA PESSOA olhada, e nao a de quem olha', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' }, 12);
    const corpo = await corpoDe(b);
    assert.equal(corpo['connections_count'], 12);
  });

  // ---------------------------------------------------------------------
  // O PROPRIO PERFIL -- `is_self`, E A VITRINE QUE VEM COM ELE
  // ---------------------------------------------------------------------
  //
  // Decisao do cliente, 03/11/2026: *"quando o proprio usuario clica no perfil
  // que esta no post, ele nao deve ter um botao para adicionar conexao, sendo
  // que ele e ele mesmo. No maximo mostrar a pagina do perfil com a galeria de
  // fotos dele."*, e depois *"pode corrigir isso tambem"* sobre a galeria.
  //
  // **A VITRINE ERA IMPOSSIVEL DE ABRIR NO PROPRIO PERFIL**, e nao e detalhe de
  // consulta: o `WHERE` dela exige aresta `accepted`, e NINGUEM TEM ARESTA
  // CONSIGO MESMO. Entao `connection_state` consigo mesmo e sempre `none`, a
  // vitrine vinha sempre ausente, e a tela lia a ausencia como "voce nao e
  // conexao dela" -- dizendo *"As fotos aparecem para quem e conexao."* SOBRE AS
  // FOTOS DE QUEM ESTAVA OLHANDO.
  //
  // **O PONTO UNICO:** a decisao e UMA comparacao em `porApelido`
  // (`pessoa.userId === quemOlha`), e dela saem as DUAS coisas -- o `is_self` do
  // corpo e a escolha da porta da vitrine. Nao existe segundo predicado: a
  // consulta da vitrine propria recebe UM id so e nao tem como comparar nada.

  void it('PROPRIO PERFIL -- `is_self` e `true` quando quem olha E a pessoa', async () => {
    const corpo = comoResposta(
      await bancada().servico.porApelido(MARINA, 'marina-vet'),
      BASE_DE_MIDIA,
    );
    assert.equal(
      corpo['is_self'],
      true,
      'sem isto a tela nao tem como saber que o perfil e de quem esta olhando: a intersecao de `Me` e `PersonProfile` e so o `handle`, que muda',
    );
  });

  void it('PROPRIO PERFIL -- a vitrine SAI, e vem da porta PROPRIA e nao da de conexao', async () => {
    const b = bancada();
    const corpo = comoResposta(await b.servico.porApelido(MARINA, 'marina-vet'), BASE_DE_MIDIA);

    // ANCORADO NA PORTA, e nao so na presenca da chave: as duas portas
    // devolvem fotos DIFERENTES de proposito, entao o corpo diz qual respondeu.
    assert.equal(b.pedidosDeVitrinePropria.total, 1, 'a porta propria nao foi pedida');
    assert.equal(
      b.pedidosDeVitrine.total,
      0,
      'a porta de CONEXAO foi pedida para o proprio perfil: ela exige aresta `accepted`, que consigo mesmo nunca existe',
    );

    const fotos = corpo['showcase'] as readonly Record<string, unknown>[] | undefined;
    assert.ok(fotos !== undefined, 'REPROVA: a vitrine veio AUSENTE no proprio perfil');
    assert.equal(fotos.length, 2);
    assert.match(String(fotos[0]?.['grid_url']), /people\/thumb\/minha-um\.jpg$/);
  });

  void it('PROPRIO PERFIL -- a vitrine sai mesmo com `connection_state` `none`', async () => {
    // Este e o caso que a regra antiga tornava impossivel. Nenhuma aresta, e as
    // fotos saem de qualquer forma.
    const b = bancada();
    const perfil = await b.servico.porApelido(MARINA, 'marina-vet');
    assert.equal(perfil.connectionState, 'none', 'consigo mesmo nao ha aresta, e e isso mesmo');
    assert.equal(perfil.souEu, true);
    assert.equal(perfil.vitrine?.length, 2);
  });

  void it('PROPRIO PERFIL -- a vitrine propria vem VAZIA como `[]`, e nunca ausente', async () => {
    // `[]` para terceiro seria a afirmacao proibida ("ela nao tem foto") sobre
    // uma vitrine que quem olha nao pode ver. Para si mesmo nao e proibida:
    // "voce nao publicou fotos" e uma afirmacao que quem olha pode fazer sobre
    // si, e e o que deixa a tela escolher a frase certa em vez da de estranho.
    const b = bancada();
    const perfis: PerfilDePessoaRepository = {
      perfilPorApelido: () => Promise.resolve(MARINA_VISIVEL),
      vitrineDeConexao: () => Promise.resolve(TRES_FOTOS),
      vitrinePropria: () => Promise.resolve([]),
    };
    const servico = new PerfilDePessoa({
      perfis,
      conexoes: {
        arestaVivaEntre: () => Promise.resolve(undefined),
        contarConexoes: () => Promise.resolve(0),
        estaConectado: () => Promise.resolve(false),
        estadosPorApelido: () => {
          throw new Error('o perfil de UMA pessoa nao pergunta estado em lote');
        },
      },
      convites: { resolver: () => Promise.resolve(undefined) },
      clock: { now: () => AGORA },
    });
    const corpo = comoResposta(await servico.porApelido(MARINA, 'marina-vet'), BASE_DE_MIDIA);
    assert.deepEqual(corpo['showcase'], [], 'vitrine propria vazia tem de chegar como `[]`');
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  // ---------------------------------------------------------------------
  // CONTRAPESO: PARA TERCEIRO NAO AFROUXOU UMA LINHA
  // ---------------------------------------------------------------------
  //
  // Decisao do cliente de 19/10/2026, que NAO foi reaberta: *"ele pode ver
  // nome, quantidade de pets, conexoes, mas nao as fotos publicadas e nem a
  // timeline do usuario"*. Consertar o proprio perfil afrouxando este ramo
  // seria VAZAMENTO, e nao conserto -- e sem estes casos apagar o `EXISTS` da
  // aresta passaria em todos os de cima.

  void it('CONTRAPESO -- estranho continua com `is_self` FALSO e SEM vitrine', async () => {
    const b = bancada();
    const corpo = await corpoDe(b);

    assert.equal(corpo['is_self'], false, '`false` e informacao, e nao ausencia');
    assert.ok(
      !Object.hasOwn(corpo, 'showcase'),
      'REPROVA: o conserto do proprio perfil vazou a vitrine para quem nao e conexao',
    );
    assert.equal(
      b.pedidosDeVitrinePropria.total,
      0,
      'REPROVA: a porta da vitrine PROPRIA foi pedida para o perfil de OUTRA pessoa',
    );
    assert.equal(b.pedidosDeVitrine.total, 0);
  });

  void it('CONTRAPESO -- conexao ACEITA de terceiro continua vindo pela porta de CONEXAO', async () => {
    const b = bancada(MARINA_VISIVEL, { estado: 'connected', ref: 'ref-da-aresta-0001' });
    const corpo = await corpoDe(b);

    assert.equal(corpo['is_self'], false);
    assert.equal(b.pedidosDeVitrine.total, 1, 'a porta de conexao deixou de ser usada');
    assert.equal(b.pedidosDeVitrinePropria.total, 0);
    // E sao as fotos DELA (tres), e nao as de quem olha (duas).
    assert.equal((corpo['showcase'] as readonly unknown[]).length, 3);
  });

  void it('CONTRAPESO -- os tres estados NAO-aceitos de terceiro seguem sem vitrine', async () => {
    for (const aresta of [
      undefined,
      { estado: 'pending_sent' as const, ref: 'ref-da-aresta-0001' },
      { estado: 'pending_received' as const, ref: 'ref-da-aresta-0001' },
    ]) {
      const b = bancada(MARINA_VISIVEL, aresta);
      const corpo = await corpoDe(b);
      assert.ok(
        !Object.hasOwn(corpo, 'showcase'),
        `REPROVA: vitrine de terceiro no estado \`${aresta?.estado ?? 'none'}\``,
      );
      assert.equal(b.pedidosDeVitrinePropria.total, 0);
    }
  });
});
