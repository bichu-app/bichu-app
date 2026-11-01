import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarBuscaDeCep } from './viacep-com-brasilapi.js';

function resposta(status: number, corpo: unknown, comoTexto = false): Response {
  return {
    status,
    json: () => {
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
