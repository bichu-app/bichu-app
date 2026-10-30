/** A fiação do push em `src/bin/worker.ts`, conferida por TEXTO. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/** Lidos do diretório de trabalho, que é a raiz do repositório. */
const DO_WORKER = 'src/bin/worker.ts';
const DA_API = 'src/bin/api.ts';

function ler(caminho: string): string {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    throw new Error(
      `não foi possível ler ${caminho} a partir de ${process.cwd()}. ` +
        'Este teste confere a fiação por texto e precisa rodar da raiz do ' +
        'repositório; um teste que não acha o arquivo precisa REPROVAR, e não ' +
        'passar por vacuidade.',
    );
  }
}

void describe('fiação do push em src/bin/worker.ts', () => {
  void it('o worker monta o remetente de push, e monta pela escolha', () => {
    assert.match(
      ler(DO_WORKER),
      /criarPushSender\(\s*config\.push\s*\)/,
      'o worker não monta mais o remetente de push. Sem esta linha, a porta ' +
        '`PushSender`, os dois adaptadores e a porteira de `conteudo-do-push.ts` ' +
        'viram código morto — a mesma família de `invalidarTodasAsSessoes` e da rota ' +
        'do webhook de entrega.',
    );
  });

  void it('o transporte escolhido sai no log de subida', () => {
    assert.match(
      ler(DO_WORKER),
      /push\.transporte/,
      'o worker não anuncia mais por onde manda push na subida',
    );
  });

  void it('nenhum processo monta o adaptador do FCM por fora da escolha', () => {
    for (const caminho of [DO_WORKER, DA_API]) {
      assert.doesNotMatch(
        ler(caminho),
        /criarPushSenderFcm/,
        `${caminho} monta o adaptador do FCM direto, por fora de \`criarPushSender\`: ` +
          'o transporte deixa de ser escolha de configuração e passa a ser fato, em ' +
          'todo ambiente que rodar este processo.',
      );
    }
  });
});
