// A PAGINA PUBLICA DO ENCONTRO: a quebra de linha das observacoes.
//
// Pedido do cliente de 22/10/2026: *"O campo de observacoes da pagina de
// detalhes do evento, deve aceitar quebras de linha, para nao deixar as
// informacoes todas juntas"*.
//
// ---------------------------------------------------------------------------
// ERA ESTA PAGINA, E NAO O APP -- e isso foi MEDIDO antes de mexer
// ---------------------------------------------------------------------------
// O caminho inteiro da quebra foi conferido: o campo que escreve aceita `\n`
// (`criar_encontro.dart`, `linhas: 3`), o `.trim()` do envio tira so as
// pontas, o servidor nao a remove (`errosDasObservacoes` mede tamanho e recusa
// contato/pagamento), o `CHECK` do banco e so de tamanho, e o app PINTA as
// linhas (sonda com tres linhas duras mediu quatro linhas de paragrafo e 72 dp
// de altura num `Text`).
//
// O que colapsava era o HTML: num `<p>` sem `white-space`, `\n` e espaco em
// branco comum.
//
// ---------------------------------------------------------------------------
// ELE MEDE A ALTURA PINTADA, E NAO A REGRA DE CSS
// ---------------------------------------------------------------------------
// Um `toHaveCSS('white-space', 'pre-line')` afirmaria que a REGRA esta
// aplicada, nao que o texto virou linhas. Este caso compara a altura do
// paragrafo com a altura de UMA linha dele.
//
// **A LARGURA DE 1280 px NAO E ESCOLHA DE ESTILO: ela e a condicao de a
// medicao SER SENSIVEL, e foi medida.** A primeira versao deste caso rodava a
// 390 px e exigia `>= 3` linhas -- e passou com `white-space: normal`, porque
// nessa largura o texto do mock QUEBRA POR LARGURA em tres linhas de qualquer
// jeito. A isca nao derrubava o caso, e ele era guarda e nao medicao. Medido
// no mesmo navegador, com o mesmo texto:
//
//   largura do <p>   com `normal`   com `pre-line`
//   358 px (vp 390)    3 linhas       3 linhas   <- NAO distingue
//   720 px (vp 768)    2 linhas       3 linhas
//  1184 px (vp 1280)   1 linha        3 linhas   <- distingue com folga
//
// A 1280 px o texto colapsado cabe em UMA linha, e as tres so aparecem se as
// quebras valerem. O caso exige **exatamente tres**: menos e colapso, mais e
// quebra por largura voltando a confundir a medicao.
//
// E ele carrega CONTROLE POSITIVO e NEGATIVO:
//   - positivo: a secao `Observacoes` existe e as tres frases estao no mesmo
//     no (senao "nao achei" seria "nao carreguei");
//   - negativo: um paragrafo IRMAO da mesma pagina, que NAO tem quebra, mede
//     uma linha so -- o que prova que a medicao sabe distinguir as duas.
import { expect, test } from '@playwright/test';

import { ENCONTROS } from '../mock/cenarios.mjs';

const PRIMEIRA = 'Chegue 10 minutos antes.';
const SEGUNDA = 'Leve agua para o seu cachorro.';
const TERCEIRA = 'Se chover forte, fica para o sabado seguinte.';

test.describe('a pagina publica do encontro', () => {
  test('as observacoes renderizam a quebra de linha como LINHAS', async ({
    page,
  }) => {
    // 1280 px: a largura em que o texto COLAPSADO cabe numa linha so. Ver a
    // tabela no cabecalho -- a 390 px este caso passava com a isca ligada.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/encontro/${ENCONTROS.publicado}`);

    // CONTROLE POSITIVO: a pagina abriu no estado de encontro publicado.
    await expect(
      page.getByRole('heading', { name: 'Observações de quem organiza' }),
    ).toBeVisible();

    const paragrafo = page.locator('p.texto-com-linhas');
    await expect(paragrafo).toHaveCount(1);

    // CONTROLE POSITIVO do conteudo: as tres frases estao no MESMO no. Se o
    // mock mudar e sobrar uma linha, a medicao abaixo fica sem sentido e este
    // `expect` e que avisa.
    const texto = await paragrafo.innerText();
    for (const frase of [PRIMEIRA, SEGUNDA, TERCEIRA]) {
      expect(texto, `falta "${frase}" nas observacoes do mock`).toContain(
        frase,
      );
    }

    // A ALTURA DE UMA LINHA, lida do proprio elemento: nada de numero
    // inventado aqui.
    const { altura, linha } = await paragrafo.evaluate((e) => {
      const estilo = getComputedStyle(e);
      return {
        altura: e.getBoundingClientRect().height,
        linha: parseFloat(estilo.lineHeight),
      };
    });
    expect(linha, 'line-height do paragrafo nao e um numero').toBeGreaterThan(0);

    const linhas = Math.round(altura / linha);
    expect(
      linhas,
      `REPROVA: o paragrafo das observacoes pintou ${linhas} linha(s) ` +
        `(altura ${altura}px / linha ${linha}px) e o esperado e TRES. ` +
        `UMA linha significa que as quebras colapsaram em espaco -- que e ` +
        `"as informacoes todas juntas" que o cliente relatou em ` +
        `22/10/2026. MAIS de tres significa que o texto comecou a quebrar ` +
        `por largura nesta bancada, e a medicao deixou de distinguir as duas ` +
        `coisas: reveja a largura de 1280 px e a tabela no cabecalho deste ` +
        `arquivo.`,
    ).toBe(3);
  });

  test('CONTROLE NEGATIVO: um paragrafo sem quebra mede UMA linha', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/encontro/${ENCONTROS.publicado}`);

    // `summary` e irmao das observacoes na mesma pagina e NAO tem quebra. Se
    // a medicao de cima contasse linhas de qualquer paragrafo, este caso
    // reprovaria -- e e ele que separa "a medicao funciona" de "a medicao
    // devolve um numero grande sempre".
    const resumo = page.getByText(
      'Volta tranquila pela praça, com parada na sombra.',
      { exact: true },
    );
    await expect(resumo).toBeVisible();

    const { altura, linha } = await resumo.evaluate((e) => {
      const estilo = getComputedStyle(e);
      return {
        altura: e.getBoundingClientRect().height,
        linha: parseFloat(estilo.lineHeight),
      };
    });
    const linhas = Math.round(altura / linha);
    expect(
      linhas,
      `REPROVA: o resumo (que nao tem quebra de linha) mediu ${linhas} ` +
        `linhas a 1280 px, e o esperado e UMA. A medicao de linhas desta ` +
        `bancada esta contando outra coisa, e com ela o caso de cima nao ` +
        `prova que as quebras das observacoes viraram linhas.`,
    ).toBe(1);
  });
});
