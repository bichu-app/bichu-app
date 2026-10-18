/**
 * O vocabulario e as regras locais da fila de moderacao no painel.
 *
 * ## Por que o arquivo mora em `test/` e nao ao lado do codigo
 *
 * `vite.config.ts` declara `include: ['test/**\/*.test.{ts,tsx}']`, e so isso:
 * um `.test.ts` dentro de `src/` **nao e executado por `npm test`**. Ha dois
 * assim neste repositorio hoje (`src/diretorio/dominio.test.ts` e
 * `src/formato/telefone.test.ts`), e os dois estao verdes por nunca rodarem.
 * Esta isca foi escrita la primeiro, nao rodou, e foi movida -- o que serve de
 * aviso para a proxima.
 *
 * ## As iscas deste arquivo, e como cada uma seria desligada
 *
 * | o que mexer em `fila.ts` | reprova |
 * |---|---|
 * | fazer `conteudoDo` devolver `''` na conversa em vez da frase | 1 e 2 |
 * | fazer `conteudoDo` devolver o `content` sem olhar a origem | 1 (contrapeso) |
 * | fazer `repeticaoDe` mostrar um numero so | 3 |
 * | baixar `DENUNCIANTES_PARA_DESTAQUE` para 1 | 4 (contrapeso) |
 * | aceitar motivo de 2 simbolos em `erroDoMotivo` | 5 |
 * | trocar o teto de 500 por outro numero | 6 |
 */
import { describe, expect, it } from 'vitest';

import {
  DENUNCIANTES_PARA_DESTAQUE,
  LIMITE_DO_MOTIVO,
  MINIMO_DO_MOTIVO,
  ROTULO_DA_ORIGEM,
  conteudoDo,
  eInsistente,
  erroDoMotivo,
  notaDe,
  repeticaoDe,
  rotuloDoMotivo,
  type Item,
} from '../../src/moderacao/fila.ts';

function item(parcial: Partial<Item> = {}): Item {
  return {
    origin: 'review',
    target_ref: 'yjJwZ3hBc0RmR2hKa0xtTg',
    subject: 'Clinica Sao Jorge',
    content: 'texto da avaliacao',
    rating: 1,
    reason: 'offensive',
    reasons: ['offensive'],
    detail: null,
    report_count: 1,
    repeat_total: 1,
    first_reported_at: '2026-10-17T12:00:00.000Z',
    last_reported_at: '2026-10-17T12:00:00.000Z',
    content_removed: false,
    resolution: null,
    resolution_reason: null,
    resolved_at: null,
    ...parcial,
  };
}

describe('o conteudo da CONVERSA nao aparece, e a tela diz por que', () => {
  it('1. na origem `conversation` devolve a frase, e nao vazio', () => {
    const { texto, ausente } = conteudoDo(item({ origin: 'conversation', content: null }));
    expect(ausente).toBe(true);
    // A frase e obrigatoria: um campo vazio faria quem modera achar que a tela
    // quebrou, e tentar de novo.
    expect(texto).toContain('privada');
    expect(texto.length).toBeGreaterThan(20);
  });

  it('1. CONTRAPESO: na origem `review` o texto denunciado APARECE', () => {
    const { texto, ausente } = conteudoDo(item());
    expect(ausente).toBe(false);
    expect(texto).toBe('texto da avaliacao');
  });

  it('2. avaliacao sem texto (so nota) tambem recebe frase propria, e outra', () => {
    const so = conteudoDo(item({ content: null }));
    const conversa = conteudoDo(item({ origin: 'conversation', content: null }));
    expect(so.ausente).toBe(true);
    expect(so.texto).not.toBe(conversa.texto);
  });
});

describe('o sinal de repeticao', () => {
  it('3. mostra os DOIS numeros quando a insistencia passa das pessoas', () => {
    expect(repeticaoDe(item({ report_count: 3, repeat_total: 7 }))).toBe('3 denúncias · 7 no total');
  });

  it('3. mostra um numero so quando ninguem repetiu -- `3 · 3` nao informa nada', () => {
    expect(repeticaoDe(item({ report_count: 3, repeat_total: 3 }))).toBe('3 denúncias');
  });

  it('3. uma denuncia e singular', () => {
    expect(repeticaoDe(item())).toBe('1 denúncia');
  });

  it('4. tres denunciantes distintos ganham destaque', () => {
    expect(eInsistente(item({ report_count: DENUNCIANTES_PARA_DESTAQUE }))).toBe(true);
  });

  it('4. CONTRAPESO: dois nao ganham -- o destaque nao e sempre', () => {
    expect(eInsistente(item({ report_count: DENUNCIANTES_PARA_DESTAQUE - 1 }))).toBe(false);
  });
});

describe('o motivo da decisao', () => {
  it('5. vazio e espaco em branco sao recusados', () => {
    expect(erroDoMotivo('')).toBeDefined();
    expect(erroDoMotivo('   ')).toBeDefined();
  });

  it('5. abaixo do minimo e recusado, no minimo e aceito', () => {
    expect(erroDoMotivo('a'.repeat(MINIMO_DO_MOTIVO - 1))).toBeDefined();
    expect(erroDoMotivo('a'.repeat(MINIMO_DO_MOTIVO))).toBeUndefined();
  });

  it('6. o teto e o MESMO numero do `CHECK` do banco, e 501 e recusado', () => {
    expect(LIMITE_DO_MOTIVO).toBe(500);
    expect(erroDoMotivo('a'.repeat(LIMITE_DO_MOTIVO))).toBeUndefined();
    expect(erroDoMotivo('a'.repeat(LIMITE_DO_MOTIVO + 1))).toBeDefined();
  });
});

describe('os rotulos', () => {
  it('as duas origens construidas tem rotulo, e nenhuma a mais', () => {
    // A frente de comunidade vai acrescentar `profile` e `photo`; quando
    // acrescentar, o `satisfies Record<Origem, string>` de `fila.ts` reprova a
    // compilacao se o rotulo faltar, e este caso passa a contar 4.
    expect(Object.keys(ROTULO_DA_ORIGEM).sort()).toEqual(['conversation', 'review']);
  });

  it('motivo conhecido vira palavra; motivo novo aparece CRU em vez de desaparecer', () => {
    expect(rotuloDoMotivo('extortion')).toBe('Extorsão');
    expect(rotuloDoMotivo('not_about_this_place')).toBe('Não é sobre este lugar');
    expect(rotuloDoMotivo('motivo_que_ainda_nao_existe')).toBe('motivo_que_ainda_nao_existe');
  });

  it('a nota sai em estrela, e a conversa (sem nota) sai como travessao', () => {
    expect(notaDe(item({ rating: 2 }))).toBe('2★');
    expect(notaDe(item({ origin: 'conversation', rating: null }))).toBe('—');
  });
});
