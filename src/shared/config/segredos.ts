/**
 * Os segredos de runtime, e o passo que os coloca no ambiente antes da subida.
 *
 * ## Por que isto escreve em `process.env` em vez de devolver um objeto
 *
 * Porque `docs/07-devops.md` §6 promete que **o nome da variável não muda** ao
 * trocar o arquivo fora do git pelo gerenciador de segredos, e porque o resto
 * do projeto depende disso de duas maneiras que não são negociáveis:
 *
 * 1. `app-config.ts` lê tudo por `requireEnv('NOME')`, com o nome LITERAL, e a
 *    guarda da esteira (`.github/workflows/ci.yml`) varre esses literais por
 *    TEXTO para afirmar que nenhuma variável exigida ficou vazia. Devolver um
 *    objeto de segredos faria a metade mais importante da configuração sumir
 *    dessa varredura — o mesmo ponto cego que deixou `JWT_ACTIVE_KID` passar
 *    despercebida em 18/09, e que custou uma subida.
 * 2. As validações de forma que matam a subida citando o nome (PEM que não é
 *    PEM, `TAG_CODE_KEY` com tamanho errado, `IP_HMAC_KEY` curta demais) já
 *    estão escritas em `app-config.ts` e continuam valendo sem uma linha nova.
 *    Um segredo que vem do gerenciador passa pelas MESMAS conferências que um
 *    que veio do arquivo. Era isso ou escrever a segunda cópia delas.
 *
 * O custo é conhecido e está aceito no ADR-0022: escrever em `process.env` é
 * estado global. Ele é pago uma vez, na subida, antes de qualquer porta ser
 * ouvida, e por uma função que não é chamada em mais lugar nenhum.
 *
 * ## O que NÃO acontece aqui
 *
 * Nenhum valor é impresso, nem em erro, nem truncado, nem com máscara. Nenhum
 * `trim`: os bytes vão para `process.env` como vieram, porque quem sabe se
 * aquela variável é um PEM (que precisa da quebra final) ou uma chave
 * hexadecimal (que não pode ter nenhuma) é `app-config.ts`, e ele só decide
 * certo se receber o que foi gravado.
 */
import type { NomeDeSegredo, SecretProvider } from '../ports/secret-provider.js';
import { SegredoIndisponivelError } from '../ports/secret-provider.js';
import { ehAmbienteHospedado } from './ambiente-hospedado.js';

/**
 * Os segredos que saem do arquivo e passam a viver no gerenciador.
 *
 * O critério de entrada nesta lista é estreito de propósito: **só o que é
 * segredo de verdade e o que `app-config.ts` de fato lê hoje.** Endpoint, nome
 * de bucket, região e URL base continuam sendo variável comum de ambiente —
 * eles não são segredo, e enfiá-los aqui pagaria uma chamada de rede na subida
 * por um valor que está escrito no `compose.yaml`.
 *
 * Os nomes estão escritos como literais, um por linha, e não montados: é a
 * mesma razão pela qual `carregarToken` recebe o PEM já lido em vez do sufixo
 * para montar o nome.
 */
export const SEGREDOS_DE_RUNTIME: readonly NomeDeSegredo[] = [
  /** Usuário e senha do banco estão dentro da URL. */
  'DATABASE_URL',
  /** SEC-010: hash de IP sem chave é o IP em claro com um passo a mais. */
  'IP_HMAC_KEY',
  /** Abre o `code_ciphertext`, que existe para reimprimir o QR (ADR-0004). */
  'TAG_CODE_KEY',
  /** Assina todo token de acesso em circulação (ADR-0002). */
  'JWT_ACTIVE_PRIVATE_KEY',
  /**
   * Exigida em ambiente hospedado pelo `exigeChaveDeRotacao`, pelo mesmo
   * predicado que decide se esta lista é buscada no gerenciador. Os dois usam
   * `ehAmbienteHospedado`: se um dia divergirem, a subida passa a exigir uma
   * chave que a outra metade não foi buscar.
   */
  'JWT_NEXT_PRIVATE_KEY',
  /** As duas credenciais de armazenamento andam juntas; uma só assina o que o
   * armazenamento recusa, e a falha apareceria no primeiro envio de foto. */
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  /**
   * Token do provedor de e-mail. Entrou aqui em 19/09, ao criar o cofre de HML:
   * ele estava fora da lista e so seria lido do `.env`, que e exatamente o que
   * o ADR-0022 tirou do disco. Sem ele aqui, o ambiente hospedado buscaria sete
   * segredos no gerenciador e o oitavo no arquivo -- meia migracao, que e pior
   * que nenhuma, porque da a impressao de estar resolvido.
   *
   * O nome do segredo e o mesmo nos dois ambientes; o que muda e o PROJETO
   * apontado por `SECRET_STORE_PROJECT`. E por isso que nao existe
   * `MAIL_API_TOKEN_HML`: nome diferente por ambiente reintroduziria a tabela
   * de traducao que o ADR-0022 proibe, e cegaria a guarda da esteira que le os
   * `requireEnv('NOME')` literais.
   */
  'MAIL_API_TOKEN',
];

/**
 * Quando os segredos vêm do gerenciador, e quando vêm do ambiente.
 *
 * Mesmo predicado do `exigeChaveDeRotacao` (ADR-0022), e pela mesma razão que
 * está escrita lá: `dev` e teste ficam de fora **de propósito**. Exigir uma
 * nuvem para rodar `npm test` ou para subir o `compose` seria atrito novo sem
 * risco atrás dele — em `localhost` o arquivo `.env` não entra em snapshot de
 * disco de VM nenhuma, que é o problema inteiro que o ADR-0022 resolve.
 */
export function exigeGerenciadorDeSegredos(environment: string): boolean {
  return ehAmbienteHospedado(environment);
}

/**
 * Resolve todos os nomes e os escreve em `process.env`. Chamada na subida,
 * ANTES de `loadAppConfig()`.
 *
 * ## Por que o gerenciador SOBRESCREVE o que já estiver no ambiente
 *
 * Porque duas fontes para o mesmo segredo não são redundância, são ambiguidade.
 * Se o ambiente vencesse, um `.env` esquecido no disco da VM continuaria sendo
 * a fonte de verdade **em silêncio**, e o ADR-0022 teria trocado o mecanismo sem
 * trocar o risco: o valor seguiria em snapshot de disco e ninguém saberia que a
 * rotação no gerenciador não teve efeito nenhum. Em ambiente hospedado o
 * gerenciador é a fonte, e ponto.
 *
 * ## Por que todos os erros são coletados antes de lançar
 *
 * Um arranque que morre no primeiro nome faltando obriga o operador a sete
 * viagens de ida e volta para descobrir que faltavam sete. Ele morre uma vez,
 * com a lista inteira.
 */
export async function resolverSegredos(
  provider: SecretProvider,
  nomes: readonly NomeDeSegredo[] = SEGREDOS_DE_RUNTIME,
): Promise<void> {
  const resolvidos = new Map<NomeDeSegredo, string>();
  const faltando: string[] = [];

  for (const nome of nomes) {
    try {
      resolvidos.set(nome, await provider.obter(nome));
    } catch (erro) {
      if (erro instanceof SegredoIndisponivelError) {
        faltando.push(`  - ${erro.nome}: ${erro.message.slice(erro.message.indexOf('. ') + 2)}`);
        continue;
      }
      // Erro que NÃO é `SegredoIndisponivelError` é adaptador descumprindo a
      // exigência 2 da porta: ele deixou escapar o erro cru do provedor, que
      // não diz qual segredo falhou. O nome entra aqui, porque a alternativa é
      // um `permission denied` órfão no log de subida — que é exatamente o
      // defeito que esta linha existe para não deixar acontecer.
      throw new SegredoIndisponivelError(
        nome,
        `O adaptador (${provider.fonte}) falhou sem dizer qual segredo era. ` +
          `Causa: ${erro instanceof Error ? erro.message : 'desconhecida'}`,
      );
    }
  }

  // A escrita só acontece depois de TODOS resolverem. Escrever à medida que
  // chegam deixaria o processo com metade dos segredos novos e metade dos
  // antigos no momento em que a exceção sobe — e alguém, um dia, vai capturar
  // essa exceção e tentar seguir.
  if (faltando.length > 0) {
    throw new Error(
      `Não foi possível ler ${String(faltando.length)} segredo(s) de runtime em ` +
        `${provider.fonte}. A aplicação NÃO sobe sem eles:\n${faltando.join('\n')}\n` +
        `Cada nome acima é, ao mesmo tempo, o nome da variável de ambiente e o ` +
        `identificador do segredo no gerenciador — eles são iguais de propósito ` +
        `(ADR-0022). Veja .env.example e docs/07-devops.md §6.`,
    );
  }

  for (const [nome, valor] of resolvidos) process.env[nome] = valor;
}
