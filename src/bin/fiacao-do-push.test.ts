/**
 * A fiação do push em `src/bin/worker.ts`, conferida por TEXTO.
 *
 * Por que por texto, que é feio: **nada de `src/bin/` é carregado por teste.**
 * O `main()` do worker abre banco, fila e temporizadores, e o repositório já
 * pagou por isso uma vez — o aviso de reuso ao titular ficou em 0% de cobertura
 * enquanto morou dentro de `api.ts` (BICHUS-129). A montagem pode sair do
 * arquivo; a fiação, não: ela **é** o arquivo. Então ou se confere o texto, ou
 * não se confere. É a mesma decisão de `fiacao-das-bases.test.ts`, ao lado.
 *
 * O que esta guarda protege é a família de defeito que este repositório já
 * registrou duas vezes: **mecanismo escrito, testado e sem chamador**. Foi
 * `invalidarTodasAsSessoes`, foi a rota do webhook de entrega, e o push é o
 * candidato seguinte — a porta, os dois adaptadores e a porteira do payload
 * existem por inteiro, com teste, e bastaria esta linha não existir para que
 * tudo isso fosse decoração.
 *
 * Por que no worker e não na API: **a API enfileira, o worker envia.** A métrica
 * de arquitetura diz "da abertura ao último push ENFILEIRADO, ≤ 60 s"; a
 * `JobKind` `push.send` existe na porta da fila; docs/07-devops.md 4.1 descreve
 * o log do alerta como saída do worker; e o cabeçalho de `worker.ts` já prevê
 * que "alerta, lembrete e e-mail entram com as histórias que os criam".
 *
 * Isca: apague a linha `const push = criarPushSender(config.push);` do worker,
 * ou troque-a por `criarPushSenderFcm(...)` direto, e este arquivo reprova.
 */
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
    // A porta declara `transporte` exatamente para isto: "por onde este
    // processo manda push?" é a primeira pergunta de todo incidente de
    // notificação, e com `log` a resposta é "por lugar nenhum" — que ninguém
    // adivinha olhando para `ENVIRONMENT`.
    assert.match(
      ler(DO_WORKER),
      /push\.transporte/,
      'o worker não anuncia mais por onde manda push na subida',
    );
  });

  void it('nenhum processo monta o adaptador do FCM por fora da escolha', () => {
    // Montar `criarPushSenderFcm` direto num `bin/` pularia a escolha por
    // `PUSH_TRANSPORT` — quer dizer, enviaria de verdade em toda máquina que
    // subisse o processo, inclusive a de quem desenvolve e a da esteira. É a
    // forma mais curta de desfazer tudo o que este trabalho fez.
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
