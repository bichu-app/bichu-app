#!/usr/bin/env node
/**
 * Gera, a partir de `api/openapi.yaml`, os dois derivados do contrato que o
 * site usa, e nenhum outro tipo de resposta existe escrito a mao em `web/`:
 *
 *   web/src/api/generated/api.ts               paths, operations e schemas (openapi-typescript)
 *   web/src/api/generated/tipos-de-problema.ts  a lista fechada `x-problem-types`, slug e status
 *
 * Mesma ferramenta e mesma configuracao do backend (`npm run generate:types` na
 * raiz) e do backoffice (`admin/scripts/gerar-tipos-da-api.mjs`): openapi-typescript
 * com os padroes, chamada pela API de Node para que gerar e verificar passem
 * pelo mesmo codigo.
 *
 * Uso, de dentro de `web/`:
 *
 *   node scripts/gerar-tipos-da-api.mjs              escreve os dois arquivos
 *   node scripts/gerar-tipos-da-api.mjs --verificar  so compara; saida 1 se algum divergir
 *   node scripts/gerar-tipos-da-api.mjs --verificar --contrato <outro.yaml>
 *                                                    a mesma pergunta contra outro contrato (a isca)
 *
 * Os gerados sao versionados de proposito: o build nao le nada fora de `web/`,
 * entao a imagem do site se constroi com `web/` como contexto (ADR-0028, item 9).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { parse } from 'yaml';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
}

const FONTE = path.resolve(argumento('--contrato') ?? path.resolve(WEB, '../api/openapi.yaml'));
const DESTINO_API = path.resolve(WEB, 'src/api/generated/api.ts');
const DESTINO_PROBLEMAS = path.resolve(WEB, 'src/api/generated/tipos-de-problema.ts');

async function gerarApi() {
  const ast = await openapiTS(pathToFileURL(FONTE), { silent: true });
  const texto = `${COMMENT_HEADER}${astToString(ast)}`;
  if (!texto.includes('export interface paths')) {
    throw new Error('a geracao nao produziu `paths`; o contrato mudou de forma ou a ferramenta falhou.');
  }
  return texto;
}

function gerarProblemas() {
  const contrato = parse(readFileSync(FONTE, 'utf8'));
  const lista = contrato['x-problem-types'];
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('o contrato nao tem `x-problem-types`; sem a lista fechada, a tela nao tem como decidir por `type`.');
  }
  const linhas = lista.map((p) => {
    if (typeof p.slug !== 'string' || typeof p.status !== 'number') {
      throw new Error(`entrada de x-problem-types sem slug ou status: ${JSON.stringify(p)}`);
    }
    return `  ${JSON.stringify(p.slug)}: ${p.status},`;
  });
  return [
    '// GERADO por web/scripts/gerar-tipos-da-api.mjs a partir de `x-problem-types` de',
    '// api/openapi.yaml. NAO EDITE: rode `npm run generate:api` de dentro de web/.',
    '//',
    '// A tela decide por `type` (o slug depois de /problems/), nunca pelo texto e nunca',
    '// so pelo status. Esta e a lista fechada, com o unico status de cada tipo.',
    'export const TIPOS_DE_PROBLEMA = {',
    ...linhas,
    '} as const;',
    '',
    'export type TipoDeProblema = keyof typeof TIPOS_DE_PROBLEMA;',
    '',
  ].join('\n');
}

async function principal(argv) {
  if (!existsSync(FONTE)) throw new Error(`contrato nao encontrado: ${FONTE}`);
  const saidas = [
    [DESTINO_API, await gerarApi()],
    [DESTINO_PROBLEMAS, gerarProblemas()],
  ];
  if (!argv.includes('--verificar')) {
    for (const [destino, texto] of saidas) {
      mkdirSync(path.dirname(destino), { recursive: true });
      writeFileSync(destino, texto);
      process.stdout.write(`escrito ${path.relative(WEB, destino)}\n`);
    }
    return 0;
  }
  let falhas = 0;
  for (const [destino, texto] of saidas) {
    const rel = `web/${path.relative(WEB, destino)}`;
    const emDisco = existsSync(destino) ? readFileSync(destino, 'utf8') : null;
    if (emDisco !== texto) {
      process.stderr.write(
        `REPROVADO: ${rel} ${emDisco === null ? 'nao existe' : 'divergiu de api/openapi.yaml'}. ` +
          'Rode `npm run generate:api` de dentro de web/ e versione o resultado.\n',
      );
      falhas += 1;
    } else {
      process.stdout.write(`ok: ${rel} bate com api/openapi.yaml\n`);
    }
  }
  return falhas ? 1 : 0;
}

try {
  process.exitCode = await principal(process.argv.slice(2));
} catch (erro) {
  process.stderr.write(`REPROVADO: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
