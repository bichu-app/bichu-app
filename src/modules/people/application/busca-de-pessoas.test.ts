/**
 * As ISCAS da **busca de pessoas**: o piso de três caracteres, o campo vazio que
 * não lista ninguém, e o recorte do resultado.
 *
 * ## Cada caso tem nome próprio, e isso é de propósito
 *
 * Os três primeiros casos têm a **mesma consequência** (lista vazia) e, mesmo
 * assim, não foram juntados num `for` sobre `['', 'ab', '  a  ']`. A razão é que
 * a pressão futura sobre eles é diferente, e um caso só diria uma coisa só:
 *
 * - **dois caracteres não buscam**: o risco é alguém "melhorar" o piso para dois
 *   sem saber que o índice trigrama morre ali;
 * - **três caracteres BUSCAM**: é o contrapeso, e sem ele os outros passariam
 *   num mundo em que a busca nunca busca — o que é o pior defeito possível aqui,
 *   porque ele parece segurança;
 * - **campo vazio não lista ninguém**: o risco é alguém "melhorar" a tela
 *   devolvendo todos, que chegaria como conveniência e não como decisão.
 *
 * A suíte não tem banco: o repositório é um dublê que **registra se foi
 * chamado**. É essa contagem que mede a afirmação forte — não que a resposta
 * veio vazia, mas que a **consulta não aconteceu**.
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

/** A raiz de midia da bancada. Ela nao e o dominio de producao de proposito. */
const MIDIA = 'https://midia.exemplo.test' as AbsoluteUrl;

interface Bancada {
  readonly servico: BuscaDePessoas;
  /** Os termos com que a PORTA foi chamada. Vazio = nenhuma consulta. */
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

/**
 * **A porta de conexão sem nenhuma aresta** — o estado de todo mundo é `none`.
 *
 * Este dublê é o padrão desta bancada **de propósito**: o caso central da busca
 * é achar quem ainda NÃO é conexão, e um dublê que devolvesse estado faria toda
 * isca de recorte nascer com um valor que ninguém escreveu. Os casos que medem
 * o estado montam o próprio mapa (ver `comEstados`).
 */
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
    // `  ab  ` tem seis caracteres e dois de termo -- e e o termo que o indice ve.
    await servico.buscar(QUEM_BUSCA, '  ab  ', 1, 20);
    assert.deepEqual(termos, [], 'espaco nao conta para o piso');
    // E o aparado e o que chega a porta, nao o cru.
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
   * impede alguém de "melhorar" a busca devolvendo todos quando não há termo —
   * que é como uma listagem de pessoas entraria neste produto, apresentada como
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
   * A afirmação **estrutural**, e ela é mais forte que as três de cima: não é
   * que a busca sem termo devolva vazio — é que a chamada que listaria todos
   * **não é exprimível**, porque `buscar` exige `termo: string`.
   *
   * Este caso é de tipo e não de execução, então ele vive no compilador. Fica
   * registrado aqui porque é o que sobrevive a alguém mudar os três acima.
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
   * **A isca do recorte**, e ela é por **conjunto exato de chaves** e não por
   * "não contém foto": uma asserção que só negasse `photo` passaria no dia em
   * que alguém acrescentasse `photo_url`, `avatar`, `city` ou `public_ref`.
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

  // ESTA ISCA FOI **INVERTIDA** EM 21/10/2026, E NAO APAGADA.
  //
  // O QUE ELA DIZIA: *"NAO sai foto, em nenhuma grafia (emenda 5 item 2 do
  // ADR-0010)"*, e varria dez grafias possiveis para provar a ausencia.
  //
  // **O cliente emendou a propria decisao**, literal: *"o resultado tras foto
  // sim, para identificar usuarios com nomes parecidos."* Com so o nome, duas
  // `Maria Silva` sao indistinguiveis.
  //
  // **Apagar a isca teria deixado a superficie sem protecao nenhuma**, e e
  // assim que o sexto campo entra sem ninguem notar. Ela guardava um LIMITE; o
  // limite mudou, e agora ela guarda o limite novo: a foto sai, **e so ela** --
  // nenhuma outra grafia, nenhum identificador, e a derivada e a menor que
  // existe.
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
    // O contrapeso da inversao: a emenda abriu UM campo, com UM nome -- o mesmo
    // das emendas 3 e 5. As outras nove grafias continuam proibidas, e e isso
    // que impede a derivada grande, a vitrine e a legenda de entrarem de carona.
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
    // Chave que aparece e desaparece faria o cliente distinguir ausencia de
    // nulo sem que a diferenca significasse algo. A tela cai para a inicial no
    // circulo, que e o recurso da emenda 3.
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
    // E nenhum valor do corpo pode PARECER um UUID, mesmo com outro nome de chave.
    for (const [chave, valor] of Object.entries(corpo)) {
      if (typeof valor !== 'string') continue;
      assert.doesNotMatch(
        valor,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        `o valor de \`${chave}\` tem a forma de um UUID`,
      );
    }
  });

  /**
   * **ESTA ISCA PERDEU UM ITEM EM 22/10/2026, E SÓ UM.**
   *
   * `connection_state` estava nesta lista, e estava com razão: até 22/10/2026 o
   * contrato explicava a ausência com *"numa lista, vinte estados por
   * requisição são o material de que uma lista de conexões se faz do lado de
   * fora"*. **O cliente emendou a própria decisão de 18/10/2026**, literal:
   *
   * > *"o usuário pode abrir a lista de usuários que é sua conexão"*
   *
   * Com `listMyConnections` autorizada, o dono já obtém o conjunto das suas
   * conexões por uma rota legítima — então o estado nos resultados da busca
   * **dele** não entrega nada novo, e é o que conserta o defeito que ele
   * relatou: *"após eu ter aceito, ainda aparece para solicitar conexão a um
   * usuário que ja foi adicionado e aceito"*.
   *
   * **Os outros treze itens continuam proibidos, inteiros**, e `connection_ref`
   * entre eles: `ref` de aresta é o que deixa desfazer, e desfazer mora no
   * perfil de uma pessoa — não numa lista. O caso logo abaixo é o que cobra o
   * estado novo pelo nome, para a troca não ser uma subtração.
   */
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
   * **O contrapeso da troca**: `connection_state` saiu da lista de proibidos, e
   * este caso é o que o cobra no lugar. Sem ele a troca teria sido uma
   * subtração — a superfície ficaria sem nada dizendo o que aquele campo pode e
   * não pode valer.
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

  /**
   * **A ISCA DO `none`, e ela é a que guarda a recusa silenciosa.**
   *
   * Apelido ausente do mapa vira `none`, e os três motivos vêm fundidos de
   * `estadoNoApp`: nunca houve nada, o pendente expirou, e a recusa está em
   * descanso. **Um quarto valor aqui seria o "ela recusou você"** que o desenho
   * recusa — e é por isso que o caso cobra o conjunto de valores possíveis, e
   * não só que `none` apareça.
   */
  void it('ISCA: apelido sem aresta vira `none`, e `declined` nao e exprimivel', async () => {
    const servico = comEstados([MARINA], new Map<string, EstadoNoApp>());
    const pagina = await servico.buscar(QUEM_BUSCA, 'marina', 1, 20);
    assert.equal(pagina.itens[0]?.estadoDaConexao, 'none');

    // O conjunto fechado: os tres de `ConnectionAppState` mais `none`. O
    // contrato declara exatamente estes quatro, e `declined` nao esta entre
    // eles -- nem aqui, nem em `EstadoNoApp`.
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

  /**
   * **UMA consulta de estado para a página inteira**, e não uma por resultado.
   *
   * A Emenda 3 do ADR-0010 registra, para a foto na conversa, que perguntar a
   * aresta por item seriam vinte idas ao banco por rolada. Sem este caso, uma
   * reescrita que trocasse `estadosPorApelido` por `arestaVivaEntre` num laço
   * passaria em tudo o mais — ela devolve o mesmo estado.
   */
  void it('ISCA: o estado da pagina custa UMA pergunta, e nao uma por pessoa', async () => {
    let perguntas = 0;
    let apelidosPerguntados: readonly string[] = [];
    const servico = new BuscaDePessoas({
      busca: {
        // Dois apelidos DISTINTOS: com o mesmo, a conferencia da lista
        // perguntada passaria sem provar que as duas pessoas entraram nela.
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
   * **Página vazia não pergunta estado nenhum**, e isto não é otimização: é a
   * mesma propriedade que o resto deste arquivo mede para o piso de três
   * caracteres — a consulta **não acontece**.
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
