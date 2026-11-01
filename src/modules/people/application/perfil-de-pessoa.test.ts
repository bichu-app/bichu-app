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

interface Bancada {
  readonly servico: PerfilDePessoa;
  readonly pedidosDeVitrine: { total: number };
  readonly perguntasDeAresta: { total: number };
}

function bancada(
  pessoa: PessoaVisivel | null = MARINA_VISIVEL,
  aresta: ArestaVivaDoPar | undefined = undefined,
  conexoesDaPessoa = 0,
): Bancada {
  const pedidosDeVitrine = { total: 0 };
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
  };

  return {
    servico: new PerfilDePessoa({
      perfis,
      conexoes,
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
});
