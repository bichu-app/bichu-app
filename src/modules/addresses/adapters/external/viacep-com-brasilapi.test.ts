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
    // -- e a isca tem de reprovar, sem pendurar, que seria o modo de falha
    // inaceitavel num teste de prazo.
    //
    // ## O `assert.ok(sinal)` sozinho NAO reprova, e isso foi medido
    //
    // Ele lanca DENTRO do cliente falso, ou seja dentro da tentativa, e o
    // `try/catch` de `tentar` existe justamente para engolir tudo o que vem de
    // lá -- AssertionError inclusive. Com as duas chamadas sem prazo, o
    // desfecho continua `indisponivel` e `chamadas` continua 2: medido em
    // 18/10/2026, a isca **passava** 10/10 com o `AbortSignal.timeout`
    // arrancado do adaptador, nos dois Node. A linha da tabela do cabecalho
    // era, portanto, falsa. Quem reprova de verdade e o
    // `assert.equal(abortos, 2)` no fim, que roda FORA do alcance daquele
    // `catch`.
    //
    // ## A GUARDA, e por que ela nao e zelo
    //
    // O timer de `AbortSignal.timeout` **nao segura o laco de eventos** (ele e
    // `unref`ed, por desenho do Node). Este cliente falso devolve uma promessa
    // que SO se resolve quando o `abort` dispara, entao sem mais nada pendente
    // no laco a sequencia e: o laco drena, o timer de 5 ms nunca chega a
    // disparar, a promessa fica pendente para sempre e o runner **cancela** o
    // caso com `Promise resolution is still pending but the event loop has
    // already resolved`. Nao e teoria: medido em 18/10/2026, 10 execucoes em 10
    // canceladas no Node 22.23.2 (`node --test`, que roda o arquivo em processo
    // filho, que e o que a esteira faz) e 0 em 10 no Node 26.8.2 -- o runner do
    // 26 mantem handle proprio e disfarca o defeito. A esteira usa 22, e foi la
    // que ele apareceu (run 39130666267).
    //
    // A guarda e um `setTimeout` comum, que **e** `ref`ed: ela segura o laco
    // enquanto o prazo corre, e e limpa no `abort`. No caminho feliz ela custa
    // zero, porque o `abort` chega em 5 ms e a limpa. No caminho em que o prazo
    // NAO estoura, ela recusa em vez de pendurar -- e, porque `tentar` engole
    // toda excecao, o desfecho sozinho nao distinguiria os dois casos: e o
    // `assert.equal(abortos, 2)` no fim que prova que o `indisponivel` veio do
    // prazo e nao da guarda.
    const GUARDA_MS = 2_000;
    let chamadas = 0;
    let abortos = 0;
    const fetch = ((_url: string, init?: { signal?: AbortSignal }) => {
      chamadas += 1;
      const sinal = init?.signal;
      assert.ok(sinal, 'cada chamada de saida tem de carregar o prazo');
      return new Promise<Response>((_resolver, recusar) => {
        const guarda = setTimeout(() => {
          recusar(new Error(`o prazo nao estourou em ${String(GUARDA_MS)} ms`));
        }, GUARDA_MS);
        sinal.addEventListener('abort', () => {
          clearTimeout(guarda);
          abortos += 1;
          recusar(new DOMException('The operation was aborted', 'TimeoutError'));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const r = await criarBuscaDeCep({ buscarNaRede: fetch, prazoMs: 5 }).buscar('05435000');
    assert.equal(r.desfecho, 'indisponivel');
    assert.equal(chamadas, 2, 'o prazo vale POR SERVICO: os dois sao tentados');
    assert.equal(abortos, 2, 'o `indisponivel` veio do prazo estourando, e nao da guarda do laco');
  });
});
