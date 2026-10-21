/**
 * A FOTO QUE ENTRA NA MENSAGEM, resolvida no instante do envio.
 *
 * ## A INVARIANTE, e ela é a razão deste arquivo existir
 *
 * **A mensagem recebe a chave HIGIENIZADA (`upload_intents.sanitized_key`), e
 * NUNCA a do original (`upload_intents.object_key`).**
 *
 * Isto não é preferência de implementação: é o que fecha o vazamento de
 * coordenada de GPS. Foto tirada de celular carrega latitude e longitude no
 * EXIF, e num produto de pet perdido isso entrega onde a pessoa que achou o
 * animal estava — e quem acha um animal costuma achá-lo perto de onde mora. O
 * trabalhador de higiene (`media/application/higienizar-foto-do-achado.ts`)
 * reescreve a imagem do zero, sem copiar metadado nenhum, grava a derivada em
 * balde privado e **substitui o original**. Enquanto o original existe, ele é a
 * cópia que carrega a coordenada.
 *
 * Gravar `object_key` em `conversation_messages.photo_object_key` serviria o
 * EXIF inteiro ao outro lado da conversa — que é exatamente a pessoa de quem a
 * localização está sendo protegida, porque o falso achador é o modelo de ameaça
 * desta tela.
 *
 * **O que a invariante compra na LEITURA:** a leitura não consulta estado
 * nenhum. Chave presente em `photo_object_key` já significa chave limpa. Se a
 * escrita pudesse gravar o original, toda leitura passaria a precisar de um
 * `JOIN` com `upload_intents` para saber se pode servir aquela chave — e a
 * leitura que esquecesse o `JOIN` serviria a coordenada sem nada acusar.
 *
 * É por isso que [FotoParaAMensagem] **não tem um caso que devolva a chave do
 * original**. Não é possível escrever o caminho errado chamando esta porta: ele
 * não está representado. Quem quiser "simplificar" gravando `object_key` terá de
 * mudar este arquivo, e aí a mudança aparece no diff com este cabeçalho ao lado.
 *
 * ## Por que a porta é de `messaging`, e não um método em `media`
 *
 * Porque **a cláusula `WHERE` é de `messaging`** (ADR-0021: a autorização mora
 * no `WHERE`, nunca num `if` de borda). O recorte que decide se aquela intenção
 * pode entrar naquela mensagem é "a intenção é do aviso DESTA conversa", e
 * `conversations.found_report_id` é coluna de `messaging`. Um método em
 * `media/ports/fotos-do-achado.ts` — que é a vista do WORKER — teria de receber
 * `conversationId` e o resumo do token do achador como argumentos, e `media`
 * passaria a conhecer o que é uma conversa e o que é um papel nela. A pergunta
 * "de quem é esta conversa" nunca foi de `media`.
 *
 * O que `messaging` toma de `media` é só o que não carrega autorização: a lista
 * das duas espécies do achado (`ESPECIES_DO_ACHADO`) e, na leitura, o assinador
 * de URL privada (`ObjectStorage.getSignedReadUrl`). Os dois saem de `ports/`,
 * que é a única camada de um módulo que outro módulo enxerga (§6).
 *
 * O adaptador desta porta LÊ `upload_intents`, que é tabela de `media`. Isso
 * tem precedente exato e simétrico neste repositório:
 * `media/adapters/persistence/kysely-media-repository.ts` lê
 * `conversation_messages`, que é tabela de `messaging`, para apagar os objetos
 * de uma conta excluída. A fronteira que a arquitetura vigia é a de `import`
 * entre módulos, e nenhum `import` novo atravessa camada privada.
 *
 * ## Por que há quatro desfechos e não um `null`
 *
 * Porque as saídas da PESSOA são diferentes, e um `null` as apagaria todas numa
 * só. `pendente` pede tentar de novo em segundos; `recusada` pede escolher outra
 * foto e nunca melhora com o tempo; `ausente` é "os bytes não chegaram";
 * `nao-encontrada` é referência que não existe ou é de outro aviso. Com um
 * `null`, a tela diria "não foi possível anexar" nos quatro, e a pessoa não
 * saberia se espera, se troca a foto ou se reenvia.
 *
 * **Nenhum deles grava a mensagem sem a foto.** Quem anexou uma foto precisa
 * saber que ela não entrou: gravar o texto em silêncio produz a pior falha
 * possível desta tela — a pessoa acredita que mandou a prova de que está com o
 * animal, e o outro lado nunca a vê.
 */
import type { ConversationId } from '../../../shared/types/brands.js';

/**
 * O desfecho da resolução. **Não existe caso que devolva a chave do original** —
 * ver a invariante no cabeçalho.
 */
export type FotoParaAMensagem =
  /**
   * A derivada higienizada existe. `chaveHigienizada` é
   * `upload_intents.sanitized_key`, e o banco garante que ela não é nula quando
   * o estado é `pronta`: o CHECK `upload_intents_higiene_coerente` só admite
   * `'pronta'` com `sanitized_key IS NOT NULL`. Então `pronta` é prova de que a
   * chave limpa existe, e não uma promessa desta camada.
   */
  | { readonly situacao: 'pronta'; readonly chaveHigienizada: string }
  /**
   * A higiene ainda não terminou (`sanitize_status = 'pendente'`).
   *
   * **Raro, e a raridade é medida**: desde 19/10/2026 o aplicativo envia os
   * bytes no momento em que a pessoa ESCOLHE a foto, e o toque de confirmar só
   * carrega o identificador (`app/lib/api/envio_de_foto.dart`). Quando a
   * mensagem é postada, a higiene em geral já terminou. A corrida existe e por
   * isso tem nome próprio, mas nada caro deve ser construído em volta dela.
   */
  | { readonly situacao: 'pendente' }
  /**
   * A higiene RECUSOU os bytes. `motivo` é o texto que o trabalhador já gravou
   * em `upload_intents.sanitize_rejection_reason`, lido de lá e **não redigido
   * de novo nesta borda**: os textos existem num lugar só
   * (`TEXTO_DA_RECUSA`, em `higienizar-foto-do-achado.ts`), e duas redações do
   * mesmo motivo divergem na primeira que alguém ajustar.
   */
  | { readonly situacao: 'recusada'; readonly motivo: string }
  /** A intenção foi assinada e os bytes nunca chegaram. Desfecho FINAL. */
  | { readonly situacao: 'ausente' }
  /**
   * A referência não existe, **ou não é do aviso desta conversa**.
   *
   * Os dois casos são o MESMO desfecho de propósito, pela regra do ADR-0021:
   * distinguir contaria a quem chama que aquele identificador é uma intenção de
   * verdade, pertencente a outro aviso — e um aviso diz onde um animal foi
   * visto.
   */
  | { readonly situacao: 'nao-encontrada' };

export interface FotoDaConversa {
  /**
   * O lado COM CONTA, pelo `upload_id` de
   * `createFoundReportPhotoUploadIntent`.
   *
   * O `WHERE` carrega o recorte inteiro (ADR-0021): a intenção tem de ser do
   * aviso desta conversa, e a conversa tem de ser do chamador. A consulta que
   * alcançaria a intenção de outro aviso não existe no adaptador.
   */
  porUploadId(
    conversa: ConversationId,
    chamador: string,
    uploadId: string,
  ): Promise<FotoParaAMensagem>;

  /**
   * O lado SEM CONTA, pela referência opaca de
   * `createFinderPhotoUploadIntent`.
   *
   * O resumo do token entra no `WHERE`, exatamente como em
   * `intencaoDeFotoDoAchadorPelaReferencia` (`found/application/aviso-do-achador.ts`),
   * que é o precedente desta forma: quem não tem conta é nomeado pelo resumo do
   * token do aviso, e ele é o predicado.
   */
  pelaReferenciaDoAchador(resumo: Uint8Array, uploadRef: string): Promise<FotoParaAMensagem>;
}
