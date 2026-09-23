#!/usr/bin/env node
/**
 * Gera `admin/src/api/generated/api.ts` a partir de `api/openapi.yaml`.
 *
 * E a mesma ferramenta e a mesma configuracao do backend (`npm run
 * generate:types` na raiz, que escreve `src/shared/types/generated/api.ts`):
 * `openapi-typescript` com os padroes. Aqui ela e chamada pela API de Node e nao
 * pela linha de comando so para que gerar e verificar passem pelo mesmo codigo.
 *
 * Uso, de dentro de `admin/`:
 *
 *   node scripts/gerar-tipos-da-api.mjs              escreve os tipos
 *   node scripts/gerar-tipos-da-api.mjs --verificar  so compara; saida 1 se divergir
 *
 * O arquivo gerado e versionado de proposito: o build (`npm run build`) nao le
 * nada fora de `admin/`, entao a imagem do backoffice pode ser construida com
 * `admin/` como contexto.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FONTE = path.resolve(AQUI, '../../api/openapi.yaml');
const DESTINO = path.resolve(AQUI, '../src/api/generated/api.ts');

async function gerar() {
  if (!existsSync(FONTE)) throw new Error(`contrato nao encontrado: ${FONTE}`);
  const ast = await openapiTS(pathToFileURL(FONTE), { silent: true });
  const texto = `${COMMENT_HEADER}${astToString(ast)}`;
  if (!texto.includes('export interface paths')) {
    throw new Error('a geracao nao produziu `paths`; o contrato mudou de forma ou a ferramenta falhou.');
  }
  return texto;
}

async function principal(argv) {
  const gerado = await gerar();
  const relativo = path.relative(process.cwd(), DESTINO);
  if (!argv.includes('--verificar')) {
    mkdirSync(path.dirname(DESTINO), { recursive: true });
    writeFileSync(DESTINO, gerado);
    process.stdout.write(`escrito ${relativo}\n`);
    return 0;
  }
  const emDisco = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : null;
  if (emDisco !== gerado) {
    process.stderr.write(
      `REPROVADO: ${relativo} ${emDisco === null ? 'nao existe' : 'divergiu de api/openapi.yaml'}. ` +
        'Rode `npm run generate:api` de dentro de admin/ e versione o resultado.\n',
    );
    return 1;
  }
  process.stdout.write(`ok: ${relativo} bate com api/openapi.yaml\n`);
  return 0;
}

try {
  process.exitCode = await principal(process.argv.slice(2));
} catch (erro) {
  process.stderr.write(`REPROVADO: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
