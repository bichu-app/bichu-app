/**
 * [FotoDaConversa] sobre Postgres. A invariante inteira está na porta
 * (`messaging/ports/foto-da-conversa.ts`); aqui está o `WHERE` que a cumpre.
 *
 * ## `sanitized_key` é a ÚNICA coluna de chave selecionada
 *
 * `object_key` **não aparece na lista de seleção** de nenhuma das duas
 * consultas, e a ausência é deliberada: o que não chega não vaza, e o que não
 * chega também não pode ser gravado por engano. Um `select` que trouxesse as
 * duas colunas deixaria a invariante depender de qual delas o mapeamento
 * escolhe — e esse é um erro de uma letra que nenhum teste de comportamento
 * acusa, porque as duas chaves apontam para uma imagem que a tela abre.
 *
 * ## As espécies vêm da constante, nunca copiadas
 *
 * `ESPECIES_DO_ACHADO` (`media/ports/fotos-do-achado.ts`) é a única definição
 * das duas espécies. Copiar a lista aqui é o defeito que aquele arquivo já
 * registra ter pago: a varredura de envios vencidos tinha a sua própria cópia e
 * passou a apagar a foto do achado sem nada acusar. Quem acrescentar uma
 * terceira espécie de foto de achado amanhã só lembraria de uma das listas.
 */
import type { Db } from '../../../../shared/db/pool.js';
import { ESPECIES_DO_ACHADO } from '../../../media/ports/fotos-do-achado.js';
import type { FotoDaConversa, FotoParaAMensagem } from '../../ports/foto-da-conversa.js';
import type { ConversationId } from '../../../../shared/types/brands.js';

/**
 * O que as duas consultas trazem. **Sem `object_key`** — ver o cabeçalho.
 */
interface LinhaDaHigiene {
  sanitize_status: 'pendente' | 'pronta' | 'recusada' | 'ausente';
  sanitized_key: string | null;
  sanitize_rejection_reason: string | null;
}

/**
 * O estado da higiene traduzido no desfecho da porta.
 *
 * `pronta` com `sanitized_key` nula é estado que o banco não permite (o CHECK
 * `upload_intents_higiene_coerente` só admite `'pronta'` com
 * `sanitized_key IS NOT NULL`). O `??` existe só para o compilador, e o caminho
 * devolve `nao-encontrada` em vez de inventar uma chave vazia: se aquele CHECK
 * um dia cair, o envio recusa em vez de gravar `photo_object_key = ''`, que é
 * uma linha que nenhuma leitura sabe tratar.
 */
function comoFoto(linha: LinhaDaHigiene | undefined): FotoParaAMensagem {
  if (linha === undefined) return { situacao: 'nao-encontrada' };
  switch (linha.sanitize_status) {
    case 'pronta':
      return linha.sanitized_key === null
        ? { situacao: 'nao-encontrada' }
        : { situacao: 'pronta', chaveHigienizada: linha.sanitized_key };
    case 'recusada':
      // O motivo GRAVADO pelo trabalhador, e não um texto redigido aqui. O
      // CHECK garante que ele não é nulo neste estado.
      return { situacao: 'recusada', motivo: linha.sanitize_rejection_reason ?? '' };
    case 'ausente':
      return { situacao: 'ausente' };
    case 'pendente':
    default:
      return { situacao: 'pendente' };
  }
}

/**
 * O LADO COM CONTA. Três predicados, e nenhum deles é dispensável.
 *
 * 1. `upload_intents.id = :uploadId` — qual intenção;
 * 2. `conversations.id = :conversa` **e** o chamador sendo um dos dois lados
 *    dela — de quem é a conversa. Repetido aqui de propósito (ADR-0001), mesmo
 *    o serviço já tendo autorizado a conversa antes: autorização que depende de
 *    outra chamada ter acontecido é a autorização num `if`, com mais passos;
 * 3. `upload_intents.found_report_id = conversations.found_report_id` — **é esta
 *    que recusa a intenção de OUTRO aviso**. Sem ela, qualquer `upload_id` de
 *    qualquer aviso do produto entraria em qualquer conversa, e nenhum predicado
 *    faltaria no texto do SQL.
 *
 * `finder_user_id` entra no `OR` porque o achador que TEM conta escreve por esta
 * rota, e ele é autorizado pela mesma cláusula que o tutor — é o que a migração
 * `20260922000012` diz ao desnormalizar as duas colunas.
 *
 * Exportado para a bancada que lê o SQL compilado, e não para a produção chamar:
 * é o molde de `autorizacao-na-clausula-where.test.ts`, que confere a cláusula
 * em vez do comportamento, porque a diferença entre "o `WHERE` recortou" e "um
 * `if` descartou depois" não é observável na resposta.
 */
export function construtorDaFotoDoLadoComConta(
  db: Db,
  conversa: ConversationId,
  chamador: string,
  uploadId: string,
) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('conversations', (join) =>
      join.onRef('conversations.found_report_id', '=', 'upload_intents.found_report_id'),
    )
    .select([
      'upload_intents.sanitize_status',
      'upload_intents.sanitized_key',
      'upload_intents.sanitize_rejection_reason',
    ])
    .where('upload_intents.id', '=', uploadId)
    .where('upload_intents.kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('conversations.id', '=', conversa)
    .where((eb) =>
      eb.or([
        eb('conversations.tutor_user_id', '=', chamador),
        eb('conversations.finder_user_id', '=', chamador),
      ]),
    );
}

/**
 * O LADO SEM CONTA, pela referência opaca.
 *
 * Mesma forma de `construtorDaIntencaoPelaReferencia`
 * (`found/adapters/persistence/kysely-found-report-repository.ts`), que é o
 * precedente: o resumo do token do aviso é o predicado, porque quem não tem
 * conta não tem id com que ser nomeado.
 *
 * A correlação `upload_intents.found_report_id = found_reports.id` é o que faz a
 * pergunta ser "esta referência é do aviso DESTE token" em vez de "esta
 * referência existe e este token existe", que é a pergunta que um produto
 * cartesiano responderia com os mesmos predicados no texto.
 */
export function construtorDaFotoDoAchadorSemConta(db: Db, resumo: Uint8Array, uploadRef: string) {
  return db
    .selectFrom('upload_intents')
    .innerJoin('found_reports', 'found_reports.id', 'upload_intents.found_report_id')
    .select([
      'upload_intents.sanitize_status',
      'upload_intents.sanitized_key',
      'upload_intents.sanitize_rejection_reason',
    ])
    .where('upload_intents.upload_ref', '=', uploadRef)
    .where('upload_intents.kind', 'in', [...ESPECIES_DO_ACHADO])
    .where('found_reports.finder_token_hash', '=', Buffer.from(resumo));
}

export function criarFotoDaConversa(db: Db): FotoDaConversa {
  return {
    async porUploadId(conversa, chamador, uploadId): Promise<FotoParaAMensagem> {
      // Um `upload_id` malformado não é erro do banco: `uuid` inválido faria o
      // Postgres levantar, e a resposta certa é "não encontrei". O contrato já
      // cobra `format: uuid` na borda; isto é o dobre.
      if (!/^[0-9a-fA-F-]{36}$/.test(uploadId)) return { situacao: 'nao-encontrada' };
      const linha = await construtorDaFotoDoLadoComConta(
        db,
        conversa,
        chamador,
        uploadId,
      ).executeTakeFirst();
      return comoFoto(linha);
    },

    async pelaReferenciaDoAchador(resumo, uploadRef): Promise<FotoParaAMensagem> {
      const linha = await construtorDaFotoDoAchadorSemConta(
        db,
        resumo,
        uploadRef,
      ).executeTakeFirst();
      return comoFoto(linha);
    },
  };
}
