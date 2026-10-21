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

import type { UserId } from '../../../shared/types/brands.js';
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
};

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
  return { servico: new BuscaDePessoas({ busca }), termos };
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

void describe('o resultado da busca devolve nome e as duas contagens, e NADA mais', () => {
  /**
   * **A isca do recorte**, e ela é por **conjunto exato de chaves** e não por
   * "não contém foto": uma asserção que só negasse `photo` passaria no dia em
   * que alguém acrescentasse `photo_url`, `avatar`, `city` ou `public_ref`.
   */
  void it('ISCA: o conjunto de chaves e EXATAMENTE quatro', () => {
    const corpo = comoRespostaDaPessoa(MARINA);
    assert.deepEqual(
      Object.keys(corpo).sort(),
      ['connections_count', 'display_name', 'handle', 'pets_count'],
      'o recorte do resultado e LIMITE e nao escolha de tela: emenda 2 do ADR-0010 ' +
        '(nome e as duas contagens) mais o apelido, que e a referencia publica.',
    );
  });

  void it('ISCA: NAO sai foto, em nenhuma grafia (emenda 5 item 2 do ADR-0010)', () => {
    const corpo = comoRespostaDaPessoa(MARINA);
    for (const proibida of [
      'photo',
      'photo_url',
      'photo_icon_url',
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
        `o resultado tem \`${proibida}\`: a emenda 5 item 2 nega o rosto a quem NAO e ` +
          'conexao aceita, e resultado de busca e por construcao lista de nao-conexoes.',
      );
    }
  });

  void it('ISCA: NAO sai identificador interno, nem `public_ref`', () => {
    const corpo = comoRespostaDaPessoa(MARINA);
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

  void it('ISCA: NAO sai recorte geografico, contato nem estado da conexao', () => {
    const corpo = comoRespostaDaPessoa(MARINA);
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
      'connection_state',
      'connection_ref',
      'followers_count',
    ]) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(corpo, proibido),
        `o resultado tem \`${proibido}\``,
      );
    }
  });

  /** Sem esta isca, as de cima passariam por a projecao devolver pouco por acaso. */
  void it('ISCA: a varredura de chaves REPROVA um campo acrescentado depois', () => {
    const comVazamento = { ...comoRespostaDaPessoa(MARINA), photo_url: 'https://exemplo/x.jpg' };
    assert.notDeepEqual(
      Object.keys(comVazamento).sort(),
      ['connections_count', 'display_name', 'handle', 'pets_count'],
      'a isca passou: a varredura nao enxerga uma chave nova na projecao.',
    );
  });

  void it('nome nulo sai como nulo, e a CHAVE vem sempre', () => {
    const corpo = comoRespostaDaPessoa({ ...MARINA, displayName: null });
    assert.ok(
      Object.prototype.hasOwnProperty.call(corpo, 'display_name'),
      'a chave vem sempre: com nulo a tela cai para `@handle`, e omitir a chave ' +
        'faria a tela nao saber distinguir "sem nome" de "campo novo que eu nao conheco".',
    );
    assert.equal(corpo.display_name, null);
  });
});
