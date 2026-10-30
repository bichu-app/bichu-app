/**
 * **A LISTA DAS PRÓPRIAS CONEXÕES** — e as iscas que provam que ela é só a
 * própria.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  conexoesEmMemoria,
  type BancadaDeConexoes,
  type PessoaDeTeste,
} from '../adapters/persistence/conexoes-em-memoria-de-teste.js';
import { ConexaoEntrePessoas, type ContextoDoChamador } from './conexao-entre-pessoas.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

const ANA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const BIA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CARLA = '018f3a2b-0000-7000-8000-0000000000cc' as UserId;
const DORA = '018f3a2b-0000-7000-8000-0000000000dd' as UserId;
/** Sem apelido: ela existe, é conexão, e **não** aparece na lista. */
const ELO = '018f3a2b-0000-7000-8000-0000000000ee' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

const PESSOAS: readonly PessoaDeTeste[] = [
  { id: ANA, apelido: 'ana-tutora', nomeDeExibicao: 'Ana', habilitada: true, pets: 1 },
  {
    id: BIA,
    apelido: 'bia-vet',
    nomeDeExibicao: 'Bia',
    habilitada: true,
    pets: 2,
    chaveDaFoto: 'u/ab/cdef/thumb.jpg',
  },
  { id: CARLA, apelido: 'carla-ong', nomeDeExibicao: 'Carla', habilitada: true, pets: 0 },
  { id: DORA, apelido: 'dora-passeio', nomeDeExibicao: 'Dora', habilitada: true, pets: 3 },
  { id: ELO, apelido: null, nomeDeExibicao: 'Elo', habilitada: true, pets: 9 },
];

const TRILHA: AuditLog = { record: () => Promise.resolve() };

function contexto(quem: UserId): ContextoDoChamador {
  return { userId: quem, correlationId: 'teste', ip: undefined };
}

function bancada(): { banca: BancadaDeConexoes; servico: ConexaoEntrePessoas } {
  const banca = conexoesEmMemoria(PESSOAS, AGORA);
  const servico = new ConexaoEntrePessoas({
    conexoes: banca.repositorio,
    convites: { resolver: () => Promise.resolve(undefined) },
    apelidos: { resolver: () => Promise.resolve(undefined) },
    bloqueios: { existeBloqueioEntre: () => Promise.resolve(false) },
    trilha: TRILHA,
    ids: {
      uuidv7: () => {
        throw new Error('a lista NAO escreve');
      },
      random128: () => {
        throw new Error('a lista NAO escreve');
      },
      random80: () => {
        throw new Error('a lista NAO escreve');
      },
      opaqueToken: () => {
        throw new Error('a lista NAO escreve');
      },
    },
    clock: { now: () => AGORA },
  });
  return { banca, servico };
}

/** Os apelidos da página, na ordem em que ela os devolveu. */
async function apelidosDe(
  servico: ConexaoEntrePessoas,
  quem: UserId,
  pagina = 1,
  limite = 20,
): Promise<readonly string[]> {
  const resultado = await servico.conexoes(contexto(quem), pagina, limite);
  return resultado.itens.map((pessoa) => pessoa.apelido);
}

void describe('a lista das PRÓPRIAS conexões (cliente, 22/10/2026)', () => {
  void it('devolve as conexões ACEITAS de quem chama, e so elas', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: CARLA, destinatario: ANA, estado: 'accepted' });

    assert.deepEqual([...(await apelidosDe(servico, ANA))], ['bia-vet', 'carla-ong']);
  });

  /**
   * **PENDENTE NÃO ENTRA**, e esta é a linha que separa as duas listas: a caixa de
   * pedidos é o que espera decisão, e esta é o que já decidiu.
   */
  void it('pendente NAO entra, nem o que eu mandei nem o que eu recebi', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: CARLA });
    banca.semear({ pedinte: DORA, destinatario: ANA });

    assert.deepEqual([...(await apelidosDe(servico, ANA))], ['bia-vet']);
  });

  /**
   * **RECUSADO NÃO ENTRA**, e a recusa continua silenciosa: ela não aparece aqui
   * como ausência explicável, porque um pendente não respondido também não aparece.
   */
  void it('recusado NAO entra, e e indistinguivel de nunca ter havido nada', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'declined' });
    assert.deepEqual([...(await apelidosDe(servico, ANA))], []);
  });

  /** **ISCA DE VAZAMENTO ENTRE CONTAS, e é o caso mais importante do arquivo.** */
  void it('ISCA DE VAZAMENTO: a conta A nao ve NADA da lista da conta B', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: CARLA, destinatario: DORA, estado: 'accepted' });

    const deAna = await apelidosDe(servico, ANA);
    const deCarla = await apelidosDe(servico, CARLA);

    assert.deepEqual([...deAna], ['bia-vet'], 'ANA ve a conexao DELA');
    assert.deepEqual([...deCarla], ['dora-passeio'], 'CARLA ve a conexao DELA');

    for (const alheio of ['carla-ong', 'dora-passeio']) {
      assert.ok(!deAna.includes(alheio), `\`${alheio}\` vazou para a lista de ANA`);
    }
    for (const alheio of ['ana-tutora', 'bia-vet']) {
      assert.ok(!deCarla.includes(alheio), `\`${alheio}\` vazou para a lista de CARLA`);
    }
    assert.ok(!deAna.includes('ana-tutora'));
  });

  /**
   * **ISCA DA ISCA DE VAZAMENTO.** Sem ela, o caso de cima passaria por os dois
   * pares serem disjuntos **na bancada**, e não por a consulta recortar por quem
   * chama.
   */
  void it('ISCA: uma leitura que ignorasse quem chama devolveria as QUATRO pontas', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: CARLA, destinatario: DORA, estado: 'accepted' });

    const comRecorte = await apelidosDe(servico, ANA);
    const semRecorte = banca.linhas.length * 2;
    assert.equal(semRecorte, 4, 'a bancada tem duas arestas, quatro pontas');
    assert.notEqual(
      comRecorte.length,
      semRecorte,
      'a isca passou: a lista recortada tem o mesmo tamanho da varredura sem recorte, ' +
        'entao o recorte por quem chama nao esta sendo medido.',
    );
    assert.equal(comRecorte.length, 1);
  });

  /**
   * **CONTA DESABILITADA SAI DA LISTA, e a linha não é apagada** — decisão do
   * cliente de 17/10: conta desabilitada *"não é mais encontrada em nenhuma página
   * ou funcionalidade"*.
   */
  void it('conta desabilitada de qualquer lado sai da lista, e reabilitar a devolve', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });

    banca.desabilitar(BIA);
    assert.deepEqual([...(await apelidosDe(servico, ANA))], []);
    banca.reabilitar(BIA);
    assert.deepEqual([...(await apelidosDe(servico, ANA))], ['bia-vet']);
  });

  /**
   * **SEM APELIDO NÃO ENTRA**, e a consequência vale dita: esta lista pode ter menos
   * linhas que `connected_count`, e a diferença são exactamente as conexões sem
   * apelido.
   */
  void it('conexao SEM apelido nao entra: a linha seria uma porta que nao abre', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: ELO, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    assert.deepEqual([...pagina.itens.map((p) => p.apelido)], ['bia-vet']);
    assert.equal(pagina.total, 1, 'o total conta o MESMO conjunto que a pagina devolve');
  });

  /** **O RECORTE DE CADA PESSOA É O DA BUSCA: cinco campos, e nada mais.** */
  void it('ISCA: cada pessoa da lista tem EXATAMENTE os cinco campos da busca', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    assert.deepEqual(Object.keys(pagina.itens[0] ?? {}).sort(), [
      'apelido',
      'connectionsCount',
      'nomeDeExibicao',
      'petsCount',
      'photoKey',
    ]);
  });

  /** **NENHUM IDENTIFICADOR INTERNO sai** (ADR-0010 item 6). */
  void it('ISCA: nenhum UUID de conta aparece no JSON da pagina', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: CARLA, destinatario: ANA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    const json = JSON.stringify(pagina);
    for (const conta of [ANA, BIA, CARLA, DORA, ELO]) {
      assert.ok(!json.includes(conta), `o UUID de uma conta vazou na pagina: ${conta}`);
    }
    for (const linha of banca.linhas) {
      assert.ok(!json.includes(linha.ref), `o \`ref\` da aresta vazou: desfazer mora no perfil`);
    }
  });

  /**
   * **ISCA DA ISCA do UUID.** Sem ela, o caso de cima passaria por a bancada não ter
   * UUID em lugar nenhum da forma — e não por a varredura saber reconhecer um.
   */
  void it('ISCA: a varredura de UUID REPROVA uma conta acrescentada a forma', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    const comVazamento = {
      ...pagina,
      itens: pagina.itens.map((pessoa) => ({ ...pessoa, person_id: BIA })),
    };
    assert.ok(
      JSON.stringify(comVazamento).includes(BIA),
      'a isca passou: a varredura nao enxerga um UUID de conta acrescentado a forma.',
    );
  });

  /** As contagens de cada pessoa são **números**, e não cadeias do driver. */
  void it('as contagens de cada pessoa sao numeros, e a foto vem com nulo explicito', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: CARLA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    const bia = pagina.itens.find((p) => p.apelido === 'bia-vet');
    const carla = pagina.itens.find((p) => p.apelido === 'carla-ong');
    assert.equal(typeof bia?.petsCount, 'number');
    assert.equal(bia?.petsCount, 2);
    assert.equal(bia?.photoKey, 'u/ab/cdef/thumb.jpg');
    assert.equal(carla?.photoKey, null);
    assert.ok(Object.prototype.hasOwnProperty.call(carla ?? {}, 'photoKey'));
  });

  void it('a pagina respeita `page` e `limit`, e o total conta o conjunto inteiro', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: CARLA, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: DORA, estado: 'accepted' });

    const primeira = await servico.conexoes(contexto(ANA), 1, 2);
    assert.deepEqual([...primeira.itens.map((p) => p.apelido)], ['bia-vet', 'carla-ong']);
    assert.equal(primeira.total, 3, 'o total e do conjunto, nao da pagina');

    const segunda = await servico.conexoes(contexto(ANA), 2, 2);
    assert.deepEqual([...segunda.itens.map((p) => p.apelido)], ['dora-passeio']);
    assert.equal(segunda.total, 3);
  });

  /**
   * **A LISTA E `connected_count` CONTAM O MESMO**, e têm de contar: os dois
   * recortam `accepted` com conta habilitada nos dois lados.
   */
  void it('o total da lista e `connected_count` nao divergem (descontado o sem apelido)', async () => {
    const { banca, servico } = bancada();
    banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
    banca.semear({ pedinte: ANA, destinatario: CARLA, estado: 'accepted' });

    const pagina = await servico.conexoes(contexto(ANA), 1, 20);
    const resumo = await servico.resumo(contexto(ANA));
    assert.equal(pagina.total, resumo.connected_count);
  });

  /** **A LISTA NÃO É ENDEREÇÁVEL A UMA PESSOA, e isso é de tipo e não de regra.** */
  void it('ISCA: o metodo nao tem por onde receber OUTRA pessoa', () => {
    const { servico } = bancada();
    assert.equal(
      servico.conexoes.length,
      3,
      '`conexoes` recebe contexto, pagina e limite. Um QUARTO parametro e uma pessoa ' +
        'a mais, e a lista de terceiro -- que a emenda de 22/10/2026 NAO abriu.',
    );
  });
});
