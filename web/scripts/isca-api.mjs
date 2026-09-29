#!/usr/bin/env node
// A isca do `verify:api` do site.
//
// Duas copias alteradas de api/openapi.yaml, e o verificador PRECISA reprovar
// com cada uma, nomeando o arquivo gerado que ficou para tras:
//
//   1. um campo novo em `TagResolution.pet` (o schema que a pagina /t/ le)
//      -> web/src/api/generated/api.ts
//   2. um tipo novo em `x-problem-types`
//      -> web/src/api/generated/tipos-de-problema.ts
//
// Se qualquer uma aprovar, o portao parou de verificar e este script sai 1.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATO = resolve(AQUI, '../../api/openapi.yaml');
const GERADOR = resolve(AQUI, 'gerar-tipos-da-api.mjs');
const original = readFileSync(CONTRATO, 'utf8');

const iscas = [
  {
    nome: 'campo novo em TagResolution.pet',
    alvo: 'web/src/api/generated/api.ts',
    trocar: (t) => {
      const ancora = '            display_name: { type: string }\n            species:';
      if (!t.includes(ancora)) return null;
      return t.replace(ancora, '            display_name: { type: string }\n            isca_do_verify_api: { type: string }\n            species:');
    },
  },
  {
    nome: 'tipo novo em x-problem-types',
    alvo: 'web/src/api/generated/tipos-de-problema.ts',
    trocar: (t) => {
      const ancora = '  - { slug: internal,                      status: 500 }';
      if (!t.includes(ancora)) return null;
      return t.replace(ancora, `${ancora}\n  - { slug: isca-do-verify-api, status: 418 }`);
    },
  },
];

let falhas = 0;
const dir = mkdtempSync(join(tmpdir(), 'isca-api-'));
try {
  for (const isca of iscas) {
    const alterado = isca.trocar(original);
    if (alterado === null) {
      console.error(`ERRO: a isca "${isca.nome}" nao achou a ancora no contrato. Isca que nao isca nao prova nada.`);
      falhas += 1;
      continue;
    }
    const copia = join(dir, 'openapi.yaml');
    writeFileSync(copia, alterado);
    let saiu = 0;
    let erro = '';
    try {
      execFileSync(process.execPath, [GERADOR, '--verificar', '--contrato', copia], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      saiu = e.status;
      erro = String(e.stderr);
    }
    if (saiu !== 1 || !erro.includes(isca.alvo)) {
      console.error(`ERRO: com "${isca.nome}", o verify:api saiu ${saiu} e ${erro.includes(isca.alvo) ? '' : 'NAO '}nomeou ${isca.alvo}. O portao parou de verificar.`);
      falhas += 1;
    } else {
      console.log(`isca "${isca.nome}" reprovada pelo motivo certo (${isca.alvo}).`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
