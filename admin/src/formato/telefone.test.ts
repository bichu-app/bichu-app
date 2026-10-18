/**
 * A mascara e a conversao do telefone brasileiro.
 *
 * ## As iscas deste arquivo
 *
 * - **fixo de oito, celular de nove**, e a troca do corte acontece no nono
 *   digito e nao no fim da digitacao;
 * - **a mascara nao decide o que vai para a API**: `mascaraDeTelefone` nunca
 *   devolve E.164;
 * - **digito a mais e descartado**, e nao aceito para ser recusado no `salvar`;
 * - **`+55` nao e adivinhado**: um numero com `+` passa como esta, e um numero
 *   sem `+` ganha o prefixo do Brasil;
 * - **ida e volta**: `telefoneDoE164(telefoneEmE164(x))` reproduz a mascara;
 * - **vazio nao erra**, porque quem exige o campo e o formulario.
 */
import { describe, expect, it } from 'vitest';

import {
  erraAoSairDoTelefone,
  mascaraDeTelefone,
  telefoneDoE164,
  telefoneEmE164,
} from './telefone.ts';

describe('mascaraDeTelefone', () => {
  it('formata progressivamente, sem esperar o campo ficar completo', () => {
    expect(mascaraDeTelefone('1')).toBe('1');
    expect(mascaraDeTelefone('11')).toBe('11');
    expect(mascaraDeTelefone('113')).toBe('(11) 3');
    expect(mascaraDeTelefone('113061')).toBe('(11) 3061');
    expect(mascaraDeTelefone('11306122')).toBe('(11) 3061-22');
  });

  it('fixo de oito digitos corta em 4+4', () => {
    expect(mascaraDeTelefone('1130612200')).toBe('(11) 3061-2200');
  });

  it('celular de nove digitos corta em 5+4', () => {
    expect(mascaraDeTelefone('11987654321')).toBe('(11) 98765-4321');
  });

  it('descarta o digito a mais em vez de aceitar e recusar depois', () => {
    expect(mascaraDeTelefone('119876543219999')).toBe('(11) 98765-4321');
  });

  it('ignora o que a pessoa colou de formatacao', () => {
    expect(mascaraDeTelefone('+55 (11) 3061-2200')).toBe('+551130612200');
    expect(mascaraDeTelefone('11 3061 2200')).toBe('(11) 3061-2200');
  });

  it('um `+` na frente desliga a mascara: nao se reformata o que nao se sabe ler', () => {
    expect(mascaraDeTelefone('+351211234567')).toBe('+351211234567');
  });

  it('NUNCA devolve E.164 a partir de um numero nacional', () => {
    // Esta e a regra que impede o campo de corromper dado em silencio.
    expect(mascaraDeTelefone('1130612200').startsWith('+')).toBe(false);
  });
});

describe('telefoneEmE164', () => {
  it('poe o `+55` no numero nacional de oito e de nove digitos', () => {
    expect(telefoneEmE164('(11) 3061-2200')).toBe('+551130612200');
    expect(telefoneEmE164('(11) 98765-4321')).toBe('+5511987654321');
  });

  it('deixa passar o numero internacional sem mexer', () => {
    expect(telefoneEmE164('+351 21 123 4567')).toBe('+351211234567');
  });

  it('recusa devolvendo `null`, e nunca adivinha', () => {
    expect(telefoneEmE164('113061')).toBeNull();
    expect(telefoneEmE164('011306122')).toBeNull();
    expect(telefoneEmE164('abc')).toBeNull();
  });

  it('campo vazio e `null`: quem decide se era obrigatorio e o formulario', () => {
    expect(telefoneEmE164('')).toBeNull();
    expect(telefoneEmE164('   ')).toBeNull();
  });
});

describe('telefoneDoE164', () => {
  it('traz o numero brasileiro de volta na gramatica de quem le', () => {
    expect(telefoneDoE164('+551130612200')).toBe('(11) 3061-2200');
    expect(telefoneDoE164('+5511987654321')).toBe('(11) 98765-4321');
  });

  it('mostra o numero de fora do Brasil como esta', () => {
    expect(telefoneDoE164('+351211234567')).toBe('+351211234567');
  });

  it('nulo e ausente viram campo vazio', () => {
    expect(telefoneDoE164(null)).toBe('');
    expect(telefoneDoE164(undefined)).toBe('');
  });

  it('ida e volta reproduz a mascara', () => {
    const mascarado = mascaraDeTelefone('11987654321');
    expect(telefoneDoE164(telefoneEmE164(mascarado))).toBe(mascarado);
  });
});

describe('erraAoSairDoTelefone', () => {
  it('vazio nao erra', () => {
    expect(erraAoSairDoTelefone('')).toBe(false);
  });

  it('numero incompleto erra ao sair do campo', () => {
    expect(erraAoSairDoTelefone('(11) 3061')).toBe(true);
  });

  it('numero completo nao erra', () => {
    expect(erraAoSairDoTelefone('(11) 3061-2200')).toBe(false);
  });
});
