/** Testes da resolução de segredos de runtime (ADR-0022). */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { NomeDeSegredo, SecretProvider } from '../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../ports/secret-provider.js';
import { criarSecretProviderDeAmbiente } from '../adapters/external/env-var-secret-provider.js';
import {
  SEGREDOS_DE_RUNTIME,
  exigeGerenciadorDeSegredos,
  resolverSegredos,
  segredosDeRuntime,
} from './segredos.js';

const A = 'SEGREDO_DE_TESTE_A';
const B = 'SEGREDO_DE_TESTE_B';
const VALOR_QUE_NAO_PODE_VAZAR = 'valor-descartavel-que-nao-pode-aparecer-em-log';

const NOMES = [A, B, 'NODE_ENV'];
const ORIGINAL = new Map(NOMES.map((nome) => [nome, process.env[nome]]));

afterEach(() => {
  for (const [nome, valor] of ORIGINAL) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

/** Um provedor que responde o que o caso mandar, e nada mais. */
function provedorFalso(mapa: Record<string, string | Error>): SecretProvider {
  return {
    fonte: 'provedor de teste',
    obter(nome: NomeDeSegredo): Promise<string> {
      const resposta = mapa[nome];
      if (resposta === undefined) {
        return Promise.reject(new SegredoIndisponivelError(nome, 'não existe no teste.'));
      }
      if (resposta instanceof Error) return Promise.reject(resposta);
      return Promise.resolve(resposta);
    },
  };
}

void describe('falha ruidosa: a subida morre citando QUAL segredo faltou', () => {
  void it('a mensagem traz o nome do segredo ausente', async () => {
    await assert.rejects(
      () => resolverSegredos(provedorFalso({ [B]: 'presente' }), [A, B]),
      (erro: unknown) => erro instanceof Error && erro.message.includes(A),
    );
  });

  void it('faltando dois, a mensagem traz OS DOIS e não só o primeiro', async () => {
    await assert.rejects(
      () => resolverSegredos(provedorFalso({}), [A, B]),
      (erro: unknown) => erro instanceof Error && erro.message.includes(A) && erro.message.includes(B),
    );
  });

  void it('nada é escrito em process.env quando um único segredo falta', async () => {
    delete process.env[A];
    delete process.env[B];
    await assert.rejects(() => resolverSegredos(provedorFalso({ [B]: 'presente' }), [B, A]));
    assert.equal(process.env[B], undefined, 'resolução parcial deixaria o processo meio configurado');
  });

  void it('erro CRU do provedor não escapa sem o nome do segredo', async () => {
    const cru = new Error('permission denied');
    await assert.rejects(
      () => resolverSegredos(provedorFalso({ [A]: cru, [B]: 'presente' }), [A, B]),
      (erro: unknown) =>
        erro instanceof SegredoIndisponivelError && erro.nome === A && erro.message.includes(A),
    );
  });

  void it('o VALOR do segredo nunca aparece na mensagem de erro', async () => {
    await assert.rejects(
      () => resolverSegredos(provedorFalso({ [A]: VALOR_QUE_NAO_PODE_VAZAR }), [A, B]),
      (erro: unknown) => erro instanceof Error && !erro.message.includes(VALOR_QUE_NAO_PODE_VAZAR),
    );
  });
});

void describe('o valor chega ao ambiente exatamente como foi gravado', () => {
  void it('escreve em process.env sob o MESMO nome, sem tradução', async () => {
    delete process.env[A];
    await resolverSegredos(provedorFalso({ [A]: VALOR_QUE_NAO_PODE_VAZAR }), [A]);
    assert.equal(process.env[A], VALOR_QUE_NAO_PODE_VAZAR);
  });

  void it('não faz trim: a quebra final de um PEM sobrevive', async () => {
    const comQuebra = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
    await resolverSegredos(provedorFalso({ [A]: comQuebra }), [A]);
    assert.equal(process.env[A], comQuebra);
  });

  void it('sobrescreve o que já estava no ambiente', async () => {
    process.env[A] = 'valor-antigo-do-arquivo';
    await resolverSegredos(provedorFalso({ [A]: 'valor-novo-do-gerenciador' }), [A]);
    assert.equal(process.env[A], 'valor-novo-do-gerenciador');
  });
});

void describe('adaptador de variável de ambiente: o que roda em dev e em teste', () => {
  void it('ausente: rejeita citando o nome da variável', async () => {
    delete process.env[A];
    await assert.rejects(
      () => criarSecretProviderDeAmbiente().obter(A),
      (erro: unknown) => erro instanceof SegredoIndisponivelError && erro.nome === A,
    );
  });

  void it('vazia é ausência, e não valor', async () => {
    process.env[A] = '';
    await assert.rejects(
      () => criarSecretProviderDeAmbiente().obter(A),
      (erro: unknown) => erro instanceof SegredoIndisponivelError && erro.nome === A,
    );
  });

  void it('rejeita a PROMESSA, sem lançar de forma síncrona', () => {
    delete process.env[A];
    const provedor = criarSecretProviderDeAmbiente();
    assert.doesNotThrow(() => void provedor.obter(A).catch(() => undefined));
  });
});

void describe('onde o gerenciador entra, e onde ele deliberadamente não entra', () => {
  void it('dev e qa continuam lendo do ambiente: npm test não pede nuvem', () => {
    delete process.env['NODE_ENV'];
    assert.equal(exigeGerenciadorDeSegredos('dev'), false);
    assert.equal(exigeGerenciadorDeSegredos('qa'), false);
    assert.equal(exigeGerenciadorDeSegredos('homolog'), false);
  });

  void it('prod e preprod exigem o gerenciador', () => {
    delete process.env['NODE_ENV'];
    assert.equal(exigeGerenciadorDeSegredos('prod'), true);
    assert.equal(exigeGerenciadorDeSegredos('preprod'), true);
  });

  void it('NODE_ENV=production vale sozinho, com ENVIRONMENT dizendo outra coisa', () => {
    process.env['NODE_ENV'] = 'production';
    assert.equal(exigeGerenciadorDeSegredos('dev'), true);
  });
});

/** A lista de segredos de runtime e o token do provedor de e-mail. */
void describe('ISCA: o token do provedor de e-mail e buscado no cofre', () => {
  void it('MAIL_API_TOKEN esta em SEGREDOS_DE_RUNTIME, junto com o codigo que o le', () => {
    assert.ok(
      SEGREDOS_DE_RUNTIME.includes('MAIL_API_TOKEN'),
      'REPROVA: `MAIL_API_TOKEN` saiu da lista de segredos de runtime. Em ambiente ' +
        'hospedado ele nao seria buscado no gerenciador (ADR-0022), e o ' +
        '`requireEnv(\'MAIL_API_TOKEN\')` de `app-config.ts` derrubaria a subida com ' +
        '`MAIL_TRANSPORT=postmark` -- nenhum e-mail transacional sairia, e a mensagem ' +
        'mandaria o operador procurar a variavel num arquivo que o ADR-0022 tirou da VM.',
    );
  });

  void it('a resolucao escreve o valor do cofre em process.env sob o MESMO nome', async () => {
    const original = process.env['MAIL_API_TOKEN'];
    try {
      delete process.env['MAIL_API_TOKEN'];
      await resolverSegredos(provedorFalso({ MAIL_API_TOKEN: 'valor-de-cofre-dublado' }), [
        'MAIL_API_TOKEN',
      ]);
      assert.equal(process.env['MAIL_API_TOKEN'], 'valor-de-cofre-dublado');
    } finally {
      if (original === undefined) delete process.env['MAIL_API_TOKEN'];
      else process.env['MAIL_API_TOKEN'] = original;
    }
  });
});

/**
 * A ISCA DA REGRESSAO DE 29/09: o token do provedor so e RESOLVIDO quando o
 * transporte precisa dele.
 */
void describe('ISCA: o token do provedor so e resolvido no transporte que o le', () => {
  void it('com `smtp`, MAIL_API_TOKEN fica FORA da lista que a subida resolve', () => {
    assert.ok(
      !segredosDeRuntime('smtp').includes('MAIL_API_TOKEN'),
      'REPROVA: a subida com `MAIL_TRANSPORT=smtp` voltou a resolver ' +
        '`MAIL_API_TOKEN`. Com `smtp` ninguem le o token, e cobra-lo mata `api` e ' +
        '`worker` na subida pelo caminho do README -- a regressao de 29/09.',
    );
  });

  void it('com `log`, tambem fica de fora: nada sai do processo', () => {
    assert.ok(!segredosDeRuntime('log').includes('MAIL_API_TOKEN'));
  });

  void it('com `postmark`, MAIL_API_TOKEN CONTINUA na lista resolvida', () => {
    assert.ok(
      segredosDeRuntime('postmark').includes('MAIL_API_TOKEN'),
      'REPROVA: `postmark` entrega de verdade e emite o token no cabecalho ' +
        '`X-Postmark-Server-Token`. Nao busca-lo deixaria o ambiente hospedado ' +
        'subir para falhar com 401 no primeiro envio.',
    );
  });

  void it('o recorte NAO mexe em nenhum outro segredo da lista', () => {
    const outros = SEGREDOS_DE_RUNTIME.filter((n) => n !== 'MAIL_API_TOKEN');
    assert.deepEqual([...segredosDeRuntime('smtp')], [...outros]);
    assert.deepEqual([...segredosDeRuntime('postmark')], [...SEGREDOS_DE_RUNTIME]);
  });

  void it('valor desconhecido nao busca o token: quem morre por ele e app-config', () => {
    assert.ok(!segredosDeRuntime('mailpit').includes('MAIL_API_TOKEN'));
  });

  void it('o padrao vem do ambiente, e sem MAIL_TRANSPORT ele e `smtp`', () => {
    const original = process.env['MAIL_TRANSPORT'];
    try {
      delete process.env['MAIL_TRANSPORT'];
      assert.ok(!segredosDeRuntime().includes('MAIL_API_TOKEN'));
      process.env['MAIL_TRANSPORT'] = 'postmark';
      assert.ok(segredosDeRuntime().includes('MAIL_API_TOKEN'));
    } finally {
      if (original === undefined) delete process.env['MAIL_TRANSPORT'];
      else process.env['MAIL_TRANSPORT'] = original;
    }
  });

  void it('a subida com `smtp` e sem token NAO morre: nenhum nome e cobrado', async () => {
    const original = process.env['MAIL_API_TOKEN'];
    try {
      delete process.env['MAIL_API_TOKEN'];
      await resolverSegredos(provedorFalso({ [A]: 'presente' }), segredosDeRuntime('smtp', [A, 'MAIL_API_TOKEN']));
      assert.equal(process.env['MAIL_API_TOKEN'], undefined);
    } finally {
      if (original === undefined) delete process.env['MAIL_API_TOKEN'];
      else process.env['MAIL_API_TOKEN'] = original;
    }
  });

  void it('a subida com `postmark` e sem token MORRE nomeando MAIL_API_TOKEN', async () => {
    const original = process.env['MAIL_API_TOKEN'];
    try {
      delete process.env['MAIL_API_TOKEN'];
      await assert.rejects(
        () =>
          resolverSegredos(
            provedorFalso({ [A]: 'presente' }),
            segredosDeRuntime('postmark', [A, 'MAIL_API_TOKEN']),
          ),
        /MAIL_API_TOKEN/,
      );
    } finally {
      if (original === undefined) delete process.env['MAIL_API_TOKEN'];
      else process.env['MAIL_API_TOKEN'] = original;
    }
  });
});
