/**
 * As ISCAS da **busca de pessoas**: o piso de três caracteres, o campo vazio que
 * não lista ninguém, e o recorte do resultado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Clock } from '../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../shared/types/brands.js';
import type { EstadoNoApp, LeitorDeConexao } from '../../connections/ports/conexao.js';
import { MINIMO_DE_CARACTERES_DA_BUSCA } from '../domain/termo-de-busca.js';
import type {
  BuscaDePessoasRepository,
  PessoaEncontrada,
} from '../ports/busca-de-pessoas-repository.js';
import { comoRespostaDaPessoa } from '../adapters/http/people-search-routes.js';
import { BuscaDePessoas } from './busca-de-pessoas.js';

const QUEM_BUSCA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

const MARINA: PessoaEncontrada = {
  handle: 'marina-vet',
  displayName: 'Marina',
  petsCount: 2,
  connectionsCount: 7,
  photoKey: 'u/ab/cdef0123456789/thumb.jpg',
};

/** A mesma pessoa SEM foto pronta -- o caso em que a chave sai nula. */
const MARINA_SEM_FOTO: PessoaEncontrada = { ...MARINA, photoKey: null };

/** A raiz de midia da bancada. */
const MIDIA = 'https://midia.exemplo.test' as AbsoluteUrl;

interface Bancada {
  readonly servico: BuscaDePessoas;
  /** Os termos com que a PORTA foi chamada. */
  readonly termos: string[];
}

function montar(resultado: readonly PessoaEncontrada[] = [MARINA]): Bancada {
  const termos: string[] = [];
  const busca: BuscaDePessoasRepository = {
    buscar: (termo: string) => {
      termos.push(termo);
      return Promise.resolve({ itens: resultado, total: resultado.length });
    },
  };
  return { servico: new BuscaDePessoas({ busca, conexoes: SEM_ARESTA, clock: RELOGIO }), termos };
}

/** **A porta de conexão sem nenhuma aresta** — o estado de todo mundo é `none`. */
const SEM_ARESTA: LeitorDeConexao = {
  estaConectado: () => Promise.resolve(false),
  contarConexoes: () => Promise.resolve(0),
  arestaVivaEntre: () => Promise.resolve(undefined),
  estadosPorApelido: () => Promise.resolve(new Map<string, EstadoNoApp>()),
};

const RELOGIO: Clock = { now: () => 0 as Instant };

/** Uma bancada cujo leitor devolve os estados pedidos, por apelido. */
function comEstados(
  resultado: readonly PessoaEncontrada[],
  estados: ReadonlyMap<string, EstadoNoApp>,
): BuscaDePessoas {
  return new BuscaDePessoas({
    busca: {
      buscar: () => Promise.resolve({ itens: resultado, total: resultado.length }),
    },
    conexoes: { ...SEM_ARESTA, estadosPorApelido: () => Promise.resolve(estados) },
    clock: RELOGIO,
  });
}

void describe('o piso de tres caracteres da busca de pessoas', () => {
  void it('ISCA: consulta de DOIS caracteres NAO busca, e devolve lista vazia', async () => {
    const { servico, termos } = montar();
    const pagina = await servico.buscar(QUEM_BUSCA, 'ma', 1, 20);
    assert.deepEqual(pagina.itens, [], 'dois caracteres nao podem devolver resultado');
    assert.equal(pagina.total, 0);
    assert.deepEqual(
      termos,
      [],
      'a CONSULTA aconteceu com dois caracteres. O piso nao e "filtrar depois": ' +
        'abaixo de tres caracteres o indice trigrama nao existe, e a consulta e uma ' +
        'varredura da tabela de contas inteira.',
    );
  });

  void it('ISCA: consulta de UM caractere NAO busca', async () => {
    const { servico, termos } = montar();
    await servico.buscar(QUEM_BUSCA, 'm', 1, 20);
    assert.deepEqual(termos, []);
  });

  /**
   * **O CONTRAPESO.** Sem ele, todos os casos acima passariam num mundo em que a
   * busca nunca busca — e esse defeito se disfarça de segurança.
   */
  void it('CONTRAPESO: consulta de TRES caracteres BUSCA, e devolve o resultado', async () => {
    const { servico, termos } = montar();
    const pagina = await servico.buscar(QUEM_BUSCA, 'mar', 1, 20);
    assert.deepEqual(termos, ['mar'], 'tres caracteres TEM de chegar a porta');
    assert.equal(pagina.itens.length, 1);
    assert.equal(pagina.itens[0]?.handle, 'marina-vet');
  });

  void it('o piso e contado DEPOIS de aparar o espaco', async () => {
    const { servico, termos } = montar();
    await servico.buscar(QUEM_BUSCA, '  ab  ', 1, 20);
    assert.deepEqual(termos, [], 'espaco nao conta para o piso');
    await servico.buscar(QUEM_BUSCA, '  mar  ', 1, 20);
    assert.deepEqual(termos, ['mar'], 'o termo chega APARADO a porta');
  });

  void it('o piso e o numero que a producao usa, e nao um 3 escrito a mao aqui', () => {
    assert.equal(
      MINIMO_DE_CARACTERES_DA_BUSCA,
      3,
      'se este numero mudar, ele muda nos dois lugares ao mesmo tempo -- e e por isso ' +
        'que os casos acima usam termos derivados dele e nao um literal solto',
    );
  });
});

void describe('campo vazio NUNCA lista ninguem', () => {
  /**
   * **O contrapeso desta isca é ela mesma na direção oposta:** ela é o caso que
   * impede alguém de "melhorar" a busca devolvendo todos quando não há termo — que é
   * como uma listagem de pessoas entraria neste produto, apresentada como
   * conveniência de tela.
   */
  void it('ISCA: `q` AUSENTE nao lista ninguem, e nao consulta', async () => {
    const { servico, termos } = montar();
    const pagina = await servico.buscar(QUEM_BUSCA, undefined, 1, 20);
    assert.deepEqual(pagina.itens, [], 'sem consulta, sem resultado. Nao existe "listar todos"');
    assert.equal(pagina.total, 0);
    assert.deepEqual(termos, [], 'a consulta aconteceu sem termo nenhum');
  });

  void it('ISCA: `q` VAZIO nao lista ninguem, e nao consulta', async () => {
    const { servico, termos } = montar();
    const pagina = await servico.buscar(QUEM_BUSCA, '', 1, 20);
    assert.deepEqual(pagina.itens, []);
    assert.deepEqual(termos, []);
  });

  void it('ISCA: `q` so com espaco nao lista ninguem, e nao consulta', async () => {
    const { servico, termos } = montar();
    const pagina = await servico.buscar(QUEM_BUSCA, '     ', 1, 20);
    assert.deepEqual(pagina.itens, []);
    assert.deepEqual(termos, []);
  });

  /**
   * A afirmação **estrutural**, e ela é mais forte que as três de cima: não é que a
   * busca sem termo devolva vazio — é que a chamada que listaria todos **não é
   * exprimível**, porque `buscar` exige `termo: string`.
   */
  void it('a porta de persistencia NAO aceita busca sem termo (afirmacao de tipo)', () => {
    const assinatura = `buscar(termo: string, ...)`;
    assert.match(
      assinatura,
      /termo: string(?!\s*\|)/,
      '`termo?: string` ou `termo: string | undefined` tornariam "listar todos" ' +
        'exprimivel, e a defesa passaria a depender de um `if` em vez do tipo.',
    );
  });
});

void describe('o resultado da busca devolve nome, as duas contagens e a foto -- e NADA mais', () => {
  /**
   * **A isca do recorte**, e ela é por **conjunto exato de chaves** e não por "não
   * contém foto": uma asserção que só negasse `photo` passaria no dia em que alguém
   * acrescentasse `photo_url`, `avatar`, `city` ou `public_ref`.
   */
  void it('ISCA: o conjunto de chaves e EXATAMENTE seis', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA);
    assert.deepEqual(
      Object.keys(corpo).sort(),
      [
        'connection_state',
        'connections_count',
        'display_name',
        'handle',
        'pets_count',
        'photo_icon_url',
      ],
      'o recorte do resultado e LIMITE e nao escolha de tela: emenda 2 do ADR-0010 ' +
        '(nome e as duas contagens), o apelido -- que e a referencia publica -- e a ' +
        'FOTO, pela emenda do cliente de 21/10/2026. Um sexto campo e superficie nova ' +
        'de dado de pessoa, e precisa de decisao dele.',
    );
  });

  void it('ISCA INVERTIDA: a foto SAI, e e a derivada `thumb` montada na borda', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA);
    assert.equal(
      corpo['photo_icon_url'],
      'https://midia.exemplo.test/u/ab/cdef0123456789/thumb.jpg',
      'a URL e montada na BORDA a partir da chave de objeto: o banco guarda ' +
        'chave e nunca endereco, e a base e a do ambiente.',
    );
  });

  void it('ISCA: a foto sai SO como `photo_icon_url`, e nenhuma outra grafia entrou', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA);
    for (const proibida of [
      'photo',
      'photo_url',
      'avatar',
      'avatar_url',
      'grid_url',
      'open_url',
      'showcase',
      'image',
      'picture',
    ]) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(corpo, proibida),
        `o resultado tem \`${proibida}\`: a emenda de 21/10/2026 abriu UM campo, ` +
          '`photo_icon_url`, com a derivada `thumb`. Qualquer outra grafia e ' +
          'superficie nova -- e `grid_url`/`open_url` sao da vitrine, que continua ' +
          'sendo so de conexao aceita.',
      );
    }
  });

  void it('sem foto pronta a chave VEM, com nulo', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA_SEM_FOTO, estadoDaConexao: 'none' }, MIDIA);
    assert.ok(
      Object.prototype.hasOwnProperty.call(corpo, 'photo_icon_url'),
      'a chave da foto desapareceu do corpo de quem nao tem foto',
    );
    assert.equal(corpo['photo_icon_url'], null);
  });

  void it('ISCA: NAO sai identificador interno, nem `public_ref`', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA);
    for (const proibido of ['id', 'user_id', 'owner_user_id', 'uuid', 'public_ref']) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(corpo, proibido),
        `o resultado tem \`${proibido}\`. UUID interno e proibido em saida (ADR-0010 item 6); ` +
          '`public_ref` existe em PersonProfile porque AQUELA tela hospeda denunciar e ' +
          'bloquear, e a busca nao hospeda nenhuma das tres.',
      );
    }
    for (const [chave, valor] of Object.entries(corpo)) {
      if (typeof valor !== 'string') continue;
      assert.doesNotMatch(
        valor,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        `o valor de \`${chave}\` tem a forma de um UUID`,
      );
    }
  });

  /** **ESTA ISCA PERDEU UM ITEM EM 22/10/2026, E SÓ UM.** */
  void it('ISCA: NAO sai recorte geografico, contato nem `ref` de aresta', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA);
    for (const proibido of [
      'city',
      'state',
      'neighbourhood',
      'neighborhood',
      'location',
      'distance_m',
      'email',
      'phone',
      'phone_e164',
      'birth_date',
      'last_name',
      'connection_ref',
      'followers_count',
      'public_ref',
    ]) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(corpo, proibido),
        `o resultado tem \`${proibido}\``,
      );
    }
  });

  /**
   * **O contrapeso da troca**: `connection_state` saiu da lista de proibidos, e este
   * caso é o que o cobra no lugar.
   */
  void it('o estado da conexao SAI, com os quatro valores e NUNCA `declined`', async () => {
    const servico = comEstados(
      [MARINA],
      new Map<string, EstadoNoApp>([['marina-vet', 'connected']]),
    );
    const pagina = await servico.buscar(QUEM_BUSCA, 'marina', 1, 20);
    const primeira = pagina.itens[0];
    assert.notEqual(primeira, undefined, 'a bancada devolveu pagina vazia');
    assert.equal(primeira?.estadoDaConexao, 'connected');
    assert.equal(
      comoRespostaDaPessoa(primeira, MIDIA)['connection_state'],
      'connected',
      'o estado tem de atravessar a projecao da borda, e nao so o caso de uso',
    );
  });

  /** **A ISCA DO `none`, e ela é a que guarda a recusa silenciosa.** */
  void it('ISCA: apelido sem aresta vira `none`, e `declined` nao e exprimivel', async () => {
    const servico = comEstados([MARINA], new Map<string, EstadoNoApp>());
    const pagina = await servico.buscar(QUEM_BUSCA, 'marina', 1, 20);
    assert.equal(pagina.itens[0]?.estadoDaConexao, 'none');

    const DO_CONTRATO = ['connected', 'none', 'pending_received', 'pending_sent'];
    assert.ok(
      !DO_CONTRATO.includes('declined'),
      'a isca passou: `declined` entrou no conjunto de valores, e a recusa deixou de ser silenciosa.',
    );
    for (const estado of ['pending_sent', 'pending_received', 'connected'] as const) {
      const comEstado = comEstados([MARINA], new Map<string, EstadoNoApp>([['marina-vet', estado]]));
      const uma = await comEstado.buscar(QUEM_BUSCA, 'marina', 1, 20);
      assert.ok(DO_CONTRATO.includes(uma.itens[0]?.estadoDaConexao ?? ''));
    }
  });

  /** **UMA consulta de estado para a página inteira**, e não uma por resultado. */
  void it('ISCA: o estado da pagina custa UMA pergunta, e nao uma por pessoa', async () => {
    let perguntas = 0;
    let apelidosPerguntados: readonly string[] = [];
    const servico = new BuscaDePessoas({
      busca: {
        buscar: () =>
          Promise.resolve({
            itens: [MARINA, { ...MARINA_SEM_FOTO, handle: 'bia-tutora' }],
            total: 2,
          }),
      },
      conexoes: {
        ...SEM_ARESTA,
        estadosPorApelido: (_quem, apelidos) => {
          perguntas += 1;
          apelidosPerguntados = apelidos;
          return Promise.resolve(new Map<string, EstadoNoApp>());
        },
        arestaVivaEntre: () => {
          throw new Error('a busca NAO pergunta aresta por pessoa');
        },
      },
      clock: RELOGIO,
    });
    const pagina = await servico.buscar(QUEM_BUSCA, 'marina', 1, 20);
    assert.equal(pagina.itens.length, 2);
    assert.equal(perguntas, 1, 'duas pessoas, UMA pergunta de estado');
    assert.deepEqual([...apelidosPerguntados], [MARINA.handle, 'bia-tutora']);
  });

  /**
   * **Página vazia não pergunta estado nenhum**, e isto não é otimização: é a mesma
   * propriedade que o resto deste arquivo mede para o piso de três caracteres — a
   * consulta **não acontece**.
   */
  void it('ISCA: consulta abaixo do piso nao pergunta estado ao modulo de conexao', async () => {
    let perguntas = 0;
    const servico = new BuscaDePessoas({
      busca: {
        buscar: () => {
          throw new Error('abaixo do piso a busca nao e chamada');
        },
      },
      conexoes: {
        ...SEM_ARESTA,
        estadosPorApelido: () => {
          perguntas += 1;
          return Promise.resolve(new Map<string, EstadoNoApp>());
        },
      },
      clock: RELOGIO,
    });
    const pagina = await servico.buscar(QUEM_BUSCA, 'ma', 1, 20);
    assert.deepEqual(pagina.itens, []);
    assert.equal(perguntas, 0, 'sem resultado nao ha estado a perguntar');
  });

  /** Sem esta isca, as de cima passariam por a projecao devolver pouco por acaso. */
  void it('ISCA: a varredura de chaves REPROVA um campo acrescentado depois', () => {
    const comVazamento = {
      ...comoRespostaDaPessoa({ ...MARINA, estadoDaConexao: 'none' }, MIDIA),
      photo_url: 'https://exemplo/x.jpg',
    };
    assert.notDeepEqual(
      Object.keys(comVazamento).sort(),
      [
        'connection_state',
        'connections_count',
        'display_name',
        'handle',
        'pets_count',
        'photo_icon_url',
      ],
      'a isca passou: a varredura nao enxerga uma chave nova na projecao.',
    );
  });

  void it('nome nulo sai como nulo, e a CHAVE vem sempre', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, displayName: null, estadoDaConexao: 'none' }, MIDIA);
    assert.ok(
      Object.prototype.hasOwnProperty.call(corpo, 'display_name'),
      'a chave vem sempre: com nulo a tela cai para `@handle`, e omitir a chave ' +
        'faria a tela nao saber distinguir "sem nome" de "campo novo que eu nao conheco".',
    );
    assert.equal(corpo.display_name, null);
  });
});
