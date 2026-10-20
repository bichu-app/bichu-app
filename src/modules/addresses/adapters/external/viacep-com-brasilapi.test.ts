/**
 * ISCAS DA BUSCA DE CEP DO SERVIDOR -- **escritas e NAO rodadas** nesta
 * entrega, por regra do cliente de 18/10/2026 (sem suite unitaria, sem
 * integracao, sem `make verificar`).
 *
 * ## Cada isca prova por DESLIGAMENTO, e aqui esta o que desligar
 *
 * | isca | o que desligar para ela reprovar |
 * |---|---|
 * | `erro` como texto | trocar `erro === true \|\| erro === 'true'` por so `=== true` |
 * | HTML com 400 | mover `if (resposta.status !== 200)` para DEPOIS do `json()` |
 * | coordenada ignorada | acrescentar `location` ao objeto que o adaptador monta |
 * | ViaCEP e primeiro | inverter a ordem das duas tentativas em `buscar` |
 * | reserva so depois | idem |
 * | prazo por servico | remover o `AbortSignal.timeout` das duas chamadas |
 * | nunca lanca | remover o `try/catch` de `tentar` |
 * | endereco pela metade | remover `enderecoValido` |
 *
 * Nenhuma delas toca a rede: o `fetch` e injetado em toda isca. Um teste de
 * busca de CEP que chamasse o ViaCEP de verdade seria um teste que falha no
 * dia em que a casa esta sem internet, e que gasta cota de terceiro a cada
 * execucao da esteira.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarBuscaDeCep } from './viacep-com-brasilapi.js';

/** Uma resposta de rede falsa, sem tocar em `globalThis.fetch`. */
function resposta(status: number, corpo: unknown, comoTexto = false): Response {
  return {
    status,
    json: () => {
      // O ViaCEP devolve HTML em CEP torto, e `json()` nele LANCA. A isca
      // reproduz isso de forma sincrona: o que importa e que lance.
      if (comoTexto) return Promise.reject(new SyntaxError('Unexpected token < in JSON'));
      return Promise.resolve(corpo);
    },
  } as unknown as Response;
}

function clienteFalso(respostas: ReadonlyArray<() => Response | Promise<Response>>) {
  const chamadas: string[] = [];
  let i = 0;
  const fetch = ((url: string) => {
    chamadas.push(String(url));
    const proxima = respostas[i++];
    if (proxima === undefined) throw new Error('chamada a mais do que a isca previu');
    return Promise.resolve(proxima());
  }) as unknown as typeof globalThis.fetch;
  return { fetch, chamadas };
}

const DO_VIA_CEP = {
  cep: '05435-000',
  logradouro: 'Rua Harmonia',
  complemento: 'até 609 - lado ímpar',
  bairro: 'Sumarezinho',
  localidade: 'São Paulo',
  uf: 'SP',
};

void describe('busca de CEP do servidor', () => {
  void it('ISCA: `erro` vem como a STRING "true", e isso e CEP inexistente e nao endereco vazio', async () => {
    // Medido em 17/10/2026 contra o ViaCEP. Com `=== true` sozinho, este corpo
    // cairia em `enderecoValido` e viraria `null` -> a reserva seria chamada e
    // a frase da tela mudaria; pior, se a reserva tambem calasse, um endereco
    // VAZIO poderia ser tratado como achado e apagar o que a pessoa digitou.
    const { fetch, chamadas } = clienteFalso([
      () => resposta(200, { erro: 'true' }),
      () => resposta(404, {}),
    ]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('99999999');
    assert.equal(r.desfecho, 'naoEncontrado');
    assert.equal(chamadas.length, 2, 'a reserva ainda e perguntada: as duas bases divergem');
  });

  void it('ISCA: `erro: true` booleano tambem e tratado, para o dia em que a base normalizar', async () => {
    const { fetch } = clienteFalso([() => resposta(200, { erro: true }), () => resposta(404, {})]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('99999999');
    assert.equal(r.desfecho, 'naoEncontrado');
  });

  void it('ISCA: CEP malformado devolve HTML com 400, e o adaptador NAO estoura', async () => {
    // A isca que mede a ORDEM: `json()` neste corpo lanca. O status vem antes,
    // entao nada e lido. Mover a conferencia de status para depois do `json()`
    // faz esta isca reprovar com a excecao vazando -- ou, pior, virando
    // `indisponivel` para um servico que estava no ar.
    const { fetch } = clienteFalso([
      () => resposta(400, '<!DOCTYPE html><html>erro</html>', true),
      () => resposta(404, {}),
    ]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('00000000');
    assert.equal(r.desfecho, 'naoEncontrado');
  });

  void it('ISCA: o ViaCEP e o PRIMEIRO, e a reserva nao e consultada quando ele acha', async () => {
    const { fetch, chamadas } = clienteFalso([() => resposta(200, DO_VIA_CEP)]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('05435000');
    assert.equal(r.desfecho, 'encontrado');
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0]?.includes('viacep'), 'a primeira chamada e a do servico que o cliente nomeou');
  });

  void it('ISCA: os quatro campos, e o `complemento` do ViaCEP NAO e o complemento de ninguem', async () => {
    const { fetch } = clienteFalso([() => resposta(200, DO_VIA_CEP)]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('05435000');
    assert.equal(r.desfecho, 'encontrado');
    assert.deepEqual(r.desfecho === 'encontrado' ? r.endereco : null, {
      street: 'Rua Harmonia',
      neighborhood: 'Sumarezinho',
      city: 'São Paulo',
      state: 'SP',
    });
    // "até 609 - lado ímpar" descreve a FAIXA da rua. Se ele aparecer em
    // qualquer campo da resposta, esta isca reprova.
    assert.ok(!JSON.stringify(r).includes('609'));
  });

  void it('ISCA: a COORDENADA da reserva e ignorada -- ADR-0006', async () => {
    const { fetch } = clienteFalso([
      () => resposta(500, {}),
      () =>
        resposta(200, {
          street: 'Rua Harmonia',
          neighborhood: 'Sumarezinho',
          city: 'São Paulo',
          state: 'SP',
          location: { type: 'Point', coordinates: { longitude: '-46.6', latitude: '-23.5' } },
          ibge: '3550308',
        }),
    ]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('05435000');
    const serializada = JSON.stringify(r);
    for (const proibido of ['location', 'coordinates', 'latitude', 'longitude', '-46.6', '-23.5', 'ibge']) {
      assert.ok(!serializada.includes(proibido), `${proibido} nao pode atravessar o adaptador`);
    }
  });

  void it('ISCA: endereco pela metade NAO e achado -- sem cidade, nada e preenchido', async () => {
    // Sem esta guarda, a tela receberia cidade vazia e UF vazia como "achado",
    // e o formulario poderia limpar campo que o operador havia preenchido.
    const { fetch } = clienteFalso([
      () => resposta(200, { logradouro: 'Rua Harmonia', bairro: '', localidade: '', uf: '' }),
      () => resposta(500, {}),
    ]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('05435000');
    assert.equal(r.desfecho, 'indisponivel');
  });

  void it('ISCA: os dois servicos fora do ar dao `indisponivel`, e NUNCA uma excecao', async () => {
    const { fetch } = clienteFalso([
      () => {
        throw new Error('ECONNREFUSED');
      },
      () => {
        throw new Error('ETIMEDOUT');
      },
    ]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('05435000');
    assert.equal(r.desfecho, 'indisponivel');
  });

  void it('ISCA: CEP que nao tem oito digitos nao viaja', async () => {
    const { fetch, chamadas } = clienteFalso([]);
    const r = await criarBuscaDeCep({ buscarNaRede: fetch }).buscar('054');
    assert.equal(r.desfecho, 'naoEncontrado');
    assert.equal(chamadas.length, 0, 'CEP torto nao gasta chamada de terceiro');
  });

  void it('ISCA: o prazo e POR SERVICO, e estourar nao lanca', async () => {
    // O cliente falso HONRA o `signal`, de proposito: e so assim que a isca
    // mede o prazo em vez de medir o cliente falso. Remover o
    // `AbortSignal.timeout` das duas chamadas faz `sinal` chegar `undefined`
    // e a isca reprova em `assert.ok(sinal)` -- e nao pendura, que seria o
    // modo de falha inaceitavel num teste de prazo.
    let chamadas = 0;
    const fetch = ((_url: string, init?: { signal?: AbortSignal }) => {
      chamadas += 1;
      const sinal = init?.signal;
      assert.ok(sinal, 'cada chamada de saida tem de carregar o prazo');
      return new Promise<Response>((_resolver, recusar) => {
        // **O TIMER DE `AbortSignal.timeout` E UNREF, e sozinho ele NAO segura
        // o laco de eventos.** Medido no Node 22.23.2:
        // `AbortSignal.timeout(5)` com mais nada pendente sai do processo sem
        // nunca disparar o `abort`.
        //
        // Com o `fetch` de verdade quem segura o laco e o SOCKET, que e ref, e
        // por isso o prazo estoura em producao. Aqui nao ha socket nenhum: o
        // unico pendente era este `Promise`, que so se resolve no `abort` que
        // nunca vem. `node:test` entao reprova com "Promise resolution is
        // still pending but the event loop has already resolved" -- e levava o
        // `describe` inteiro junto, como cancelado. Medido na esteira de
        // 20/10/2026: 1 reprovado e 1 cancelado neste arquivo.
        //
        // Este timer e ref e existe so para segurar o laco enquanto o prazo
        // corre; ele e limpo no `abort` e nao resolve nada por conta propria.
        // **Nao resolver nada e deliberado**: um timer que recusasse por conta
        // propria faria a isca passar com o `AbortSignal` arrancado do codigo,
        // que e exatamente o que ela existe para pegar.
        const seguraOLaco = setTimeout(() => {}, 1_000);
        sinal.addEventListener('abort', () => {
          clearTimeout(seguraOLaco);
          recusar(new DOMException('The operation was aborted', 'TimeoutError'));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const r = await criarBuscaDeCep({ buscarNaRede: fetch, prazoMs: 5 }).buscar('05435000');
    assert.equal(r.desfecho, 'indisponivel');
    assert.equal(chamadas, 2, 'o prazo vale POR SERVICO: os dois sao tentados');
  });
});
