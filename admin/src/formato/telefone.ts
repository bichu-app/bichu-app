/**
 * O telefone brasileiro: mascara para quem digita, E.164 para a API.
 *
 * ## POR QUE ESTE ARQUIVO NASCEU AGORA
 *
 * **Nao existia campo de telefone digitavel em lugar nenhum do painel** ate
 * 17/10/2026. Procurei em `admin/src/formato/`, em `admin/src/componentes/` e em
 * toda branch do repositorio: ha `dinheiro.ts` e `email.ts`, e nenhum telefone.
 * O cadastro do diretorio de `Perto` e o primeiro campo de telefone que a
 * pessoa digita, e por isso a mascara mora aqui -- em `formato/`, ao lado das
 * outras duas -- e nao dentro do formulario que a usou primeiro.
 *
 * ## OS DOIS LADOS, E A REGRA QUE OS SEPARA
 *
 * **A mascara mexe no que a pessoa ve. Ela NAO decide o que vai para a API.**
 * Essa e a mesma regra de `dinheiro.ts`, e ela existe porque um campo que
 * "ajuda" convertendo por dentro e a forma mais curta de corromper dado em
 * silencio. Aqui:
 *
 * - `mascaraDeTelefone` normaliza para a gramatica brasileira que se le:
 *   `(11) 3061-2200` com oito digitos, `(11) 98765-4321` com nove.
 * - `telefoneEmE164` e a UNICA funcao que produz o valor da API, e ela recusa
 *   devolvendo `null` em vez de adivinhar.
 *
 * ## FIXO DE OITO, CELULAR DE NOVE
 *
 * Os dois tamanhos sao o que o Brasil tem desde a migracao dos nove digitos, e
 * a mascara os distingue pela QUANTIDADE e nao pelo primeiro digito: `9` na
 * frente e a regra do celular, mas prefixo de fixo tambem pode comecar com
 * numero alto em algumas faixas, e contar digito nao erra. O ponto de corte e
 * o nono digito depois do DDD.
 *
 * ## O `+55` NAO E DIGITADO, E NAO E ADIVINHADO
 *
 * A coluna do diretorio aceita E.164 de qualquer pais (`+` e 8 a 15 digitos):
 * o produto nao promete que toda clinica do diretorio seja brasileira. O que
 * este arquivo faz e oferecer o caminho BRASILEIRO, que e o de 100% dos
 * cadastros de hoje: quem digita DDD e numero recebe `+55...`. Quem precisa de
 * outro pais digita o `+` e o resto, e `telefoneEmE164` deixa passar sem mexer
 * -- um campo que forcasse `+55` recusaria um numero legitimo.
 */

/** O prefixo do Brasil. Usado quando o que foi digitado nao tem `+`. */
export const DISCAGEM_DO_BRASIL = '55';

export const DIGITOS_DO_FIXO = 8;
export const DIGITOS_DO_CELULAR = 9;
const DIGITOS_DO_DDD = 2;

/** `+` e 8 a 15 digitos, a MESMA forma do `CHECK` do banco e do `pattern` do contrato. */
export const FORMA_DE_E164 = /^\+[1-9][0-9]{7,14}$/;

/** O maximo que a mascara brasileira ocupa: `(11) 98765-4321`. */
export const LIMITE_DO_TELEFONE = 16;

function somenteDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

/**
 * O que a pessoa digitou, na gramatica brasileira.
 *
 * Progressiva de proposito: ela formata o que ja existe sem esperar o campo
 * ficar completo, porque uma mascara que so aparece no ultimo digito faz o
 * campo parecer quebrado enquanto se digita. Digito a mais e DESCARTADO, e nao
 * aceito e recusado depois: o teto e 11 digitos (DDD + nove), e deixar entrar o
 * decimo segundo so para recusar no `salvar` esconderia o erro na unica tela em
 * que ele e obvio.
 *
 * Um `+` na frente desliga a mascara inteira e o valor passa como digitado: e o
 * caminho do numero de fora do Brasil, e inventar parenteses nele seria
 * reformatar o que nao se sabe ler.
 */
export function mascaraDeTelefone(valor: string): string {
  if (valor.trimStart().startsWith('+')) {
    return `+${somenteDigitos(valor)}`.slice(0, LIMITE_DO_TELEFONE);
  }
  const d = somenteDigitos(valor).slice(0, DIGITOS_DO_DDD + DIGITOS_DO_CELULAR);
  if (d.length <= DIGITOS_DO_DDD) return d;

  const ddd = d.slice(0, DIGITOS_DO_DDD);
  const resto = d.slice(DIGITOS_DO_DDD);
  // Ate oito digitos o corte e 4+4; no nono ele passa a 5+4. E a troca que o
  // celular trouxe, e ela acontece no digito, nao no fim da digitacao.
  const corte = resto.length <= DIGITOS_DO_FIXO ? 4 : 5;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/**
 * O valor da API, ou `null` quando o que foi digitado nao e um telefone.
 *
 * `null` e recusa e nao ausencia: campo vazio e tratado por quem chama, que
 * sabe se o telefone era obrigatorio. Devolver `''` aqui faria "nao preencheu"
 * e "preencheu errado" chegarem iguais ao `salvar`.
 */
export function telefoneEmE164(valor: string): string | null {
  const texto = valor.trim();
  if (texto === '') return null;

  if (texto.startsWith('+')) {
    const internacional = `+${somenteDigitos(texto)}`;
    return FORMA_DE_E164.test(internacional) ? internacional : null;
  }

  const d = somenteDigitos(texto);
  if (d.length !== DIGITOS_DO_DDD + DIGITOS_DO_FIXO && d.length !== DIGITOS_DO_DDD + DIGITOS_DO_CELULAR) {
    return null;
  }
  // DDD valido comeca em 11: nenhum DDD brasileiro tem 0 ou 1 na frente, e
  // `+550...` seria recusado pelo `CHECK` do banco depois de uma viagem a rede.
  if (d.startsWith('0') || d.startsWith('1') && d[1] === '0') return null;
  const e164 = `+${DISCAGEM_DO_BRASIL}${d}`;
  return FORMA_DE_E164.test(e164) ? e164 : null;
}

/**
 * O E.164 gravado, de volta na gramatica de quem le.
 *
 * Numero brasileiro perde o `+55` e ganha os parenteses; qualquer outro pais
 * aparece como esta. **Isto nao e completar em silencio o que a pessoa
 * digitou** -- e exibir o que a escrita ja validou, do mesmo jeito que o
 * formulario do parceiro mostra `https://` na frente de um host gravado.
 */
export function telefoneDoE164(e164: string | null | undefined): string {
  if (e164 === null || e164 === undefined || e164 === '') return '';
  const d = somenteDigitos(e164);
  if (!d.startsWith(DISCAGEM_DO_BRASIL)) return e164;
  const nacional = d.slice(DISCAGEM_DO_BRASIL.length);
  if (
    nacional.length !== DIGITOS_DO_DDD + DIGITOS_DO_FIXO &&
    nacional.length !== DIGITOS_DO_DDD + DIGITOS_DO_CELULAR
  ) {
    return e164;
  }
  return mascaraDeTelefone(nacional);
}

/** A recusa, ao sair do campo. Vazio nao erra: quem exige o campo e o formulario. */
export function erraAoSairDoTelefone(valor: string): boolean {
  return valor.trim() !== '' && telefoneEmE164(valor) === null;
}

export const ERRO_AO_SAIR_DO_TELEFONE = 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
