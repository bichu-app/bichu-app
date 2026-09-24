/**
 * O id do caminho entra na chave de idempotência — em TODA rota, inclusive na
 * que ainda não existe.
 *
 * ## O defeito, e por que ele é uma classe e não três bugs
 *
 * `endpoint` é o MOLDE da rota (`POST /pets/:petId/lost-cases`), não a URL.
 * Duas requisições para recursos diferentes da mesma rota têm o mesmo
 * `endpoint`. A chave de idempotência é escopada por `donoOuToken + endpoint +
 * resumo do corpo`, então, quando o id do recurso está no CAMINHO e não no
 * corpo, os três componentes ficam idênticos: a mesma conta, com a mesma chave,
 * em dois recursos diferentes, recebe a resposta gravada do PRIMEIRO como
 * resposta do segundo. E o segundo efeito nunca acontece.
 *
 * Foi encontrado em `postConversationMessage`, consertado ali, e continuava
 * vivo em `openLostCase`, em `createFoundReportFromTag` e em
 * `cancelTransferByToken`.
 *
 * ## Por que esta isca não é uma isca por rota
 *
 * Porque uma isca por rota deixa a QUARTA rota nascer furada. Três asserções
 * específicas provam três rotas e calam sobre a próxima que alguém escrever com
 * id no caminho — que é exatamente como esta classe sobreviveu ao conserto da
 * primeira.
 *
 * O que se prova aqui é o MECANISMO, com duas provas que nenhuma rota real
 * fornece:
 *
 * 1. **O caso plantado.** Uma rota que não existe no produto
 *    (`POST /plantada/:recursoId/coisas`) é submetida ao mecanismo com o id de
 *    fora. O mecanismo precisa recusar. É esta prova que cobre a rota que
 *    ninguém escreveu ainda: ela não depende de nenhum nome do produto.
 * 2. **A varredura vinda do contrato.** A lista das operações idempotentes sai
 *    de `api/openapi.yaml` em tempo de execução, e não de uma lista escrita
 *    aqui. Operação idempotente nova sem veredito nesta tabela REPROVA — a
 *    tabela não pode ficar para trás em silêncio.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../shared/http/contract.js';
import { hashDeCorpo } from '../crypto/digest.js';
import { problemas } from './errors.js';
import {
  canonicalizarCorpo,
  corpoCanonicoDoPedido,
  executarComIdempotencia,
  operacoesComIdempotencia,
  parametrosDoEndpoint,
  type EntradaDeIdempotencia,
  type Idempotencia,
  type PedidoIdempotente,
  type RespostaGravada,
} from './idempotency.js';

import { rotaDeCadastroDePet } from '../../modules/pets/adapters/http/pet-routes.js';
import { rotaDeRegistroDeAchado } from '../../modules/found/adapters/http/found-report-routes.js';
import { rotaDeAberturaDeCaso } from '../../modules/lostfound/adapters/http/lost-case-routes.js';
import { rotaDeEnvioDeMensagem } from '../../modules/messaging/adapters/http/conversation-routes.js';
import { rotaDeAvisoPelaTag } from '../../modules/tags/adapters/http/tag-routes.js';
import { rotaDeCancelamentoPorToken } from '../../modules/transfers/adapters/http/transfer-routes.js';

const AGORA = Date.UTC(2026, 8, 22, 12, 0, 0);
const CHAVE = '5b2f8d10-9c3a-4e77-8a11-6d0f2c4b9e33';
const DONO = '018f3a2b-0000-7000-8000-0000000000aa';

/** A tabela `idempotency_keys` em memória, com as três regras que importam. */
function idempotenciaEmMemoria(): Idempotencia {
  const linhas = new Map<string, { resumo: string; dono: string; gravada?: RespostaGravada }>();
  return {
    reservar(entrada: EntradaDeIdempotencia): Promise<RespostaGravada | undefined> {
      const resumo = hashDeCorpo(entrada.corpoCanonico).toString('hex');
      const existente = linhas.get(entrada.chave);
      if (existente === undefined) {
        linhas.set(entrada.chave, { resumo, dono: entrada.donoOuToken });
        return Promise.resolve(undefined);
      }
      if (existente.resumo !== resumo || existente.dono !== entrada.donoOuToken) {
        throw problemas.validacao([
          { field: 'Idempotency-Key', code: 'reused', message: 'Chave usada para outro pedido.' },
        ]);
      }
      return Promise.resolve(existente.gravada);
    },
    concluir(chave: string, status: number, corpo: unknown): Promise<void> {
      const linha = linhas.get(chave);
      if (linha !== undefined) linha.gravada = { status, body: corpo };
      return Promise.resolve();
    },
    liberar(chave: string): Promise<void> {
      linhas.delete(chave);
      return Promise.resolve();
    },
  };
}

function pedidoDe(sobrescrita: Partial<PedidoIdempotente>): PedidoIdempotente {
  return {
    exigencia: 'opcional',
    chaveDoCabecalho: CHAVE,
    donoOuToken: DONO,
    endpoint: 'POST /plantada/:recursoId/coisas',
    parametrosDeCaminho: {},
    corpo: { texto: 'igual nos dois' },
    agoraEmMilissegundos: AGORA,
    ...sobrescrita,
  };
}

// ---------------------------------------------------------------------------
// 1. O CASO PLANTADO: a rota que ainda não existe
// ---------------------------------------------------------------------------

void describe('o caso plantado: uma rota com id no caminho que esquece o id', () => {
  void it('é RECUSADA pelo mecanismo, e o efeito não roda', async () => {
    const armazem = idempotenciaEmMemoria();
    let efeitos = 0;
    const executar = (): Promise<RespostaGravada> => {
      efeitos += 1;
      return Promise.resolve({ status: 201, body: { id: efeitos } });
    };

    // `parametrosDeCaminho: {}` numa rota cujo molde declara `:recursoId`. É a
    // forma que a quarta rota teria se alguém a escrevesse copiando `createPet`,
    // que não tem parâmetro nenhum.
    await assert.rejects(
      () => executarComIdempotencia(armazem, pedidoDe({}), executar),
      /id no caminho fora da chave/,
      'o mecanismo aceitou uma rota com id no caminho fora do corpo canônico',
    );
    assert.equal(efeitos, 0, 'o efeito rodou antes de o mecanismo conferir a fiação');
  });

  void it('é recusada TAMBÉM quando o cliente não manda chave nenhuma', async () => {
    const armazem = idempotenciaEmMemoria();
    // A requisição sem `Idempotency-Key` nunca toca o corpo canônico. Se a
    // conferência da fiação viesse depois dela, a rota pareceria sã até o
    // primeiro cliente offline — que é quem manda chave, e só aparece em
    // produção.
    await assert.rejects(
      () =>
        executarComIdempotencia(armazem, pedidoDe({ chaveDoCabecalho: undefined }), () =>
          Promise.resolve({ status: 201, body: null }),
        ),
      /id no caminho fora da chave/,
    );
  });

  void it('com o id declarado, dois recursos com a mesma chave não se misturam', async () => {
    const armazem = idempotenciaEmMemoria();
    let efeitos = 0;
    const executar = (): Promise<RespostaGravada> => {
      efeitos += 1;
      return Promise.resolve({ status: 201, body: { recurso: efeitos } });
    };

    const primeira = await executarComIdempotencia(
      armazem,
      pedidoDe({ parametrosDeCaminho: { recursoId: 'aaa' } }),
      executar,
    );
    assert.deepEqual(primeira, { status: 201, body: { recurso: 1 } });

    // Mesma conta, mesma chave, mesmo corpo, OUTRO recurso. Sem o conserto isto
    // devolvia `{ recurso: 1 }` com status 201, e o segundo recurso ficava sem
    // efeito nenhum.
    await assert.rejects(
      () =>
        executarComIdempotencia(
          armazem,
          pedidoDe({ parametrosDeCaminho: { recursoId: 'bbb' } }),
          executar,
        ),
      (erro: unknown) => (erro as { status?: number }).status === 400,
      'a mesma chave em outro recurso devolveu a resposta do primeiro',
    );
    assert.equal(efeitos, 1);
  });

  void it('o mesmo recurso com a mesma chave continua sendo o mesmo pedido', async () => {
    const armazem = idempotenciaEmMemoria();
    let efeitos = 0;
    const executar = (): Promise<RespostaGravada> => {
      efeitos += 1;
      return Promise.resolve({ status: 201, body: { recurso: efeitos } });
    };
    const pedido = pedidoDe({ parametrosDeCaminho: { recursoId: 'aaa' } });

    const primeira = await executarComIdempotencia(armazem, pedido, executar);
    const segunda = await executarComIdempotencia(armazem, pedido, executar);

    // O conserto não pode quebrar o que a idempotência existe para fazer: o
    // reenvio da fila offline do MESMO pedido devolve a resposta original.
    assert.deepEqual(segunda, primeira);
    assert.equal(efeitos, 1);
  });

  void it('rota SEM parâmetro de caminho produz o corpo canônico de sempre', () => {
    // Acrescentar envelope onde não há defeito invalidaria chave em voo de
    // `createPet` e de `createStrayFoundReport` sem fechar nada.
    const corpo = { name: 'Bichu', species_code: 'dog' };
    assert.equal(
      corpoCanonicoDoPedido(
        pedidoDe({ endpoint: 'POST /pets', parametrosDeCaminho: {}, corpo }),
      ),
      canonicalizarCorpo(corpo),
    );
  });

  void it('parâmetro presente mas vazio conta como ausente', () => {
    assert.throws(
      () => corpoCanonicoDoPedido(pedidoDe({ parametrosDeCaminho: { recursoId: '' } })),
      /id no caminho fora da chave/,
    );
    assert.throws(
      () => corpoCanonicoDoPedido(pedidoDe({ parametrosDeCaminho: { outroNome: 'aaa' } })),
      /recursoId/,
      'um nome trocado precisa acusar o nome que FALTA, não passar calado',
    );
  });

  void it('o molde com dois parâmetros exige os dois', () => {
    const dois = { endpoint: 'POST /pets/:petId/tags/:tagId/avisos' };
    assert.throws(
      () => corpoCanonicoDoPedido(pedidoDe({ ...dois, parametrosDeCaminho: { petId: 'p1' } })),
      /tagId/,
    );
    assert.notEqual(
      corpoCanonicoDoPedido(
        pedidoDe({ ...dois, parametrosDeCaminho: { petId: 'p1', tagId: 't1' } }),
      ),
      corpoCanonicoDoPedido(
        pedidoDe({ ...dois, parametrosDeCaminho: { petId: 'p1', tagId: 't2' } }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. A VARREDURA: toda rota idempotente do produto, com veredito
// ---------------------------------------------------------------------------

/**
 * O veredito de cada operação idempotente do contrato.
 *
 * `rota` para a que tem handler registrado; `semHandler` para a que o contrato
 * declara e o código ainda não implementa. A lista é conferida contra
 * `api/openapi.yaml` no caso `nenhuma operação idempotente fica sem veredito`:
 * operação nova sem linha aqui reprova.
 */
type Veredito =
  | { readonly operationId: string; readonly path: string }
  | { readonly operationId: string; readonly semHandler: string };

/**
 * As rotas entram pelo OBJETO, e o `operationId` sai dele. Escrever o
 * `operationId` à mão aqui já produziu uma linha errada — `defineRoute` é a
 * fonte, e uma cópia do nome diverge dela sem nada acusar.
 */
const VEREDITOS: readonly Veredito[] = [
  rotaDeCadastroDePet,
  rotaDeRegistroDeAchado,
  rotaDeAberturaDeCaso,
  rotaDeEnvioDeMensagem,
  rotaDeAvisoPelaTag,
  rotaDeCancelamentoPorToken,
  // O outro lado da conversa mediada, da BICHUS-41: o contrato declara
  // `Idempotency-Key` e não há handler. Quando ele existir, troque esta linha
  // pela rota — e o caso abaixo passa a exigir o id do caminho dela também.
  { operationId: 'postFinderMessage', semHandler: 'BICHUS-41, sem handler registrado' },
  // O achado sem conta do ADR-0030: contrato escrito antes do codigo, sem id no
  // caminho. Quando a rota existir, troque esta linha por ela.
  { operationId: 'createPublicFoundReport', semHandler: 'ADR-0030, sem handler registrado' },
];

void describe('varredura: toda rota idempotente do produto', () => {
  const contrato = carregarContrato('api/openapi.yaml');
  const declaradas = [...operacoesComIdempotencia(contrato).keys()];

  const comVeredito = VEREDITOS.map((v) => v.operationId);

  void it('nenhuma operação idempotente fica sem veredito', () => {
    assert.ok(declaradas.length > 0, 'o contrato não declarou nenhuma operação idempotente');
    assert.deepEqual(
      declaradas.filter((id) => !comVeredito.includes(id)),
      [],
      'operação idempotente nova no contrato sem linha em VEREDITOS: dê o veredito dela',
    );
    assert.deepEqual(
      comVeredito.filter((id) => !declaradas.includes(id)),
      [],
      'VEREDITOS cita operação que o contrato não declara idempotente',
    );
  });

  for (const veredito of VEREDITOS) {
    const operationId = veredito.operationId;
    if ('semHandler' in veredito) continue;

    const nomes = parametrosDoEndpoint(veredito.path);
    const rotulo =
      nomes.length === 0
        ? `${operationId}: sem id no caminho, nada a incluir`
        : `${operationId}: ${nomes.join(', ')} precisa(m) entrar na chave`;

    void it(rotulo, () => {
      const endpoint = `POST ${veredito.path}`;
      if (nomes.length === 0) {
        assert.equal(
          corpoCanonicoDoPedido(pedidoDe({ endpoint, parametrosDeCaminho: {} })),
          canonicalizarCorpo({ texto: 'igual nos dois' }),
        );
        return;
      }

      // Esquecer o id REPROVA.
      assert.throws(
        () => corpoCanonicoDoPedido(pedidoDe({ endpoint, parametrosDeCaminho: {} })),
        /id no caminho fora da chave/,
      );

      // E dois recursos diferentes produzem resumos diferentes, um id por vez —
      // com dois parâmetros, trocar só um já precisa separar os pedidos.
      const base = Object.fromEntries(nomes.map((n) => [n, `${n}-1`]));
      const canonicoBase = corpoCanonicoDoPedido(
        pedidoDe({ endpoint, parametrosDeCaminho: base }),
      );
      for (const nome of nomes) {
        assert.notEqual(
          corpoCanonicoDoPedido(
            pedidoDe({ endpoint, parametrosDeCaminho: { ...base, [nome]: `${nome}-2` } }),
          ),
          canonicoBase,
          `trocar ${nome} não mudou o corpo canônico: a mesma chave devolveria a resposta do outro recurso`,
        );
      }
    });
  }
});
