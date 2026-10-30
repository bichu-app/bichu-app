/** Testes da identidade do artefato. */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ArtefatoIlegivel,
  lerCommitDeclarado,
  resumirArtefato,
} from './identidade-do-artefato.js';

const temporarios: string[] = [];

/** Artefato mínimo em disco, com a mesma forma do que existe dentro da imagem. */
function montarArtefato(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'bichu-artefato-'));
  temporarios.push(raiz);
  mkdirSync(join(raiz, 'dist', 'bin'), { recursive: true });
  mkdirSync(join(raiz, 'api'), { recursive: true });
  writeFileSync(join(raiz, 'dist', 'bin', 'api.js'), 'console.log(1);\n');
  writeFileSync(join(raiz, 'dist', 'bin', 'worker.js'), 'console.log(2);\n');
  writeFileSync(join(raiz, 'api', 'openapi.yaml'), 'openapi: 3.1.0\n');
  writeFileSync(join(raiz, 'package.json'), '{"name":"bichu","version":"0.1.0"}\n');
  return raiz;
}

afterEach(() => {
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
});

void describe('resumo do artefato', () => {
  void it('é o mesmo para dois artefatos com o mesmo conteúdo', () => {
    assert.equal(resumirArtefato(montarArtefato()), resumirArtefato(montarArtefato()));
  });

  void it('tem 16 dígitos hexadecimais', () => {
    assert.match(resumirArtefato(montarArtefato()), /^[0-9a-f]{16}$/);
  });

  void it('MUDA quando um byte do código compilado muda', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    writeFileSync(join(raiz, 'dist', 'bin', 'api.js'), 'console.log(3);\n');
    assert.notEqual(
      resumirArtefato(raiz),
      antes,
      'o resumo não enxergou uma mudança no código que está rodando',
    );
  });

  void it('MUDA quando o contrato muda', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    writeFileSync(join(raiz, 'api', 'openapi.yaml'), 'openapi: 3.1.0\ninfo: {}\n');
    assert.notEqual(resumirArtefato(raiz), antes, 'o resumo não enxergou a troca do contrato');
  });

  void it('MUDA quando um arquivo é renomeado sem mudar um byte', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    renameSync(join(raiz, 'dist', 'bin', 'api.js'), join(raiz, 'dist', 'bin', 'outro.js'));
    assert.notEqual(resumirArtefato(raiz), antes, 'o resumo ignorou o nome dos arquivos');
  });

  void it('ignora diretório de rascunho dentro de dist, que só existe fora da imagem', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    for (const rascunho of ['_tests', '_probe']) {
      mkdirSync(join(raiz, 'dist', rascunho, 'src'), { recursive: true });
      writeFileSync(join(raiz, 'dist', rascunho, 'src', 'algo.js'), 'console.log(9);\n');
    }
    assert.equal(
      resumirArtefato(raiz),
      antes,
      'saída de rascunho fora do container mudaria a identidade do artefato',
    );
  });

  void it('NÃO ignora um diretório comum dentro de dist', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    mkdirSync(join(raiz, 'dist', 'modules'), { recursive: true });
    writeFileSync(join(raiz, 'dist', 'modules', 'pets.js'), 'console.log(4);\n');
    assert.notEqual(resumirArtefato(raiz), antes, 'o resumo deixou de enxergar um módulo');
  });

  void it('reprova quando o contrato não está no lugar', () => {
    const raiz = montarArtefato();
    rmSync(join(raiz, 'api', 'openapi.yaml'));
    assert.throws(() => resumirArtefato(raiz), ArtefatoIlegivel);
  });

  void it('reprova quando não há nada para resumir, em vez de devolver um resumo vazio', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'bichu-artefato-vazio-'));
    temporarios.push(raiz);
    assert.throws(() => resumirArtefato(raiz), ArtefatoIlegivel);
  });
});

void describe('commit declarado', () => {
  void it('é null quando ninguém declarou', () => {
    assert.equal(lerCommitDeclarado(() => undefined), null);
  });

  void it('aceita um sha completo e um abreviado', () => {
    assert.equal(lerCommitDeclarado(() => '1a4a3f7'), '1a4a3f7');
    assert.equal(
      lerCommitDeclarado(() => '1a4a3f70c4e5e31a3297fdabf18aebdcaa426886'),
      '1a4a3f70c4e5e31a3297fdabf18aebdcaa426886',
    );
  });

  void it('REPROVA um valor que não é um commit, nomeando a variável', () => {
    assert.throws(
      () => lerCommitDeclarado(() => 'ultimo'),
      (erro: unknown) =>
        erro instanceof ArtefatoIlegivel && erro.message.includes('BUILD_COMMIT'),
    );
  });

  void it('REPROVA um sha curto demais para identificar qualquer coisa', () => {
    assert.throws(() => lerCommitDeclarado(() => '1a4'), ArtefatoIlegivel);
  });
});
