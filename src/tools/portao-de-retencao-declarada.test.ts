import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  arquivosDoProduto,
  autoTeste,
  celulasDePrazo,
  conferirExpurgos,
  conferirPolitica,
  EXPURGOS_DECLARADOS,
  expurgosPorPrazoEm,
  lerDaRaiz,
  naoAcentuado,
  politicaReal,
  POLITICA,
  semComentarios,
} from './portao-de-retencao-declarada.js';

void describe('portao da retencao declarada (ADR-0010 emenda 6)', () => {
  void it('as iscas reprovam, e a celula boa nao e acusada', () => {
    assert.deepEqual(autoTeste(), []);
  });

  void it('a politica publicada nao diz prazo de guarda vago', () => {
    const conteudo = politicaReal(process.cwd());
    assert.ok(
      conteudo !== undefined,
      `${POLITICA} nao foi encontrada: sem o arquivo este portao nao mede nada`,
    );
    const { vagas, conferidas } = conferirPolitica(conteudo);
    assert.ok(
      conferidas >= 30,
      `so ${String(conferidas)} celulas de prazo foram encontradas; a politica tinha 32 em 26/10`,
    );
    assert.deepEqual(
      vagas,
      [],
      `prazo de guarda vago voltou a politica publicada: ${JSON.stringify(vagas)}`,
    );
  });

  void it('nao ha expurgo por prazo em src/ sem decisao escrita que resolva', () => {
    const raiz = process.cwd();
    const arquivos = arquivosDoProduto(raiz);
    assert.ok(arquivos.length >= 200, `so ${String(arquivos.length)} arquivos varridos em src/`);

    const v = conferirExpurgos(arquivos, EXPURGOS_DECLARADOS, lerDaRaiz(raiz));

    assert.deepEqual(
      v.semDecisao,
      [],
      `expurgo por prazo sobre tabela nao declarada: ${JSON.stringify(v.semDecisao)}`,
    );
    assert.deepEqual(
      v.decisaoQueNaoResolve,
      [],
      `expurgo declarado cuja decisao escrita nao resolve: ${JSON.stringify(v.decisaoQueNaoResolve)}`,
    );
    assert.deepEqual(
      v.declaradoSemCodigo,
      [],
      `declarado em EXPURGOS_DECLARADOS e sem expurgo em src/: ${JSON.stringify(v.declaradoSemCodigo)}`,
    );
    assert.equal(v.achados, EXPURGOS_DECLARADOS.length);
  });

  void it('a coluna de prazo e lida pelo cabecalho, e nao herdada entre tabelas', () => {
    const md = [
      '| A | Por quanto tempo |',
      '|---|---|',
      '| x | enquanto a conta existir |',
      '',
      '| Por quanto tempo | B |',
      '|---|---|',
      '| 24 meses | y |',
    ].join('\n');
    assert.deepEqual(
      celulasDePrazo(md).map((c) => c.texto),
      ['enquanto a conta existir', '24 meses'],
    );
  });

  void it('comentario que fala de expurgo nao e acusado; o comando e', () => {
    const comentario = "// apaga o que passou de occurred_at < limite\nexport const a = 1;";
    assert.deepEqual(expurgosPorPrazoEm('f.ts', comentario), []);
    const comando = "db.deleteFrom('coisas').where('expires_at', '<=', agora).execute();";
    assert.deepEqual(expurgosPorPrazoEm('f.ts', comando), [{ onde: 'f.ts', tabela: 'coisas' }]);
  });

  void it('naoAcentuado casa a lacuna com e sem acento, e sem caixa', () => {
    assert.equal(naoAcentuado('Ainda  Não   Definido'), 'ainda nao definido');
  });

  void it('semComentarios tira os tres tipos e deixa o resto', () => {
    assert.equal(semComentarios('a // x\nb /* y */ c\n-- z\nd'), 'a \nb  c\n\nd');
  });
});
