/**
 * Critério 2 da BICHUS-178: *"teste ou portão que tenta registrar uma rota
 * contornando a aplicação e reprova se conseguir"*.
 *
 * Três casos, e os três precisam existir juntos:
 *
 * 1. a árvore real de `src/` não tem nenhuma chamada direta ao framework;
 * 2. **ISCA** — um arquivo que contorna é encontrado. Sem este caso, o item 1
 *    passaria igual com uma expressão regular que não casa com nada;
 * 3. **controle negativo** — uma chamada dentro de comentário NÃO é achado.
 *    Ele existe porque `registrar-rota.ts` e `aplicacao-de-teto.ts` citam
 *    `app.post(` em prosa, explicando o defeito; um portão que reprovasse por
 *    isso obrigaria a apagar a explicação para o código passar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lerArvore, varrerRegistroDireto } from './portao-de-registro-de-rota.js';

void describe('portão do registro de rota', () => {
  void it('a árvore de src/ registra tudo por registrarRota', () => {
    const arquivos = lerArvore('src');

    // Verificação que não consegue verificar REPROVA: uma varredura que não
    // achou arquivo nenhum passaria com zero achados, e zero achados é o
    // resultado que ela produz quando está funcionando.
    assert.ok(
      arquivos.length > 50,
      `varreu ${String(arquivos.length)} arquivos de src/, o que é pouco demais para ser a árvore inteira`,
    );

    const achados = varrerRegistroDireto(arquivos);
    assert.deepEqual(
      achados,
      [],
      'há registro de rota fora de `registrarRota`:\n' +
        achados.map((a) => `  ${a.caminho}:${String(a.linha)}  ${a.trecho}`).join('\n'),
    );
  });

  void it('ISCA: o arquivo que contorna o registro é encontrado', () => {
    const contorno = {
      caminho: 'src/modules/inventado/adapters/http/rota-clandestina.ts',
      conteudo: [
        "import type { FastifyInstance } from 'fastify';",
        'export function registrar(app: FastifyInstance): void {',
        "  app.post('/clandestina', async () => ({ ok: true }));",
        '}',
      ].join('\n'),
    };

    const achados = varrerRegistroDireto([contorno]);

    assert.equal(
      achados.length,
      1,
      'o portão não viu uma rota registrada direto no framework. Enquanto ele não ' +
        'vir este caso, o "zero achados" do teste anterior não prova nada.',
    );
    assert.equal(achados[0]?.linha, 3);
    assert.match(achados[0]?.trecho ?? '', /app\.post/);
  });

  void it('controle negativo: chamada citada em comentário não é achado', () => {
    const soProsa = {
      caminho: 'src/shared/http/exemplo.ts',
      conteudo: [
        '/**',
        ' * O registro era `app.post(rota.path, handler)`, e o teto ficava de fora.',
        ' */',
        "// app.get('/antigo', handler)",
        "const exemplo = \"app.delete('/em-texto')\";",
        'export const nada = exemplo;',
      ].join('\n'),
    };

    assert.deepEqual(varrerRegistroDireto([soProsa]), []);
  });
});
