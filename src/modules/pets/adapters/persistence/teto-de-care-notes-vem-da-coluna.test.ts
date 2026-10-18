/**
 * `TETO_DE_CARE_NOTES` é o `CHECK` da coluna, lido do disco.
 *
 * Esta isca é a ÂNCORA de `application/pet-service.test.ts`. Os casos de lá
 * medem comportamento — nota no teto com telefone dentro sai 400 e não 500 — e
 * usam `TETO_DE_CARE_NOTES` como teto. Quem garante que esse número é o da
 * coluna é este arquivo, e ele mora em `adapters/persistence/` por duas razões:
 * a restrição é um fato de persistência, e `application/` não pode importar
 * `node:fs` (pureza do domínio, `eslint.config.mjs`).
 *
 * **Por que a coluna e não o contrato.** Medido em 18/10/2026: isca que lê o
 * `maxLength` de `api/openapi.yaml` ACOMPANHA quem o sabota — sobe o contrato
 * para 320 e a isca passa a aprovar 320, que é exatamente o número que o
 * `CHECK` recusa. Ancorada na coluna, a sabotagem do contrato reprova.
 *
 * **O defeito que a corrente inteira existe para impedir.** A redação de canal
 * mediado roda DEPOIS da validação do schema e CRESCE o texto:
 * `[telefone removido]` tem 19 caracteres e substitui os 11 de um celular.
 * Nota de 280 com telefone dentro sai da redação com 288, e sem conferência
 * pós-redação é o `CHECK` que recusa — como erro de servidor.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { TETO_DE_CARE_NOTES } from '../../application/pet-service.js';

/**
 * O `<= n` de `pets_care_notes_tamanho`, procurado em TODA migração em vez de
 * num nome de arquivo fixo: migração renomeada derruba a leitura por caminho, e
 * derrubar é o certo — aprovar por ausência de dado é o defeito desta isca.
 */
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
