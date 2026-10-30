/**
 * O vocabulario da fila de duvidas.
 *
 * ## ONDE ESTE ARQUIVO MORA, e por que nao em `src/`
 *
 * `admin/vite.config.ts` declara `include: ['test/**\/*.test.{ts,tsx}']`, e so
 * isso: um `.test.ts` dentro de `src/` **nao e executado por `npm test`** e
 * fica verde por nunca rodar.
 *
 * ## AS ISCAS
 *
 * | mexa em `fila.ts` | reprova |
 * |---|---|
 * | `previa` devolvendo o texto inteiro | `corta o texto longo e marca o corte` |
 * | `previa` cortando texto curto | `nao mexe no texto que ja cabe` |
 * | `previa` sem juntar espacos | `achata quebra de linha` |
 * | `casaComABusca` olhando so o assunto | `a busca alcanca o TEXTO` |
 * | `casaComABusca` sensivel a caixa | `a busca ignora caixa` |
 * | `COLUNAS` com coluna de autor ou de situacao | `nao ha coluna de autor nem de situacao` |
 */
import { describe, expect, it } from 'vitest';

import { casaComABusca, COLUNAS, dataCurta, previa, type Duvida } from '../../src/ajuda/fila.ts';

function duvida(extra: Partial<Duvida> = {}): Duvida {
  return {
    ref: 'AAAAAAAAAAAAAAAAAAAAAA',
    subject: 'Não salva o segundo pet',
    body: 'A tela volta para o começo quando eu aperto salvar.',
    created_at: '2026-10-29T23:14:54.000Z',
    ...extra,
  };
}

describe('a prévia do texto na linha da tabela', () => {
  it('não mexe no texto que já cabe', () => {
    expect(previa('Texto curto.')).toBe('Texto curto.');
  });

  it('corta o texto longo e marca o corte', () => {
    const resultado = previa('a'.repeat(400));
    expect(resultado).toHaveLength(120);
    expect(resultado.endsWith('…')).toBe(true);
  });

  it('achata quebra de linha: a linha da tabela tem uma linha só', () => {
    expect(previa('Primeira\n\nSegunda')).toBe('Primeira Segunda');
  });
});

describe('a busca da tela', () => {
  it('sem busca, tudo passa', () => {
    expect(casaComABusca(duvida(), '')).toBe(true);
  });

  it('a busca alcança o TEXTO, e não só o assunto', () => {
    expect(casaComABusca(duvida(), 'aperto salvar')).toBe(true);
  });

  it('a busca ignora caixa', () => {
    // A tela passa o termo já em minúsculas; o que se mede aqui é que o lado
    // do dado também desce, senão `Não Salva` nunca casaria com `não salva`.
    expect(casaComABusca(duvida({ subject: 'NÃO SALVA' }), 'não salva')).toBe(true);
  });

  it('o que não casa fica de fora', () => {
    expect(casaComABusca(duvida(), 'plaquinha')).toBe(false);
  });
});

describe('as colunas da fila', () => {
  it('não há coluna de autor nem de situação', () => {
    const texto = COLUNAS.join(' ').toLowerCase();
    for (const proibida of ['autor', 'quem', 'tutor', 'e-mail', 'email', 'situação', 'status']) {
      expect(texto).not.toContain(proibida);
    }
  });

  it('a última coluna é a das ações, e é anônima', () => {
    // `LinhasCarregando` desenha uma célula por entrada de `COLUNAS`: um
    // esqueleto com menos colunas que a tabela salta na troca.
    expect(COLUNAS).toHaveLength(4);
    expect(COLUNAS[COLUNAS.length - 1]).toBe('');
  });
});

describe('a data', () => {
  it('ausente vira travessão, e nunca `Invalid Date`', () => {
    expect(dataCurta(undefined)).toBe('—');
    expect(dataCurta(null)).toBe('—');
    expect(dataCurta('')).toBe('—');
  });
});
