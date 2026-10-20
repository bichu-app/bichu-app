/**
 * A porta da busca de CEP: **o endereco de um codigo postal, em TEXTO**.
 *
 * ## Por que existe uma porta para isto
 *
 * Decisao do cliente de 18/10/2026: *"voce deve usar sempre a mesma camada de
 * servico que ja fez a integracao com as plataformas, reaproveitamento dos
 * nossos endpoints"*. Antes dela, o aplicativo falava com o ViaCEP direto
 * (`app/lib/api/busca_de_cep.dart`) e o painel nao tinha busca nenhuma -- e o
 * caminho obvio, escrever um segundo cliente de CEP em TypeScript, teria
 * produzido a segunda implementacao da mesma regra. Ordem dos servicos, prazo,
 * `{"erro":"true"}` com `true` como texto e HTML com 400 em CEP torto sao
 * peculiaridades MEDIDAS: duas copias delas divergem na primeira base que
 * mudar de formato, e a que diverge para o lado silencioso e a que ninguem
 * percebe.
 *
 * Esta porta e o unico lugar do servidor que alguem chama para trocar CEP por
 * endereco. Quais servicos existem, em que ordem e com que prazo e assunto do
 * adaptador, e nenhum caso de uso sabe disso.
 *
 * ## O QUE ELA NAO E, e a distincao e o que a autoriza
 *
 * **Nao e geocodificacao.** A ADR-0006 proibe transformar endereco em
 * COORDENADA; aqui o caminho e o contrario -- um CEP vira rua, bairro, cidade
 * e estado, que e exatamente o que a pessoa digitaria. Nenhum campo deste
 * arquivo e latitude, longitude, ponto ou indice espacial, e nao ha coluna
 * onde guardar um.
 *
 * ## Nenhum desfecho lanca, e nenhum impede uma escrita
 *
 * Os tres desfechos sao valores, e nao excecoes. Um servico de terceiro fora
 * do ar nao pode travar o cadastro de uma clinica: quem chama decide o que
 * dizer na tela, e a tela continua com os campos editaveis e o botao vivo.
 */

/** O endereco de um CEP: quatro campos de texto, e nada mais. */
export interface EnderecoDoCep {
  /**
   * O logradouro. **Vazio quando o CEP e de cidade inteira** (CEP "geral") e
   * nao de uma rua -- e isso nao e erro, e o que aquele CEP significa.
   */
  readonly street: string;
  /** O bairro. Vazio pelo mesmo motivo de `street`. */
  readonly neighborhood: string;
  readonly city: string;
  /** A UF, duas letras maiusculas. */
  readonly state: string;
}

/**
 * O desfecho de uma busca, decidido no servidor.
 *
 * **Nenhum destes desfechos impede nada de ser salvo.** `naoEncontrado` e
 * `indisponivel` terminam no mesmo lugar para quem preenche -- digitar o
 * endereco --, e sao dois porque a FRASE e diferente: "este CEP nao existe"
 * nao e "nao conseguimos consultar agora".
 */
export type RespostaDaBuscaDeCep =
  | { readonly desfecho: 'encontrado'; readonly endereco: EnderecoDoCep }
  /** O CEP nao existe em nenhuma das bases consultadas. */
  | { readonly desfecho: 'naoEncontrado' }
  /** Os servicos falharam, ou demoraram demais. */
  | { readonly desfecho: 'indisponivel' };

export interface BuscaDeCep {
  /** O endereco do CEP, ou o motivo de nao ter vindo. **Nunca lanca.** */
  buscar(cep: string): Promise<RespostaDaBuscaDeCep>;
}
