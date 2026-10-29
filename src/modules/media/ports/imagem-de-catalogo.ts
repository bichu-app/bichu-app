/**
 * A imagem de catalogo, como os outros modulos a enxergam (ADR-0027 item 10).
 *
 * Duas portas, porque sao dois atos separados no tempo e no lugar:
 *
 * - `PreparadorDeEnvioDeCatalogo` assina a politica de envio direto. E chamada
 *   de rede a um servico externo, e roda FORA de transacao.
 * - `RegistroDeImagemDeCatalogo` grava a intencao, acha o envio e o confirma.
 *   Recebe o executor de quem chama porque a confirmacao e a propria escrita do
 *   item (ou do encontro), e precisa estar na MESMA transacao dela e da trilha:
 *   um repositorio com transacao propria confirmaria a imagem de um item que
 *   depois nao foi gravado.
 *
 * `purpose` e o que amarra o envio ao destino (T9): a escrita do item so aceita
 * `store_item`, e a do encontro so aceitara `network_event`.
 */
import { problemas } from '../../../shared/http/errors.js';
import { TIPOS_ACEITOS, comoObjectKey, type CategoriaDeCatalogo } from '../domain/chave-de-objeto.js';

/**
 * A ÚNICA porta pela qual outro módulo obtém a marca `ObjectKey`.
 *
 * A marca é emitida por `comoObjectKey`, que mora em `media/domain` — e a
 * fronteira da arquitetura proíbe um módulo de importar `domain/` alheio. Sem
 * esta reexportação, quem precisasse da marca teria duas saídas, e as duas são
 * piores: copiar a conferência (duas regras que concordam por enquanto) ou usar
 * `as ObjectKey` sobre texto vindo de `SELECT` — que é exatamente o defeito da
 * BICHUS-134, porque o `pathname` de uma URL RESOLVE `..` e uma chave como
 * `card/../../x` sai do prefixo e do balde.
 *
 * Reexportar, e não reimplementar: a conferência continua tendo um dono só.
 */
export { comoObjectKey };
import { TETO_DE_BYTES_DO_ENVIO } from '../domain/derivadas.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { Instant, ObjectKey } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio } from './object-storage.js';

/**
 * Os propositos da esteira.
 *
 * Os TRES ultimos entraram em 18/10/2026, por pedido do cliente: a logo e a foto
 * do profissional recomendado, enviadas pelo ADMINISTRADOR no painel, e a foto
 * que a PROPRIA PESSOA cadastra. Sao propositos nesta esteira e nao uma segunda
 * esteira, porque teto de bytes, formato de saida, higiene de EXIF, escada de
 * qualidade e varredura de vencidos ja moram aqui -- e uma copia deles seria
 * cinco regras concordando por enquanto.
 *
 * **`user_photo` e o SEGUNDO proposito com autor de `users`**, depois da capa do
 * encontro da comunidade (ADR-0025 emenda 3): `catalog_upload_intents.user_id`
 * ja existe e o `CHECK catalog_upload_intents_um_autor` continua impondo
 * exatamente um autor.
 */
export type PropositoDaImagem =
  | 'store_item'
  | 'network_event'
  | 'directory_logo'
  | 'directory_photo'
  // A GALERIA da entrada do diretorio (29/10/2026, decisao do cliente:
  // *"implemente a tabela de galeria entao"*). O OITAVO, e SEPARADO de
  // `directory_photo` pelo MESMO criterio que separou `user_showcase` de
  // `user_photo` na `20261018000040`: aquele e a foto UNICA do lugar, com duas
  // derivadas (`banner` e `card`), e esta e a galeria de ate oito, que precisa
  // TAMBEM da miniatura de 480 x 360 que a faixa da galeria desenha. Um
  // proposito so para os dois obrigaria a derivada a adivinhar qual tela vai
  // desenhar a imagem.
  //
  // O autor continua sendo `admin_account_id`: quem sobe e o administrador no
  // painel, como na logo e na foto.
  | 'directory_gallery'
  // O LOGOTIPO DA INDICACAO (29/10/2026, pedido do cliente: *"nao tem o campo
  // do logotipo para o usuario subir e indicar o estabelecimento"*). O NONO.
  //
  // **SEPARADO de `directory_logo`, e esta separacao e uma FRONTEIRA e nao uma
  // geometria.** Os outros propositos se separam por derivada: `user_showcase`
  // de `user_photo` pela grade, `directory_gallery` de `directory_photo` pela
  // miniatura. Este nao -- ele usa `DERIVADAS_DA_LOGO`, a MESMA constante de
  // `directory_logo`, porque e o mesmo quadrado ao lado do mesmo nome.
  //
  // O que o separa e O AUTOR e O DESTINO. `purpose` e o que amarra o envio ao
  // destino (T9), e `imagemDoEnvio` em
  // `professionals/application/diretorio-administrativo.ts` exige
  // `directory_logo` para aceitar um `upload_id` em
  // `professionals.logo_image_id` -- e `professionals` E a superficie publica
  // (`DirectoryEntrySummary`, `DirectoryEntry`). Com UM proposito para os dois,
  // um envio de usuario caberia naquela conferencia e **a logo de uma indicacao
  // que ninguem aprovou chegaria ao `Perto`**, que e exatamente o que a fila de
  // revisao existe para impedir.
  //
  // O autor e `user_id`, como `network_event`, `user_photo`, `user_showcase` e
  // `user_publication` -- e nunca `admin_account_id`.
  | 'directory_suggestion_logo'
  | 'user_photo'
  // A VITRINE de fotos do usuario (18/10/2026). Proposito SEPARADO de
  // `user_photo`, e nao o mesmo: aquele e a foto UNICA do perfil, este sao as
  // ate nove fotos da vitrine, com geometria propria (a grade pede 320 px) e
  // tabela de ordem propria (`user_showcase_images`). Um proposito so para os
  // dois obrigaria a derivada a adivinhar qual tela vai desenhar a imagem.
  | 'user_showcase'
  // A FOTO DE UMA PUBLICACAO DO MURAL (20/10/2026). O SETIMO, e separado de
  // `user_showcase` pelo MESMO critério que separou aquele de `user_photo`: a
  // vitrine e uma grade de ate nove no perfil, com ordem e capa, e esta e UMA
  // foto presa a UM texto, sem ordem. A consequencia esta na geometria -- a
  // vitrine tem DUAS derivadas (`thumb` 320 para a grade e `card` 1024 para a
  // foto aberta) e esta tem UMA (`card` 1024), porque nao ha grade no Mural.
  | 'user_publication';

/**
 * O proposito do LOGOTIPO DA INDICACAO, num ponto so.
 *
 * **Mora na PORTA e nao no caso de uso, e isso nao e arrumacao: e a fronteira
 * de modulo.** `professionals` precisa deste valor -- e a escrita da indicacao
 * que confere o proposito na clausula `WHERE` --, e a regra
 * `arquitetura/fronteira-de-modulo` do `eslint` **reprova** import de
 * `media/application/` por outro modulo. Modulo so conversa com modulo por
 * porta, e foi o linter que apontou isto: a primeira versao declarava a
 * constante em `media/application/logotipo-da-indicacao.ts` e dois arquivos de
 * `professionals` a importavam de la.
 *
 * Exportado e usado pelos TRES lados -- quem assina (`LogotipoDaIndicacao`),
 * quem grava a intencao (`registrarIntencaoDoLogotipoDaIndicacao`) e quem a
 * confirma (`kysely-directory-suggestion-repository`) --, pela mesma razao que
 * `PROPOSITO_DA_VITRINE` existe: **dois literais em dois arquivos foi
 * exatamente o que divergiu em 18/10/2026**, e nenhum teste de unidade viu.
 */
export const PROPOSITO_DO_LOGOTIPO_DA_INDICACAO = 'directory_suggestion_logo' as const;

/** O prefixo do armazenamento de cada proposito (ADR-0007 Emenda 1). */
export const CATEGORIA_DO_PROPOSITO: Readonly<Record<PropositoDaImagem, CategoriaDeCatalogo>> = {
  store_item: 'products',
  network_event: 'events',
  // UM prefixo para as duas imagens do diretorio: sao da mesma entidade.
  directory_logo: 'directory',
  directory_photo: 'directory',
  // A galeria divide `directory/` com a logo e a foto, e pela MESMA razao: as
  // tres sao imagem da mesma entidade. Prefixo separado faria o expurgo e a
  // varredura terem tres listas para varrer.
  directory_gallery: 'directory',
  // O logotipo da indicacao divide `directory/` com a logo, a foto e a galeria,
  // e pela mesma razao: as quatro sao imagem de uma entidade do diretorio.
  // Prefixo separado faria o expurgo e a varredura terem quatro listas para
  // varrer. **O prefixo nao e a fronteira** -- a fronteira e o `purpose`, e
  // dividir o prefixo nao abre caminho nenhum: `imagemDoEnvio` confere
  // proposito, nao prefixo.
  directory_suggestion_logo: 'directory',
  // Prefixo PROPRIO para foto de pessoa: regime de privacidade diferente.
  user_photo: 'people',
  // A vitrine divide `people/` com a foto unica, e de proposito: as duas sao
  // imagem da MESMA pessoa e somem juntas no expurgo da conta. Prefixo
  // separado faria o expurgo ter duas listas para varrer.
  user_showcase: 'people',
  // A foto da PUBLICACAO divide o mesmo `people/`, pela mesma razao e com mais
  // peso: as TRES sao imagem da mesma pessoa, e um terceiro prefixo faria o
  // expurgo ter tres listas para varrer.
  user_publication: 'people',
};

/**
 * JPEG, PNG e WebP. **SVG nunca** (D50), e HEIC tambem nao: a origem e um
 * computador de mesa (`AdminCatalogImageIntentInput.content_type`).
 */
export const TIPOS_DE_IMAGEM_DE_CATALOGO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
/**
 * A lista de ENTRADA de cada proposito, e por que ela nao e uma so.
 *
 * O que o administrador envia sai de um computador de mesa, e a lista de tres
 * tipos vale para ele desde o ADR-0027. **A foto do proprio usuario sai de um
 * celular**, e metade dos celulares e iPhone, que grava HEIC. O cliente
 * autorizou HEIC na entrada por causa disso, em 18/10/2026, e a conversao para
 * JPEG continua sendo nossa, no servidor (`FORMATO_DAS_DERIVADAS`).
 *
 * Recusar HEIC na entrada da foto de perfil nao protegeria nada: tiraria o
 * recurso da mao de quem usa iPhone e deixaria a pessoa achando que a foto dela
 * "nao e imagem". `TIPOS_ACEITOS` (`domain/chave-de-objeto.ts`) e a MESMA lista
 * que a foto de pet usa, e e dela que este mapa tira o valor -- duas listas dos
 * mesmos quatro tipos e o defeito esperando a quinta.
 *
 * **SVG continua fora das duas**, por igualdade e nunca por prefixo de
 * `image/`: SVG e documento com script.
 */
export const TIPOS_POR_PROPOSITO: Readonly<Record<PropositoDaImagem, readonly string[]>> = {
  store_item: TIPOS_DE_IMAGEM_DE_CATALOGO,
  network_event: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_logo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_photo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  // A galeria sai do MESMO computador de mesa que a logo e a foto: a lista de
  // tres tipos, sem HEIC. A constante, e nao a lista escrita de novo.
  directory_gallery: TIPOS_DE_IMAGEM_DE_CATALOGO,
  // **TRES TIPOS, SEM HEIC, e o custo e de quem usa iPhone.** Este e o unico
  // proposito de autor `user_id` que NAO usa `TIPOS_ACEITOS`, e a excecao nao e
  // descuido: a esteira de catalogo nao decodifica HEIC, e e ela que processa
  // esta imagem. A capa do encontro (`network_event`) paga o mesmo custo pelo
  // mesmo motivo. Alargar para `TIPOS_ACEITOS` aqui faria a rota assinar uma
  // politica para um arquivo que o worker vai recusar depois do envio -- pior
  // que recusar antes, porque os bytes ja subiram.
  directory_suggestion_logo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  user_photo: TIPOS_ACEITOS,
  // A VITRINE sai do mesmo celular que a foto unica, entao a MESMA lista --
  // `TIPOS_ACEITOS`, com HEIC. Reusar e nao repetir: duas listas dos mesmos
  // quatro tipos e o defeito esperando o quinto.
  user_showcase: TIPOS_ACEITOS,
  // A foto da PUBLICACAO sai do MESMO celular. A mesma lista, pela terceira
  // vez, e sempre a mesma constante.
  user_publication: TIPOS_ACEITOS,
};

/**
 * O teto do envio, reexportado do PONTO ÚNICO (`domain/derivadas.ts`).
 *
 * Era 5 MiB escrito aqui, 10 MiB na foto de pet e 2 MiB na do achado. O cliente
 * unificou em 5 MB em 17/10/2026, **para usuário e administrador**, e o número
 * passou a ter um dono só.
 */
export const TETO_DE_BYTES_DO_CATALOGO = TETO_DE_BYTES_DO_ENVIO;

/**
 * A dimensao minima por proposito (`AdminCatalogImageIntentInput.byte_size`).
 * Conferida duas vezes: a DECLARADA no pedido de envio (`width`/`height`,
 * opcionais), recusada com `422 image-too-small` antes de assinar; e a REAL,
 * que o worker confere nos bytes e recusa com o motivo, porque a declarada vem
 * do navegador e pode mentir.
 *
 * O encontro era 1600 x 900 e passou a 600 x 600 a pedido do cliente (01/10):
 * a foto que o organizador tem costuma ser de celular, quadrada ou retrato.
 */
export const DIMENSAO_MINIMA: Readonly<Record<PropositoDaImagem, { largura: number; altura: number }>> = {
  store_item: { largura: 800, altura: 800 },
  network_event: { largura: 600, altura: 600 },
  // A LOGO e a excecao mais baixa, e o motivo e o arquivo que a entidade TEM:
  // logo de clinica de bairro costuma ser um PNG de 300 px que saiu de um
  // cartao de visita. Exigir 600 reprovaria a logo real da maioria das entradas
  // e o administrador nao tem como produzir outra. 256 e o piso em que a
  // derivada `card` de 512 ainda fica aceitavel sem ampliar (`sharp` nao
  // amplia), e abaixo disso o simbolo aparece mole ao lado do nome.
  directory_logo: { largura: 256, altura: 256 },
  // A foto do LUGAR usa 600 x 600, o mesmo numero que o cliente aceitou para a
  // capa do encontro em 01/10: as duas sao foto de celular de um lugar.
  directory_photo: { largura: 600, altura: 600 },
  // A GALERIA usa os MESMOS 600 x 600 da foto do lugar, e nao um numero novo:
  // as duas sao foto de celular de um lugar, e a maior derivada das duas e a
  // mesma (`banner` 1280 x 720). `sharp` nao amplia (`withoutEnlargement`),
  // entao o piso que faz a `banner` se preencher e identico. Numeros diferentes
  // para a mesma geometria e o que ninguem consegue explicar depois.
  directory_gallery: { largura: 600, altura: 600 },
  // O LOGOTIPO DA INDICACAO usa os MESMOS 256 x 256 de `directory_logo`, e nao
  // um numero novo: e a mesma imagem (a marca, num quadrado ao lado do nome), a
  // maior derivada e a mesma (`card` 512) e `sharp` nao amplia. O argumento
  // inteiro esta escrito em `directory_logo` acima -- logo de clinica de bairro
  // costuma ser um PNG de 300 px que saiu de um cartao de visita, e exigir 600
  // reprovaria a logo real da maioria. Numeros diferentes para a mesma
  // geometria e o que ninguem consegue explicar depois.
  directory_suggestion_logo: { largura: 256, altura: 256 },
  // 300 x 300 na foto de pessoa, e nao 600. A maior derivada dela e 512, e
  // retrato recortado de uma foto antiga ou de uma captura de tela chega perto
  // disso; recusar a 500 px entregaria "sua foto nao serve" a quem tem a unica
  // foto que tem. Abaixo de 300 o rosto aparece borrado na propria moldura.
  user_photo: { largura: 300, altura: 300 },
  // 600 x 600 na VITRINE, e nao os 300 da foto unica. O numero nao e outro por
  // capricho: a maior derivada da foto unica e 512, e a da vitrine e **1024**
  // (a foto aberta). `sharp` nao amplia (`withoutEnlargement`), entao abaixo de
  // 600 a `card` de 1024 sai sem se preencher. E o mesmo raciocinio de
  // `DIMENSAO_MINIMA_DA_FOTO_DE_PET`, que tem a mesma derivada de 1024 e o
  // mesmo 600 -- numeros diferentes para a mesma geometria e o que ninguem
  // consegue explicar depois.
  user_showcase: { largura: 600, altura: 600 },
  // 600 x 600 na PUBLICACAO, pelo MESMO raciocinio da vitrine e nao por copia:
  // a maior (e unica) derivada desta foto e `card` 1024, `sharp` nao amplia
  // (`withoutEnlargement`), e abaixo de 600 ela sai sem se preencher. O numero
  // bater com o da vitrine, da capa do encontro e da foto de pet e o ponto --
  // numeros diferentes para a mesma geometria e o que ninguem consegue
  // explicar depois.
  user_publication: { largura: 600, altura: 600 },
};

/**
 * Os campos da dimensao declarada que ficam abaixo da minima do proposito.
 * Lista vazia e "passa", inclusive quando nada foi declarado: a declaracao e
 * opcional e o worker continua sendo quem decide nos bytes.
 */
export function dimensaoDeclaradaAbaixoDaMinima(
  purpose: PropositoDaImagem,
  largura: number | undefined,
  altura: number | undefined,
): readonly ('width' | 'height')[] {
  const minima = DIMENSAO_MINIMA[purpose];
  const campos: ('width' | 'height')[] = [];
  if (largura !== undefined && largura < minima.largura) campos.push('width');
  if (altura !== undefined && altura < minima.altura) campos.push('height');
  return campos;
}

/**
 * Recusa a dimensao DECLARADA abaixo da minima do proposito, com
 * `422 image-too-small` -- e esta e a UNICA redacao desta recusa.
 *
 * ## O que foi medido, e por que isto virou funcao
 *
 * Em 21/10/2026, sobre `f60ba3fc`, este bloco estava escrito **cinco vezes**:
 * em `capa-de-encontro-da-comunidade.ts`, `foto-do-proprio-usuario.ts`,
 * `mural-service.ts`, `vitrine-de-fotos-service.ts` e
 * `catalogo-administrativo.ts`. Normalizando so a EXPRESSAO do proposito (que
 * e a unica coisa que legitimamente muda entre os cinco), as cinco copias sao
 * identicas em execucao -- a unica diferenca de texto era uma virgula de
 * formatacao em `mural-service.ts`.
 *
 * Nao e duplicacao de enfeite: dentro do bloco esta a FRASE que o usuario le
 * (`Mínimo de N pixels.`) e o CODIGO de campo (`minimum`) que o app usa para
 * decidir onde pintar o erro. Cinco redacoes da mesma frase e como se chegou
 * as cinco do rotulo do selo: a sexta superficie copia a que estava mais perto.
 *
 * ## A conferencia e a DECLARADA, e nao a real
 *
 * `width`/`height` sao opcionais e vem do navegador, que pode mentir. Quem
 * decide de verdade e o worker, lendo os bytes. Esta recusa existe para nao
 * assinar uma politica valida por dez minutos para um arquivo que ja se sabe
 * ruim -- por isso ela roda ANTES de `preparar`, em todos os cinco chamadores.
 */
export function recusarDimensaoDeclaradaPequena(
  purpose: PropositoDaImagem,
  largura: number | undefined,
  altura: number | undefined,
): void {
  const abaixo = dimensaoDeclaradaAbaixoDaMinima(purpose, largura, altura);
  if (abaixo.length === 0) return;
  const minima = DIMENSAO_MINIMA[purpose];
  throw problemas.imagemPequenaDemais(
    minima,
    abaixo.map((field) => ({
      field,
      code: 'minimum',
      message: `Mínimo de ${String(field === 'width' ? minima.largura : minima.altura)} pixels.`,
    })),
  );
}

/**
 * Dez minutos, o numero do ADR-0027 item 10. A foto do pet tem cinco porque sai
 * de um celular e a historia dela fixou cinco; esta sai de um computador de
 * mesa, e o ADR fixou dez.
 */
export const VALIDADE_DA_INTENCAO_DE_CATALOGO_EM_SEGUNDOS = 600;

export interface EnvioPreparado {
  readonly uploadId: string;
  readonly chave: ObjectKey;
  readonly contentType: string;
  readonly maxBytes: number;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface PreparadorDeEnvioDeCatalogo {
  /** Recusa com 415 o tipo fora da lista, por IGUALDADE (SVG inclusive). */
  preparar(contentType: string, byteSize: number, proposito: PropositoDaImagem): Promise<EnvioPreparado>;
}

/** O que a rota devolve: o `upload_id` e a autorizacao assinada. */
export interface AutorizacaoDeCapa {
  readonly uploadId: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface NovaIntencaoDeCatalogo {
  readonly id: string;
  /**
   * `admin_accounts.id`: o envio do PAINEL.
   *
   * O envio da comunidade (a capa do encontro, ADR-0025 emenda 3) grava
   * `user_id` em vez desta coluna, por `registrarIntencaoDeCapaDaComunidade`:
   * o `CHECK catalog_upload_intents_um_autor` garante exatamente um autor.
   */
  readonly adminAccountId: string;
  readonly purpose: PropositoDaImagem;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface EnvioDeCatalogo {
  readonly id: string;
  readonly kind: string;
  readonly purpose: PropositoDaImagem | null;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  /** A imagem que ja nasceu deste envio, quando ele ja foi confirmado. */
  readonly catalogImageId: string | null;
}

export interface ConfirmacaoDeCatalogo {
  readonly imagemId: string;
  readonly trabalhoId: string;
  readonly envioId: string;
  readonly purpose: PropositoDaImagem;
  readonly agora: Instant;
}

/** O job que o worker trata. Mesmo prefixo de `media.process_upload`. */
export const TRABALHO_DE_IMAGEM_DE_CATALOGO = 'media.process_catalog_image' as const;

export interface RegistroDeImagemDeCatalogo {
  registrarIntencao(db: DbExecutor, nova: NovaIntencaoDeCatalogo): Promise<void>;
  /**
   * O envio, com trava de linha: duas escritas com o mesmo `upload_id` nao
   * podem as duas acha-lo aberto e criar duas imagens. `null` quando nao existe
   * ou o id nao e UUID.
   */
  envio(db: DbExecutor, uploadId: string): Promise<EnvioDeCatalogo | null>;
  /** Imagem em `processing`, envio confirmado e trabalho enfileirado, os tres juntos. */
  confirmar(db: DbExecutor, entrada: ConfirmacaoDeCatalogo): Promise<void>;
}

/** A imagem como o worker precisa dela: a chave do original, e nada que sirva de resposta. */
export interface ImagemParaProcessar {
  readonly id: string;
  readonly purpose: PropositoDaImagem;
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly originalKey: ObjectKey;
}

/** O que o processamento da imagem de catalogo le e grava. Sem transacao de fora. */
/**
 * As chaves das derivadas de uma imagem de catalogo.
 *
 * `card` sempre; `thumb` e `banner` so no encontro da comunidade, porque e a
 * UNICA imagem que a mesma tela desenha em tres tamanhos muito diferentes (144
 * dp na galeria, ~328 dp no cartao da agenda, 360 a 430 dp de borda a borda no
 * detalhe). A imagem de produto da Loja tem uma derivada so: nao medi aquela
 * tela, e inventar duas proporcoes para ela seria supor.
 */
export interface ChavesDaImagemDeCatalogo {
  readonly card: ObjectKey;
  readonly thumb?: ObjectKey;
  readonly banner?: ObjectKey;
}

export interface ImagensDeCatalogoDoWorker {
  paraProcessar(imagemId: string): Promise<ImagemParaProcessar | null>;
  /** So a partir de `processing`: estado final nao volta. */
  marcarPronta(imagemId: string, chaves: ChavesDaImagemDeCatalogo): Promise<void>;
  marcarRecusada(imagemId: string, motivo: string): Promise<void>;
}
