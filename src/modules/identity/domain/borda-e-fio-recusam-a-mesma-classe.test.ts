/**
 * A isca do critério 5 da BICHUS-198, e a única que não envelhece.
 *
 * ## O que ela decide
 *
 * A borda (`emailTemFormaValida`, no cadastro) e o fio (`conferirDestinatario`,
 * no `smtp-mailer`) precisam recusar **a mesma classe de caractere**. Se a borda
 * afrouxar, volta o defeito que originou a issue: a conta nasce e só depois o
 * envio falha, e a pessoa leva 500 com a conta já criada. Se a borda apertar
 * além do fio, o cadastro passa a recusar endereço legítimo para o qual o envio
 * funcionaria — conta que nunca existe por causa de um caractere que o
 * transporte carregaria bem.
 *
 * ## Por que a comparação é em runtime, e não uma lista repetida aqui
 *
 * Uma terceira cópia da lista dentro do teste seria a próxima divergência: no
 * dia em que alguém acrescentasse um caractere ao domínio e ao adaptador, este
 * arquivo continuaria verde com a lista velha, e o portão diria que está tudo
 * igual justamente quando deixou de estar. Então o teste **não sabe** quais são
 * os caracteres. Ele varre os 1.114.112 pontos de código do Unicode, pergunta
 * aos dois lados o que cada um faz, e exige que as respostas coincidam.
 *
 * Isso vale mesmo agora que os dois importam a mesma constante: compartilhar a
 * definição não basta, porque a borda pode **aplicá-la diferente** -- só na
 * parte local, depois de um `slice`, depois de uma normalização. Por isso a
 * varredura injeta o caractere nos dois lados do `@`.
 *
 * ## Como provar que ela reprova
 *
 * Troque o `return motivoDaRecusaDeEndereco(email) === null` de
 * `domain/email.ts` de volta pelo `return !/\s/.test(email)` que estava lá antes
 * da BICHUS-198. Este arquivo acusa os 12 pontos de código de divergência
 * (`"`, `,`, `:`, `;`, `<`, `>`, `\`, `U+007F`-`U+0084`, `U+0086`-`U+00A0`,
 * `U+200B`-`U+200D` e os controles C0) em cada uma das duas posições.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { emailTemFormaValida } from './email.js';
import { conferirDestinatario } from '../adapters/external/smtp-mailer.js';

/** O fio recusa levantando; a borda recusa devolvendo `false`. */
function oFioRecusa(endereco: string): boolean {
  try {
    conferirDestinatario(endereco);
    return false;
  } catch {
    return true;
  }
}

function aBordaRecusa(endereco: string): boolean {
  return !emailTemFormaValida(endereco);
}

/**
 * As posições em que o caractere é injetado.
 *
 * Duas, e não uma, porque uma borda que só conferisse a parte local passaria
 * numa varredura feita só na parte local. Os dois moldes são escolhidos para
 * que **nenhuma** das regras de estrutura da borda (um `@` só, domínio com
 * ponto, domínio que não começa nem termina em ponto, tamanho) mude de resposta
 * por causa do caractere injetado -- exceto pelo `@`, tratado logo abaixo.
 */
const MOLDES = [
  { nome: 'parte local', montar: (ch: string): string => `a${ch}@b.test` },
  { nome: 'domínio', montar: (ch: string): string => `a@b${ch}.test` },
] as const;

/**
 * A única regra que é da borda e não do fio, e ela é de estrutura, não de
 * gramática de transporte: um endereço tem **um** `@`. O fio não tem opinião
 * sobre isso (um `@` a mais não fecha comando nem cabeçalho), e a borda tem,
 * porque `split('@')` precisa dar duas partes. Está nomeada aqui, e não
 * escondida numa exceção genérica, para que qualquer OUTRA divergência que
 * apareça reprove.
 */
const ARROBA = 0x40;

void describe('BICHUS-198 — a borda e o fio recusam a mesma classe', () => {
  for (const molde of MOLDES) {
    void it(`todo ponto de código decide igual dos dois lados (injetado na ${molde.nome})`, () => {
      const divergentes: string[] = [];

      for (let cp = 0; cp <= 0x10ffff; cp++) {
        // Metades substitutas sozinhas não formam ponto de código; injetá-las
        // produziria texto malformado e não um caso de gramática.
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        if (cp === ARROBA) continue;

        const endereco = molde.montar(String.fromCodePoint(cp));
        if (aBordaRecusa(endereco) !== oFioRecusa(endereco)) {
          divergentes.push(
            `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ` +
              `(borda ${aBordaRecusa(endereco) ? 'recusa' : 'aceita'}, ` +
              `fio ${oFioRecusa(endereco) ? 'recusa' : 'aceita'})`,
          );
        }
      }

      assert.deepEqual(
        divergentes.slice(0, 20),
        [],
        `a borda e o fio discordam em ${String(divergentes.length)} ponto(s) de código. ` +
          'Se a borda ficou mais frouxa, a conta volta a nascer antes de o envio falhar (BICHUS-198). ' +
          'Se ficou mais rígida, o cadastro recusa endereço que o envio entregaria.',
      );
    });
  }

  void it('o `@` a mais é a única divergência, e ela é da borda, por estrutura', () => {
    // Se esta afirmação deixar de valer, a exceção acima passa a esconder algo
    // que ninguém decidiu esconder.
    for (const molde of MOLDES) {
      const endereco = molde.montar('@');
      assert.equal(aBordaRecusa(endereco), true, `a borda precisa recusar ${endereco}`);
      assert.equal(oFioRecusa(endereco), false, `o fio não tem opinião sobre ${endereco}`);
    }
  });

  void it('a varredura enxerga alguma coisa — uma varredura vazia aprovaria qualquer implementação', () => {
    // Verificação que não consegue verificar precisa reprovar, nunca aprovar.
    // Sem este caso, um molde quebrado (um `montar` que devolvesse sempre o
    // mesmo texto, por exemplo) deixaria os dois casos acima verdes sem ter
    // comparado nada.
    for (const molde of MOLDES) {
      assert.equal(oFioRecusa(molde.montar(';')), true, `${molde.nome}: o fio precisa recusar o ';'`);
      assert.equal(aBordaRecusa(molde.montar(';')), true, `${molde.nome}: a borda precisa recusar o ';'`);
      assert.equal(oFioRecusa(molde.montar('x')), false, `${molde.nome}: o fio aceita letra`);
      assert.equal(aBordaRecusa(molde.montar('x')), false, `${molde.nome}: a borda aceita letra`);
    }
  });

  void it('a recusa da borda não depende de ordem: o endereço do relato da issue não passa', () => {
    // O caso literal de BICHUS-198. Fica aqui, e não só no teste de aplicação,
    // para que a regra de domínio tenha a sua própria linha vermelha.
    assert.equal(emailTemFormaValida('a@b.test;x'), false);
  });

  void it('endereço legítimo continua passando na borda', () => {
    // Sem isto, uma borda que recusasse tudo passaria em todos os casos acima
    // (ela coincidiria com o fio em nada, mas o `@` e o ';' não a pegariam) e o
    // produto pararia de aceitar cadastro.
    for (const endereco of [
      'ana.paula+bichu@exemplo.test',
      "o'brien@exemplo.test",
      'joao_silva-99@sub.exemplo.com.br',
      'conta!#$%&*+-/=?^_`{|}~@exemplo.test',
      'maria@exemplo.com.br',
    ]) {
      assert.equal(emailTemFormaValida(endereco), true, endereco);
    }
  });
});
