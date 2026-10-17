import { describe, expect, it } from 'vitest';

import { ERRO_AO_SAIR_DO_EMAIL, emailParaEnvio, emailPlausivel, erraAoSairDoCampo } from '../../src/formato/email.ts';

/** ESCRITO E NAO RODADO (regra do cliente nesta tarefa). */

describe('e-mail: apara espaco e NAO abaixa a caixa', () => {
  it('apara espaco em volta, incluindo tabulacao e quebra de linha de colagem', () => {
    expect(emailParaEnvio('  leandro@tecla.test  ')).toBe('leandro@tecla.test');
    expect(emailParaEnvio('\tleandro@tecla.test\n')).toBe('leandro@tecla.test');
  });

  it('ISCA: a caixa que a pessoa escreveu CHEGA INTEIRA no contrato', () => {
    // Quem normaliza e `normalizarEmail` em
    // `src/modules/identity/domain/email.ts` (trim + toLowerCase), e ele
    // normaliza antes de conferir e antes de gravar. Uma segunda normalizacao
    // aqui criaria duas definicoes do mesmo endereco. Se este caso reprovar,
    // alguem pos `toLowerCase()` no cliente.
    expect(emailParaEnvio('Leandro@Tecla.Test')).toBe('Leandro@Tecla.Test');
    expect(emailParaEnvio(' A.B+etiqueta@Exemplo.COM ')).toBe('A.B+etiqueta@Exemplo.COM');
  });
});

describe('e-mail: conferencia tolerante, sem mascara', () => {
  it.each(['leandro@tecla.test', 'a.b+etiqueta@exemplo.com.br', 'x@y.co', "o'brien@exemplo.test", 'muito_estranho-mas+valido@a.b.c.test'])(
    '"%s" e plausivel',
    (endereco) => {
      expect(emailPlausivel(endereco)).toBe(true);
    },
  );

  it.each(['', '   ', 'leandro', '@tecla.test', 'leandro@', 'leandro@tecla', 'leandro@.test', 'leandro.tecla@x'])('"%s" nao e plausivel', (endereco) => {
    expect(emailPlausivel(endereco)).toBe(false);
  });
});

describe('e-mail: a conferencia ao sair do campo', () => {
  it('campo VAZIO nao erra ao sair: quem tocou e desistiu nao levou erro', () => {
    expect(erraAoSairDoCampo('')).toBe(false);
    expect(erraAoSairDoCampo('   ')).toBe(false);
  });

  it('campo escrito e implausivel erra ao sair', () => {
    expect(erraAoSairDoCampo('leandro')).toBe(true);
    expect(erraAoSairDoCampo('leandro@tecla')).toBe(true);
  });

  it('campo plausivel nao erra, mesmo com espaco de colagem', () => {
    expect(erraAoSairDoCampo(' leandro@tecla.test ')).toBe(false);
  });

  it('a mensagem e UMA LINHA (o cliente reprovou texto excessivo em tela)', () => {
    expect(ERRO_AO_SAIR_DO_EMAIL).toBe('Confira o e-mail.');
    expect(ERRO_AO_SAIR_DO_EMAIL).not.toContain('\n');
    expect(ERRO_AO_SAIR_DO_EMAIL.length).toBeLessThan(40);
  });
});
