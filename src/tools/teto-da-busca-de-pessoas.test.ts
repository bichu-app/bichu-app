import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

interface EntradaDeTeto {
  readonly dimension?: readonly string[];
  readonly limit?: number;
  readonly window?: string;
  readonly on_exceed?: string;
  readonly applies_to?: string;
}

interface Operacao {
  readonly operationId?: string;
  readonly 'x-rate-limit'?: readonly EntradaDeTeto[];
  readonly security?: readonly Record<string, readonly string[]>[];
}

interface Spec {
  readonly paths: Record<string, Record<string, Operacao>>;
}

const spec = parse(readFileSync('api/openapi.yaml', 'utf8')) as Spec;
const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operacao(id: string): Operacao {
  for (const item of Object.values(spec.paths)) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (op?.operationId === id) return op;
    }
  }
  throw new Error(`a operação ${id} não existe no contrato`);
}

const tetosDe = (id: string): readonly EntradaDeTeto[] => operacao(id)['x-rate-limit'] ?? [];

void describe('o teto de consultas da busca de pessoas', () => {
  void it('ISCA -- `searchPeople` DECLARA teto, e a ausencia reprovaria aqui', () => {
    const tetos = tetosDe('searchPeople');
    assert.ok(
      tetos.length > 0,
      'sem `x-rate-limit`, `registrar-rota.ts` nao tem o que aplicar: a rota continua ' +
        'funcionando e NADA acusa. E o defeito que o ADR-0016 emenda 1 descreve -- ' +
        '"nao e que alguem esqueceu de chamar hit(): e que era possivel esquecer".',
    );
  });

  void it('ISCA -- existe um teto na dimensao `[account, q]`, o freio de VARREDURA', () => {
    const daBusca = tetosDe('searchPeople').find(
      (t) => (t.dimension ?? []).includes('q') && (t.dimension ?? []).includes('account'),
    );
    assert.ok(
      daBusca !== undefined,
      'o teto de CONSULTAS que o cliente pediu e a entrada `[account, q]`. Sem ela sobra ' +
        'so o teto da rota, que conta tambem quem abre a aba e rola a lista -- e nao ' +
        'limita busca nenhuma em particular.',
    );
    assert.equal(daBusca?.on_exceed, 'deny_429', 'so `deny_429` RECUSA; os outros observam');
    assert.ok((daBusca?.limit ?? 0) > 0, 'teto sem numero nao e teto');
  });

  void it('ISCA -- o teto da busca e POR CONTA: `q` sozinha somaria todo mundo', () => {
    for (const teto of tetosDe('searchPeople')) {
      const dim = teto.dimension ?? [];
      if (!dim.includes('q')) continue;
      assert.ok(
        dim.includes('account'),
        'um teto na dimensao `[q]` sozinha poe TODAS as contas no mesmo balde, porque o ' +
          'resolvedor de `q` devolve uma marca constante e nao o termo. O numero ' +
          'existiria no contrato e o teto nao limitaria conta nenhuma.',
      );
    }
  });

  void it('ISCA -- nenhum teto da busca e por `ip` (CGNAT pega vizinho inocente)', () => {
    for (const teto of tetosDe('searchPeople')) {
      const dim = teto.dimension ?? [];
      assert.ok(
        !dim.includes('ip') && !dim.includes('ip_24'),
        'a rota exige conta, entao `account` existe e e exato. O CGNAT das operadoras ' +
          'brasileiras faria um teto por IP pegar vizinho inocente e errar quem raspa.',
      );
    }
  });

  void it('a busca exige CONTA, sem alternativa vazia', () => {
    const seguranca = operacao('searchPeople').security ?? [];
    assert.ok(
      seguranca.length === 1 && Object.keys(seguranca[0] ?? {})[0] === 'bearerAuth',
      'busca de pessoas alcancavel sem conta nao tem teto possivel por conta, e a ' +
        'coluna "sem conta" da tabela 4-B e vazia inteira.',
    );
  });

  void it('ISCA: a conferencia REPROVA um teto removido e um teto sem `account`', () => {
    const originais = tetosDe('searchPeople');

    const semTeto: readonly EntradaDeTeto[] = [];
    assert.equal(
      semTeto.length,
      0,
      'a isca passou: a conferencia de presenca nao reconheceria a remocao',
    );

    const comDimensaoErrada = originais.map((t) =>
      (t.dimension ?? []).includes('q') ? { ...t, dimension: ['q'] } : t,
    );
    const aindaPorConta = comDimensaoErrada
      .filter((t) => (t.dimension ?? []).includes('q'))
      .every((t) => (t.dimension ?? []).includes('account'));
    assert.equal(
      aindaPorConta,
      false,
      'a isca passou: a conferencia nao enxerga um teto de busca que deixou de ser por ' +
        'conta -- que e a forma de desligar o teto SEM apagar o numero do contrato.',
    );
  });
});

void describe('o teto da resolucao de convite conta a tentativa INVALIDA', () => {
  void it('ISCA -- `resolveConnectionInvite` tem uma entrada `invalid_attempts`', () => {
    const invalidas = tetosDe('resolveConnectionInvite').find(
      (t) => t.applies_to === 'invalid_attempts',
    );
    assert.ok(
      invalidas !== undefined,
      'sem ela, tentar tokens ao acaso custa o mesmo que abrir o proprio link. Com ela, ' +
        'so a tentativa que se revelou INVALIDA consome o contador -- e o criterio 8 da ' +
        'BICHUS-178 existe para impedir que a valida o consuma.',
    );
    assert.equal(invalidas?.on_exceed, 'deny_429');
  });

  void it('a emissao e a revogacao do convite tambem declaram teto', () => {
    for (const id of ['issueConnectionInvite', 'revokeConnectionInvite']) {
      const tetos = tetosDe(id);
      assert.ok(tetos.length > 0, `${id} nao declara teto`);
      assert.ok(
        tetos.some((t) => (t.dimension ?? []).includes('account')),
        `${id} nao tem teto por conta`,
      );
    }
  });
});
