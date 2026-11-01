import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { TETO_DE_CARE_NOTES } from '../../application/pet-service.js';

function tetoDaColuna(): number {
  const pasta = resolve(process.cwd(), 'migrations');
  const achados: { arquivo: string; teto: number }[] = [];
  for (const arquivo of readdirSync(pasta).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(resolve(pasta, arquivo), 'utf8');
    const m = /char_length\(care_notes\)\s*<=\s*(\d+)/.exec(sql);
    if (m) achados.push({ arquivo, teto: Number(m[1]) });
  }
  assert.equal(
    achados.length,
    1,
    'não achei exatamente um `CHECK ... char_length(care_notes) <= n` em `migrations/` ' +
      `(achei ${String(achados.length)}). Sem ele esta isca não sabe qual é o teto da ` +
      'coluna, e aprovar sem saber é o que ela existe para impedir',
  );
  return achados[0]!.teto;
}

void describe('o teto de `care_notes` do serviço é o `CHECK` da coluna', () => {
  void it('a migração declara `char_length(care_notes) <= 280`', () => {
    assert.equal(tetoDaColuna(), 280);
  });

  void it('`TETO_DE_CARE_NOTES` é exatamente esse número', () => {
    assert.equal(
      TETO_DE_CARE_NOTES,
      tetoDaColuna(),
      '`TETO_DE_CARE_NOTES` divergiu de `pets_care_notes_tamanho`. ACIMA do teto da coluna o ' +
        'serviço aceita e o banco derruba como erro de servidor, que é o defeito consertado ' +
        'em 18/10/2026; ABAIXO dele o serviço recusa nota que a coluna aceitaria, e o texto ' +
        'da pessoa é rejeitado sem motivo',
    );
  });
});
