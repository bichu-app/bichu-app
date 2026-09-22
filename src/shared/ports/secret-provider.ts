/**
 * Porta de onde vem o valor de um segredo de runtime.
 *
 * Hoje: o valor está em variável de ambiente, que é o arquivo fora do git lido
 * por `env_file` (docs/07-devops.md §6). Em `prod` e `preprod`: o gerenciador de
 * segredos da nuvem, pelo adaptador em `adapters/external/`. **O nome não muda
 * entre os dois** — e é isso que faz esta porta ser uma porta e não uma camada
 * de tradução. Ver ADR-0022.
 *
 * ## O que esta porta EXIGE de quem a implementa
 *
 * A lista é normativa. Cada item existe porque a falta dele já aconteceu em
 * algum projeto e o sintoma foi o mesmo: um segredo silenciosamente errado.
 *
 * **1. O nome pedido é o nome da variável de ambiente, e é identidade.**
 * `MAIL_API_TOKEN` procura o segredo `MAIL_API_TOKEN`. Nada de tabela de
 * tradução, nada de prefixo montado em código, nada de minúsculas. Tabela de
 * tradução é o lugar onde o operador cria `mail-token-prod` e o código continua
 * lendo `mail-token`, e a divergência só aparece no ambiente que ninguém testa.
 *
 * **2. Ausência vira `SegredoIndisponivelError` CITANDO O NOME, sempre.**
 * Nenhum adaptador deixa escapar o erro cru do provedor. `403`, `permission
 * denied`, `NOT_FOUND` e `ECONNREFUSED` não dizem a quem lê o log **qual**
 * segredo faltou — e num arranque que resolve sete segredos de uma vez, essa é
 * a única informação que importa. A regra do projeto é falha ruidosa que cita o
 * nome da variável (§11.2, `requireEnv`), e trocar de fonte não pode rebaixá-la.
 *
 * **3. Nunca devolver valor vazio como se fosse valor.** String vazia é
 * ausência (é assim que `optionalEnv` a trata) e tem que virar o mesmo erro do
 * item 2. Segredo vazio que passa produz assinatura que confere com chave vazia,
 * e isso falha mais tarde e em outro lugar.
 *
 * **4. Devolver os bytes como estão, sem `trim`.** O adaptador não conserta
 * espaço nem quebra de linha. Um PEM PRECISA da quebra final; uma chave
 * hexadecimal NÃO pode ter nenhuma. Quem sabe qual dos dois é o caso é o
 * `app-config.ts`, que já trata cada variável pelo que ela é — e ele só consegue
 * fazer isso se receber o que foi gravado. O corolário operacional está no
 * roteiro: `echo` acrescenta `\n`, e `printf %s` não.
 *
 * **5. O valor não entra em mensagem de erro, em log, em `cause` nem em stack.**
 * Erro de subida vai para o log da máquina, e log é o lugar de onde o segredo
 * não sai mais.
 *
 * **6. Falhar fechado.** Sem valor padrão, sem "tenta o ambiente se o
 * gerenciador não responder", sem cache que sobreviva a um erro. Um fallback
 * silencioso para o ambiente é exatamente o `.env` no disco que o ADR-0022
 * está tirando do caminho — e ele reapareceria sem que nada acusasse.
 */

/**
 * Nome da variável de ambiente, que é também o identificador do segredo.
 *
 * Não é tipo marcado de propósito: a lista de nomes é literal em
 * `shared/config/segredos.ts`, e a guarda da esteira lê os nomes de
 * `requireEnv('X')` por TEXTO. Um construtor que embrulhasse o nome esconderia
 * dela exatamente as variáveis que mais importam.
 */
export type NomeDeSegredo = string;

/**
 * A falha que todo adaptador precisa produzir, em vez do erro do provedor.
 *
 * `nome` é campo, e não só texto na mensagem, porque quem chama resolve vários
 * segredos e precisa dizer **quais** faltaram, e não só o primeiro.
 */
export class SegredoIndisponivelError extends Error {
  readonly nome: NomeDeSegredo;

  constructor(nome: NomeDeSegredo, motivo: string) {
    super(`Segredo de runtime indisponível: ${nome}. ${motivo}`);
    this.name = 'SegredoIndisponivelError';
    this.nome = nome;
  }
}

export interface SecretProvider {
  /**
   * O valor, verbatim, ou `SegredoIndisponivelError` com o nome dentro.
   *
   * **Nunca resolve para `undefined`, para `''` nem para um padrão.** Quem
   * chama não tem como distinguir "não existe" de "existe e está vazio", e a
   * diferença entre as duas é uma subida que morre e uma subida que sobe
   * errada.
   */
  obter(nome: NomeDeSegredo): Promise<string>;

  /**
   * De onde os valores vieram, para o log de subida.
   *
   * Existe porque "de onde este processo leu os segredos?" é a primeira
   * pergunta de todo incidente de configuração, e responder a ela olhando para
   * `ENVIRONMENT` é deduzir em vez de ler. **Não contém valor de segredo** —
   * é rótulo da fonte, e nada mais.
   */
  readonly fonte: string;
}
