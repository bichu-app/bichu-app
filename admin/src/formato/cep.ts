/**
 * O CEP brasileiro: mascara para quem digita, oito digitos para a API.
 *
 * ## POR QUE ESTE ARQUIVO NASCEU AGORA
 *
 * **Nao existia campo de CEP digitavel em lugar nenhum do painel** ate
 * 18/10/2026. Varri `admin/src/formato/` e `admin/src/componentes/`: ha
 * `dinheiro.ts`, `email.ts` e `telefone.ts`, e nenhum CEP. A unica mencao a CEP
 * no painel era `admin/src/rede/dominio/observacoes.ts`, que o detecta para
 * **remove-lo** da observacao do encontro -- o oposto de um cadastro.
 *
 * O formulario de entrada do diretorio de `Perto` e o primeiro campo de CEP que
 * alguem digita no painel, e por isso a mascara mora aqui -- em `formato/`, ao
 * lado das outras tres -- e nao dentro do formulario que a usou primeiro.
 *
 * ## OS DOIS LADOS, E A REGRA QUE OS SEPARA
 *
 * **A mascara mexe no que a pessoa ve. Ela NAO decide o que vai para a API.**
 * Essa e a mesma regra de `dinheiro.ts` e de `telefone.ts`, e ela existe porque
 * um campo que "ajuda" convertendo por dentro e a forma mais curta de corromper
 * dado em silencio. Aqui:
 *
 * - `mascaraDeCep` normaliza para a gramatica que se le: `05435-000`;
 * - `cepEmOitoDigitos` e a UNICA funcao que produz o valor da API, e ela recusa
 *   devolvendo `null` em vez de adivinhar.
 *
 * ## O FORMATO DA API E SEM HIFEN, E ISSO NAO FOI ESCOLHIDO AQUI
 *
 * `^[0-9]{8}$` e o `pattern` de `AdminDirectoryEntryInput.postal_code` no
 * contrato, que foi copiado de `CollarTagShippingAddress.postal_code`, que e o
 * `CHECK` da coluna. Quatro lugares, um formato. Mandar `05435-000` para a API
 * seria 400 depois de uma viagem a rede.
 */

/** Oito digitos, sem mascara. A MESMA forma do contrato e do `CHECK` do banco. */
export const DIGITOS_DO_CEP = 8;

/** O maximo que a mascara ocupa: `05435-000`. */
export const LIMITE_DO_CEP = 9;

function somenteDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

/**
 * O que a pessoa digitou, na gramatica brasileira.
 *
 * Progressiva de proposito: ela formata o que ja existe sem esperar o campo
 * ficar completo, porque uma mascara que so aparece no ultimo digito faz o
 * campo parecer quebrado enquanto se digita. Digito a mais e DESCARTADO, e nao
 * aceito para ser recusado depois: deixar entrar o nono digito so para recusar
 * no `salvar` esconderia o erro na unica tela em que ele e obvio.
 */
export function mascaraDeCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, DIGITOS_DO_CEP);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * O valor da API, ou `null` quando o que foi digitado nao e um CEP.
 *
 * `null` e recusa e nao ausencia: campo vazio e tratado por quem chama, que
 * sabe se o CEP era obrigatorio -- e aqui ele **nunca** e. Devolver `''` faria
 * "nao preencheu" e "preencheu errado" chegarem iguais ao `salvar`.
 */
export function cepEmOitoDigitos(valor: string): string | null {
  const d = somenteDigitos(valor);
  return d.length === DIGITOS_DO_CEP ? d : null;
}

/**
 * O CEP gravado, de volta na gramatica de quem le.
 *
 * **Isto nao e completar em silencio o que a pessoa digitou** -- e exibir o que
 * a escrita ja validou, do mesmo jeito que `telefoneDoE164` mostra os
 * parenteses de um numero gravado em E.164.
 */
export function cepDosOitoDigitos(cep: string | null | undefined): string {
  if (cep === null || cep === undefined || cep === '') return '';
  return mascaraDeCep(cep);
}

/** A recusa, ao sair do campo. Vazio nao erra: o CEP e opcional no diretorio. */
export function erraAoSairDoCep(valor: string): boolean {
  return valor.trim() !== '' && cepEmOitoDigitos(valor) === null;
}

export const ERRO_AO_SAIR_DO_CEP = 'O CEP tem oito dígitos. Por exemplo: 05435-000.';
