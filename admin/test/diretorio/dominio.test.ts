/**
 * O vocabulario e as regras locais do diretorio no painel.
 *
 * ## As iscas deste arquivo
 *
 * - **o slug sugerido respeita o `CHECK` do banco**: sem acento, minusculo, e
 *   **sem hifen na borda depois do corte em 30** -- era por aqui que um nome
 *   longo produzia um slug terminado em hifen, que o banco recusa;
 * - **a frase do pendente nao nasce vazia**: nada faltando devolve `undefined`,
 *   e nao string vazia que renderizaria um banner em branco;
 * - **a enumeracao e em portugues**: virgula entre os primeiros e "e" no
 *   ultimo.
 */
import { describe, expect, it } from 'vitest';

import { frasePendente, PADRAO_DO_SLUG, slugSugerido } from '../../src/diretorio/dominio.ts';

describe('slugSugerido', () => {
  it('tira acento, baixa a caixa e troca espaco por hifen', () => {
    expect(slugSugerido('Clínica Veterinária São Jorge')).toBe('clinica-veterinaria-sao-jorge');
  });

  it('nao deixa hifen na borda depois do corte em 30', () => {
    const slug = slugSugerido('Clinica Veterinaria Santa Barbara 24 Horas Pinheiros');
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith('-')).toBe(false);
    expect(PADRAO_DO_SLUG.test(slug)).toBe(true);
  });

  it('colapsa pontuacao em um hifen so', () => {
    expect(slugSugerido('Banho & Tosa -- do Bairro!')).toBe('banho-tosa-do-bairro');
  });
});

describe('frasePendente', () => {
  it('nada faltando devolve `undefined`, e nao string vazia', () => {
    expect(frasePendente([])).toBeUndefined();
  });

  it('uma falta sai no singular, sem enumeracao', () => {
    expect(frasePendente(['city'])).toBe('Para esta entrada aparecer em Perto, falta a cidade.');
  });

  it('tres faltas saem com virgula e `e` no ultimo', () => {
    expect(frasePendente(['city', 'state', 'phone_e164'])).toBe(
      'Para esta entrada aparecer em Perto, falta a cidade, a UF e o telefone.',
    );
  });
});
