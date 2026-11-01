import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const api = readFileSync('src/bin/api.ts', 'utf8');

function blocoDaVitrine(): string {
  const inicio = api.indexOf('new VitrineDeFotos({');
  assert.ok(
    inicio > 0,
    '`new VitrineDeFotos({` nao esta em `src/bin/api.ts`. Se a construcao mudou de ' +
      'forma, este portao precisa acompanhar em vez de passar por nao achar nada.',
  );
  const fim = api.indexOf('\n    }),', inicio);
  assert.ok(fim > inicio, 'nao achei o fecho do construtor da vitrine');
  return api.slice(inicio, fim);
}

void describe('a vitrine de fotos esta ligada ao registrador de intencao dela (api.ts)', () => {
  void it('ISCA: o bloco da vitrine usa `registrarIntencaoDaVitrineDoUsuario`', () => {
    assert.match(
      blocoDaVitrine(),
      /registrarIntencao:\s*registrarIntencaoDaVitrineDoUsuario\b/,
      'a vitrine precisa gravar a intencao com `purpose = user_showcase`. Com outro ' +
        'registrador, `POST /v1/me/showcase/photo-intents` devolve 201 e ' +
        '`PUT /v1/me/showcase` devolve 404 para a mesma `upload_id` -- o defeito que o ' +
        'cliente relatou em 18/10/2026 como "subir a foto esta dando erro".',
    );
  });

  void it('ISCA: o bloco da vitrine NAO usa o registrador da capa do encontro', () => {
    assert.ok(
      !/registrarIntencao:\s*registrarIntencaoDeCapaDaComunidade\b/.test(blocoDaVitrine()),
      'o registrador da capa do encontro grava `purpose = network_event` literal. Na ' +
        'vitrine ele produz uma intencao que a confirmacao nunca acha, e o efeito nao ' +
        'e uma foto errada: e nenhuma foto salva.',
    );
  });
});
