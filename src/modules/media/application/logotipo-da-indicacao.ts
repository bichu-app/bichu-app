/**
 * A autorizacao de envio do LOGOTIPO DA INDICACAO (pedido do cliente,
 * 29/10/2026: *"nao tem o campo do logotipo para o usuario subir e indicar o
 * estabelecimento"*).
 *
 * O backend nunca recebe os bytes: ele assina a autorizacao de envio direto e o
 * app faz o `POST`/`PUT` no armazenamento (ADR-0007). **Nao ha fluxo novo
 * nenhum aqui** -- e o mesmo `ObjectStorage.createUploadIntent` da foto de pet,
 * o mesmo preparador que o painel usa, o mesmo prefixo `directory/` e as mesmas
 * `DERIVADAS_DA_LOGO` da logo do painel.
 *
 * ## IRMA DE `CapaDeEncontroDaComunidade`, E A DIFERENCA E UMA SO
 *
 * Esta classe e `capa-de-encontro-da-comunidade.ts` linha por linha, com UM
 * valor diferente: o proposito. As duas assinam envio de autor `users`, as duas
 * recusam a dimensao declarada antes de assinar, nenhuma das duas grava trilha
 * (autorizar nao e escrita de conteudo, e a intencao que ninguem confirma vence
 * em dez minutos e o varredor a recolhe).
 *
 * **Classe propria e nao um parametro de proposito naquela**, e a razao foi
 * medida neste repositorio: `purpose` e o que amarra o envio ao destino (T9), e
 * um parametro aberto deixaria uma rota do app assinar envio de imagem de
 * produto. `registrarIntencaoDaVitrineDoUsuario` existe pela mesma lição, e o
 * cabecalho dela conta o que custou -- duas funcoes de assinatura identica, a
 * troca compilou, e nenhuma foto de vitrine podia ser salva.
 *
 * ## POR QUE O PROPOSITO E `directory_suggestion_logo` E NAO `directory_logo`
 *
 * **A separacao e a fronteira da fila de revisao, e nao arrumacao de
 * vocabulario.** A indicacao vem de USUARIO, e a imagem de uma indicacao que
 * ninguem aprovou nao pode aparecer em superficie publica.
 *
 * `imagemDoEnvio` em `professionals/application/diretorio-administrativo.ts`
 * exige `purpose = 'directory_logo'` para aceitar um `upload_id` em
 * `professionals.logo_image_id` -- e `professionals` E a superficie publica
 * (`DirectoryEntrySummary`, `DirectoryEntry`). Com um proposito so para os
 * dois, o envio assinado AQUI caberia naquela conferencia, e a logo de uma
 * indicacao pendente entraria numa entrada publicada. A conferencia inversa
 * vale igual: envio do painel nao entra na fila.
 *
 * Isto esta medido nos dois sentidos em
 * `professionals/application/logotipo-da-indicacao-nao-vaza.test.ts`.
 *
 * A assinatura e pedida ANTES de qualquer escrita, e nao dentro de transacao:
 * e chamada de rede a um servico externo, e segurar conexao do banco esperando
 * por ela e o que esgota o pool num pico.
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/**
 * O corpo de `createDirectorySuggestionLogoUploadIntent`, como o contrato o
 * declara.
 *
 * Mesma FORMA de `CorpoDaIntencaoDeCapa`, e interface propria pela mesma razao
 * do esquema proprio no contrato: as duas operacoes tem dimensao minima
 * diferente (256 contra 600) e proposito diferente, e um tipo compartilhado
 * convidaria a compartilhar o resto.
 */
export interface CorpoDaIntencaoDoLogotipo {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDoLogotipoDaIndicacao {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  /**
   * Grava a intencao com autor de `users` e proposito FECHADO no literal. Uma
   * instrucao: nao abre transacao.
   *
   * O `purpose` esta no TIPO, e nao e cerimonia: e ele que faz esta dependencia
   * nao aceitar `registrarIntencaoDeCapaDaComunidade` nem
   * `registrarIntencaoDaVitrineDoUsuario` no lugar dela. Ver o cabecalho de
   * `registrarIntencaoDoLogotipoDaIndicacao`.
   */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
      readonly purpose: typeof PROPOSITO_DO_LOGOTIPO_DA_INDICACAO;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
}

export class LogotipoDaIndicacao {
  constructor(private readonly deps: DependenciasDoLogotipoDaIndicacao) {}

  async autorizar(
    autor: UserId,
    corpo: CorpoDaIntencaoDoLogotipo,
  ): Promise<AutorizacaoDeCapa> {
    // ANTES de assinar, e nao depois: assinar e barato mas a politica vale dez
    // minutos, e nao ha por que entregar uma para um arquivo que ja se sabe
    // pequeno. Quem decide de verdade e o worker, nos bytes.
    recusarDimensaoDeclaradaPequena(
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
      corpo.width,
      corpo.height,
    );
    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
