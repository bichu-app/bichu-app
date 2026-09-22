/**
 * Testes do adaptador do gerenciador de segredos (ADR-0022).
 *
 * Sem rede: `fetch` entra por parâmetro. O que está sob teste não é o protocolo
 * do provedor — é a **tradução da falha dele para a mensagem que o operador
 * consegue usar**. O caso do `403` é o motivo de o arquivo existir: ele chega
 * tanto para "a conta não tem acesso" quanto para "o segredo não existe", e um
 * `permission denied` cru no log de subida manda quem lê mexer em IAM quando o
 * defeito era um segredo que ninguém criou.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SegredoIndisponivelError } from '../../ports/secret-provider.js';
import { criarSecretProviderGerenciado, type Buscar } from './gcp-secret-manager.js';

const CONFIG = { projeto: 'projeto-de-teste', versao: 'latest' };
const NOME = 'SEGREDO_DE_TESTE';
const VALOR_QUE_NAO_PODE_VAZAR = 'valor-descartavel-que-nao-pode-aparecer-em-log';

const TOKEN = JSON.stringify({ access_token: 'token-descartavel', expires_in: 3600 });

/**
 * `fetch` falso: responde o token no endereço de metadados e delega o resto ao
 * caso. As chamadas ficam registradas para que o teste confira o ENDEREÇO —
 * é ali que se prova que o nome da variável vira o identificador do segredo
 * sem tradução nenhuma.
 */
function buscarFalso(
  responder: (url: string) => Response,
): { buscar: Buscar; chamadas: string[] } {
  const chamadas: string[] = [];
  const buscar: Buscar = (entrada) => {
    const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
    chamadas.push(url);
    if (url.includes('metadata')) return Promise.resolve(new Response(TOKEN, { status: 200 }));
    return Promise.resolve(responder(url));
  };
  return { buscar, chamadas };
}

function respostaComValor(valor: string): Response {
  return new Response(
    JSON.stringify({ payload: { data: Buffer.from(valor, 'utf8').toString('base64') } }),
    { status: 200 },
  );
}

void describe('o nome da variável É o identificador do segredo', () => {
  void it('pede exatamente o nome recebido, sem prefixo nem minúsculas', async () => {
    const { buscar, chamadas } = buscarFalso(() => respostaComValor('v'));
    await criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME);
    const pedido = chamadas.find((url) => !url.includes('metadata'));
    assert.ok(pedido?.includes(`/secrets/${NOME}/versions/latest:access`), pedido);
  });
});

void describe('falha ruidosa: a mensagem diz QUAL segredo, nunca só o erro do provedor', () => {
  void it('403 cita o segredo e as DUAS causas possíveis', async () => {
    const { buscar } = buscarFalso(() => new Response('{"error":"PERMISSION_DENIED"}', { status: 403 }));
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) =>
        erro instanceof SegredoIndisponivelError &&
        erro.nome === NOME &&
        erro.message.includes(NOME) &&
        erro.message.includes('não existe') &&
        erro.message.includes('secretAccessor'),
    );
  });

  void it('404 cita o segredo e a versão pedida', async () => {
    const { buscar } = buscarFalso(() => new Response('{}', { status: 404 }));
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) =>
        erro instanceof SegredoIndisponivelError &&
        erro.message.includes(NOME) &&
        erro.message.includes('latest'),
    );
  });

  void it('rede fora do ar vira SegredoIndisponivelError com o nome, e não erro solto', async () => {
    const buscar: Buscar = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) => erro instanceof SegredoIndisponivelError && erro.nome === NOME,
    );
  });

  void it('versão existente e VAZIA é ausência, e cita o segredo', async () => {
    const { buscar } = buscarFalso(() => respostaComValor(''));
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) =>
        erro instanceof SegredoIndisponivelError && erro.nome === NOME && erro.message.includes('VAZIA'),
    );
  });

  void it('200 sem payload.data não devolve string vazia disfarçada de valor', async () => {
    const { buscar } = buscarFalso(() => new Response('{"name":"x"}', { status: 200 }));
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) => erro instanceof SegredoIndisponivelError && erro.nome === NOME,
    );
  });
});

void describe('o valor não vaza e não é adulterado', () => {
  void it('devolve os bytes como gravados, sem trim', async () => {
    const comQuebra = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
    const { buscar } = buscarFalso(() => respostaComValor(comQuebra));
    assert.equal(await criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME), comQuebra);
  });

  void it('o rótulo da fonte não carrega valor de segredo', () => {
    const { buscar } = buscarFalso(() => respostaComValor(VALOR_QUE_NAO_PODE_VAZAR));
    const provedor = criarSecretProviderGerenciado(CONFIG, buscar);
    assert.ok(!provedor.fonte.includes(VALOR_QUE_NAO_PODE_VAZAR));
    assert.ok(provedor.fonte.includes(CONFIG.projeto));
  });

  void it('token da instância é reaproveitado: não há uma ida ao metadados por segredo', async () => {
    const { buscar, chamadas } = buscarFalso(() => respostaComValor('v'));
    const provedor = criarSecretProviderGerenciado(CONFIG, buscar);
    await provedor.obter('UM');
    await provedor.obter('OUTRO');
    assert.equal(chamadas.filter((url) => url.includes('metadata')).length, 1);
  });

  void it('instância sem conta de serviço: o metadados recusa e o nome vai junto', async () => {
    const buscar: Buscar = (entrada) => {
      const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
      if (url.includes('metadata')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(respostaComValor('v'));
    };
    await assert.rejects(
      () => criarSecretProviderGerenciado(CONFIG, buscar).obter(NOME),
      (erro: unknown) => erro instanceof SegredoIndisponivelError && erro.nome === NOME,
    );
  });
});
