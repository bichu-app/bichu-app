/**
 * A leitura do formulário de contato do achador (decisão do cliente, 03/11/2026).
 *
 * Estas são as regras que decidem se dado pessoal de alguém SEM CONTA sai para um
 * terceiro, e por isso elas são medidas aqui, uma a uma, e não só pela ponta do
 * e2e — ali cada caso custa um navegador, e aqui custa um milissegundo.
 *
 *   cd web && npm run test:unidade
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  lerContatoDoAchador,
  telefoneEmE164,
  type CamposDoContato,
} from '../../src/dominio/contato-do-achador.ts';

const VERSAO = '2026-11-03';

/** Um `FormData` com só o que o caso quer dizer. */
function formulario(campos: Partial<Record<string, string>>): FormData {
  const f = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor !== undefined) f.set(chave, valor);
  }
  return f;
}

void describe('o telefone que a pessoa digita vira o E.164 que o contrato exige', () => {
  void it('aceita a pontuação que gente de verdade usa', () => {
    for (const digitado of [
      '11912345678',
      '11 91234-5678',
      '(11) 91234-5678',
      '(11)91234.5678',
      '+55 11 91234-5678',
      '5511912345678',
      ' 11 9 1234 5678 ',
    ]) {
      assert.equal(telefoneEmE164(digitado), '+5511912345678', digitado);
    }
  });

  void it('aceita fixo de 10 dígitos, que é quem atende em clínica e em casa', () => {
    assert.equal(telefoneEmE164('(11) 3061-2200'), '+551130612200');
  });

  void it('recusa o que não dá número discável, em vez de mandar lixo', () => {
    for (const ruim of ['', '11', '9123', '119123456', '11912345678901234', 'telefone', '+1 555 0100']) {
      assert.equal(telefoneEmE164(ruim), undefined, ruim);
    }
  });
});

void describe('sem o ato de consentir, o contato não sai', () => {
  void it('telefone sozinho é RECUSADO, e nada é montado para enviar', () => {
    const lido = lerContatoDoAchador(formulario({ telefone: '11912345678' }), VERSAO);
    assert.deepEqual([...lido.erros], ['consentimento']);
    assert.equal(lido.enriquecimento, null);
    assert.equal(lido.divulgaContato, false);
  });

  void it('e-mail sozinho também é recusado: esta tela não usa a brecha do servidor', () => {
    // O servidor aceita `email` sem consentimento, porque lá ele tem finalidade
    // própria e antiga. Esta tela pede o e-mail DENTRO de "quer que o tutor fale
    // com você?", e guardá-lo sem o consentimento seria coletar sob um pretexto
    // e usar sob outro.
    const lido = lerContatoDoAchador(formulario({ email: 'ana@exemplo.invalid' }), VERSAO);
    assert.deepEqual([...lido.erros], ['consentimento']);
    assert.equal(lido.enriquecimento, null);
  });

  void it('nome e recado passam sem consentimento: eles já chegavam ao tutor antes desta decisão', () => {
    const lido = lerContatoDoAchador(
      formulario({ nome: 'Ana Paula', recado: 'Está comigo, bem.' }),
      VERSAO,
    );
    assert.deepEqual([...lido.erros], []);
    assert.equal(lido.divulgaContato, false);
    // E nada de `share_consent`: sem ato, não há o que provar. A asserção é
    // sobre o OBJETO INTEIRO de propósito — comparar só os campos presentes
    // deixaria passar um `share_consent` que aparecesse aqui por acidente.
    assert.deepEqual(lido.enriquecimento, {
      message: 'Está comigo, bem.',
      finder_contact: { display_name: 'Ana Paula' },
    });
  });

  void it('formulário vazio não monta nada: o caminho de um toque continua sendo um toque', () => {
    const lido = lerContatoDoAchador(formulario({}), VERSAO);
    assert.deepEqual([...lido.erros], []);
    assert.equal(lido.enriquecimento, null);
  });

  void it('`null` (corpo ilegível) não vira consentimento', () => {
    const lido = lerContatoDoAchador(null, VERSAO);
    assert.equal(lido.campos.consentiu, false);
    assert.equal(lido.enriquecimento, null);
  });
});

void describe('com o ato de consentir, o contato sai — e leva a prova', () => {
  void it('nome, e-mail, telefone e a versão do texto exibido', () => {
    const lido = lerContatoDoAchador(
      formulario({
        nome: 'Ana Paula',
        email: 'ana@exemplo.invalid',
        telefone: '(11) 91234-5678',
        recado: 'Está comigo.',
        consentimento: '1',
      }),
      VERSAO,
    );
    assert.deepEqual([...lido.erros], []);
    assert.equal(lido.divulgaContato, true);
    assert.deepEqual(lido.enriquecimento, {
      message: 'Está comigo.',
      finder_contact: {
        display_name: 'Ana Paula',
        email: 'ana@exemplo.invalid',
        phone_e164: '+5511912345678',
        share_consent: { accepted: true, consent_version: VERSAO },
      },
    });
  });

  void it('só e-mail, ou só telefone, já bastam', () => {
    const comEmail = lerContatoDoAchador(
      formulario({ email: 'ana@exemplo.invalid', consentimento: '1' }),
      VERSAO,
    );
    assert.deepEqual([...comEmail.erros], []);
    assert.equal(comEmail.enriquecimento?.finder_contact?.phone_e164, undefined);

    const comTelefone = lerContatoDoAchador(
      formulario({ telefone: '11912345678', consentimento: '1' }),
      VERSAO,
    );
    assert.deepEqual([...comTelefone.erros], []);
    assert.equal(comTelefone.enriquecimento?.finder_contact?.email, undefined);
    assert.equal(comTelefone.enriquecimento?.finder_contact?.phone_e164, '+5511912345678');
  });

  void it('consentir em compartilhar NADA é recusado: registro sem objeto não é consentimento', () => {
    const lido = lerContatoDoAchador(formulario({ nome: 'Ana', consentimento: '1' }), VERSAO);
    assert.deepEqual([...lido.erros], ['contato-vazio']);
    assert.equal(lido.enriquecimento, null);
  });

  void it('telefone que não normaliza recusa ANTES de o aviso existir, e não divulga', () => {
    const lido = lerContatoDoAchador(
      formulario({ telefone: '9123', consentimento: '1' }),
      VERSAO,
    );
    assert.ok(lido.erros.includes('telefone'), [...lido.erros].join(','));
    assert.equal(lido.enriquecimento, null);
    assert.equal(lido.divulgaContato, false);
  });

  void it('a versão vai como a tela a recebeu: é ela que o servidor resolve para o texto', () => {
    const lido = lerContatoDoAchador(
      formulario({ telefone: '11912345678', consentimento: '1' }),
      '2027-01-01',
    );
    assert.equal(lido.enriquecimento?.finder_contact?.share_consent?.consent_version, '2027-01-01');
  });
});

void describe('o que a tela devolve para a pessoa depois de uma recusa', () => {
  void it('volta o que ela digitou, sem espaço nas pontas, para não redigitar', () => {
    const lido = lerContatoDoAchador(
      formulario({ nome: '  Ana Paula  ', telefone: ' 9123 ', recado: '  oi  ' }),
      VERSAO,
    );
    const esperado: CamposDoContato = {
      nome: 'Ana Paula',
      email: '',
      telefone: '9123',
      recado: 'oi',
      consentiu: false,
    };
    assert.deepEqual(lido.campos, esperado);
  });

  void it('o nome é cortado no teto do contrato (60), e não recusado', () => {
    const lido = lerContatoDoAchador(formulario({ nome: 'A'.repeat(200) }), VERSAO);
    assert.equal(lido.campos.nome.length, 60);
    assert.equal(lido.enriquecimento?.finder_contact?.display_name?.length, 60);
  });

  void it('o recado é cortado no teto do contrato (1000)', () => {
    const lido = lerContatoDoAchador(formulario({ recado: 'a'.repeat(2000) }), VERSAO);
    assert.equal(lido.campos.recado.length, 1000);
  });
});
