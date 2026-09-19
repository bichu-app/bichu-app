/**
 * Testes da identidade do artefato.
 *
 * O caso que importa aqui é negativo, e é a razão de o módulo existir: o resumo
 * precisa MUDAR quando o artefato muda. Um resumo constante passaria em
 * qualquer teste de "devolve 16 hexadecimais" e continuaria dizendo que dois
 * destinos rodam a mesma coisa quando eles rodam código diferente — que é
 * exatamente a afirmação sem prova que o QA reprovou no critério 12 de
 * BICHUS-13.
 *
 * Cada bloco abaixo tem a isca ao lado do caso feliz. Verificação que nunca
 * reprovou não é verificação.
 */
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
    // Esta é a asserção que a esteira faz entre os dois destinos. Se ela não
    // valesse, a comparação reprovaria sempre e viraria ruído até alguém
    // desligá-la.
    assert.equal(resumirArtefato(montarArtefato()), resumirArtefato(montarArtefato()));
  });

  void it('tem 16 dígitos hexadecimais', () => {
    assert.match(resumirArtefato(montarArtefato()), /^[0-9a-f]{16}$/);
  });

  // ISCA: um byte trocado no código compilado.
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

  // ISCA: o contrato entra no resumo. Ele é lido na subida por
  // `carregarContrato`, e dois destinos com contratos diferentes servem
  // superfícies diferentes com o mesmo código.
  void it('MUDA quando o contrato muda', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    writeFileSync(join(raiz, 'api', 'openapi.yaml'), 'openapi: 3.1.0\ninfo: {}\n');
    assert.notEqual(resumirArtefato(raiz), antes, 'o resumo não enxergou a troca do contrato');
  });

  // ISCA: só o conteúdo não basta. Sem o caminho no resumo, renomear um
  // arquivo — trocar qual processo é qual — passaria batido.
  void it('MUDA quando um arquivo é renomeado sem mudar um byte', () => {
    const raiz = montarArtefato();
    const antes = resumirArtefato(raiz);
    renameSync(join(raiz, 'dist', 'bin', 'api.js'), join(raiz, 'dist', 'bin', 'outro.js'));
    assert.notEqual(resumirArtefato(raiz), antes, 'o resumo ignorou o nome dos arquivos');
  });

  void it('ignora diretório de rascunho dentro de dist, que só existe fora da imagem', () => {
    // `_tests` é a saída de `npm test`; `_probe` apareceu nesta máquina sem que
    // nenhum script do repositório o gerasse. Os dois mudavam o resumo na raiz
    // do repositório e não existiam dentro da imagem.
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

  // ISCA da outra direção: a regra do `_` não pode engolir código de verdade.
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

  // ISCA: valor com forma errada precisa derrubar a subida com o nome da
  // variável na mensagem. Deixá-lo passar faria a comparação entre destinos
  // comparar duas frases.
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
