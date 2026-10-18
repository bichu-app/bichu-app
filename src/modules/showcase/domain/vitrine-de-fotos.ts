/**
 * A VITRINE DE FOTOS DO USUÁRIO, as regras que não dependem de banco nem de
 * HTTP (pedido do cliente de 18/10/2026: *"vitrine de fotos, parecido com
 * instagram"*).
 *
 * ## O teto é cobrado DUAS vezes, e as duas são de propósito
 *
 * O banco cobra nove pelo `CHECK (position BETWEEN 0 AND 8)` somado à
 * unicidade por conta (`user_showcase_images`). **Este arquivo cobra antes**, e
 * a razão não é zelo: uma violação de restrição chega ao cliente como erro de
 * banco, sem campo e sem motivo, e a tela não tem como dizer "você já tem nove
 * fotos". Dois lugares conferindo o MESMO número (`TETO_DE_FOTOS_DA_VITRINE`,
 * do ponto único em `derivadas.ts`) é o desenho; dois números é o defeito.
 *
 * ## Pedir uma, aceitar nove, nunca cobrar as nove
 *
 * Não existe mínimo. Vitrine com uma foto é estado válido e completo, e `[]` é
 * estado válido também — é assim que se tira todas. Da terceira foto em diante
 * o ganho medido é perto de zero, então nada aqui empurra a pessoa para a nona.
 *
 * ## A ESCRITA É DECLARATIVA, e isso não é preferência de estilo
 *
 * O corpo manda a vitrine INTEIRA, na ordem. É o mesmo desenho das duas
 * galerias da casa (`CatalogImagesInput`: *"a ordem nova, remover e omitir, e
 * `images: []` tira todas"*), e ele resolve de uma vez quatro operações que
 * como rotas separadas seriam quatro: acrescentar, reordenar, **trocar a capa**
 * e remover. A capa é a posição 0 — reordenar troca a capa, e é por isso que
 * não existe nem coluna nem campo `is_cover` para divergir da ordem.
 *
 * A posição é o ÍNDICE no vetor, e nunca um número que o cliente manda. Deixar
 * o cliente escolher `position` permitiria buraco (0, 1, 7) e empate, e a
 * unicidade diferida só reclamaria no fim da transação.
 *
 * ## O que está FORA, e cada ausência é deliberada
 *
 * Legenda, curtida, contador e **marcar pessoa**. O último é dado biométrico, e
 * a recomendação registrada é recusar para sempre — não há campo, não há
 * tabela, e não é omissão a ser preenchida depois.
 *
 * `alt_text` **não é legenda**: é o rótulo que o leitor de tela anuncia, é
 * opcional, e nunca é desenhado como texto na grade.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';

/**
 * O TETO DE FOTOS DA VITRINE: nove.
 *
 * **Pedir uma, aceitar nove, nunca cobrar as nove.** A vitrine com uma foto é
 * estado válido e completo; da terceira em diante o ganho medido é perto de
 * zero. Nenhuma regra exige a segunda, e `[]` também é estado válido.
 *
 * ## Por que o número mora AQUI, e não em `derivadas.ts`
 *
 * `derivadas.ts` é o ponto único do **tratamento de imagem** — teto de bytes,
 * formato de saída, faixa e geometria. **Quantas fotos uma vitrine tem não é
 * tratamento de imagem**: é regra deste domínio, e muda por decisão de produto
 * sem que um único pixel mude. É o mesmo lugar em que a casa já guarda o
 * irmão deste número: `TETO_DE_FOTOS_POR_ACHADO = 3` mora em
 * `found/application/found-report-service.ts`, e não na esteira.
 *
 * O banco cobra o mesmo nove pelo `CHECK (position BETWEEN 0 AND 8)` somado à
 * unicidade por conta (`user_showcase_images`, migração `20261018000011`). Dois
 * lugares conferindo o MESMO número é o desenho — o servidor para a resposta
 * ter campo e motivo, o banco para não existir caminho que o contorne. Dois
 * NÚMEROS diferentes é o defeito, e é por isso que este nome é exportado e o
 * teste o lê daqui em vez de escrever `9`.
 */
export const TETO_DE_FOTOS_DA_VITRINE = 9;

/** De 2 a 150 caracteres, o mesmo intervalo do `CHECK` e das outras galerias. */
const MINIMO_DO_TEXTO_ALTERNATIVO = 2;
const MAXIMO_DO_TEXTO_ALTERNATIVO = 150;

/** U+202A a U+202E e U+2066 a U+2069: invertem a ordem de exibição do texto. */
const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uma foto como o corpo da escrita a declara. */
export interface FotoPedidaNaVitrine {
  readonly upload_id: string;
  readonly alt_text?: string | null;
}

/** Uma foto como a transação a grava: posição já resolvida pelo índice. */
export interface FotoDaVitrineParaGravar {
  readonly uploadId: string;
  readonly position: number;
  readonly altText: string | null;
}

/**
 * Confere a vitrine pedida e devolve as linhas a gravar, em ordem.
 *
 * **Lança `problemas.validacao` com o campo apontado**, e não um booleano: o
 * motivo é a tela — "você já tem nove fotos" e "essa foto está repetida" são
 * consertos diferentes, e um `false` não distingue os dois.
 *
 * A ordem das conferências importa: o TETO primeiro, porque é o erro que a
 * pessoa consegue consertar sozinha e o que ela mais vai encontrar; depois a
 * forma de cada item.
 */
export function conferirVitrinePedida(
  fotos: readonly FotoPedidaNaVitrine[],
): readonly FotoDaVitrineParaGravar[] {
  // O TETO, NO SERVIDOR. A tela também o cobra, e isso não basta: o cliente é
  // quem o chamador controla, e uma décima foto aceita aqui só falharia no
  // `CHECK` do banco, como erro sem campo e sem motivo.
  if (fotos.length > TETO_DE_FOTOS_DA_VITRINE) {
    throw problemas.validacao([
      {
        field: 'photos',
        code: 'maximum',
        message: `No máximo ${String(TETO_DE_FOTOS_DA_VITRINE)} fotos na vitrine.`,
      },
    ]);
  }

  const erros: ProblemFieldError[] = [];
  const vistos = new Set<string>();
  const paraGravar: FotoDaVitrineParaGravar[] = [];

  fotos.forEach((foto, indice) => {
    const campo = `photos[${String(indice)}].upload_id`;
    if (typeof foto.upload_id !== 'string' || !FORMA_DE_UUID.test(foto.upload_id)) {
      erros.push({ field: campo, code: 'format', message: 'O envio não tem a forma de um identificador.' });
      return;
    }
    // REPETIDO é recusa, e não "a última ganha": a mesma imagem em duas
    // posições violaria a unicidade de `image_id` dentro da transação, e
    // escolher silenciosamente uma delas gravaria uma vitrine diferente da
    // pedida — com uma foto a menos do que a pessoa vê na tela.
    if (vistos.has(foto.upload_id.toLowerCase())) {
      erros.push({ field: campo, code: 'duplicate', message: 'Essa foto aparece duas vezes.' });
      return;
    }
    vistos.add(foto.upload_id.toLowerCase());

    const rotulo = foto.alt_text;
    let altText: string | null = null;
    if (typeof rotulo === 'string' && rotulo.trim() !== '') {
      const campoDoTexto = `photos[${String(indice)}].alt_text`;
      if (CONTROLE_BIDIRECIONAL.test(rotulo)) {
        erros.push({
          field: campoDoTexto,
          code: 'bidi_control',
          message: 'O texto tem um caractere de controle de direção.',
        });
        return;
      }
      const tamanho = [...rotulo.trim()].length;
      if (tamanho < MINIMO_DO_TEXTO_ALTERNATIVO || tamanho > MAXIMO_DO_TEXTO_ALTERNATIVO) {
        erros.push({
          field: campoDoTexto,
          code: 'length',
          message: `De ${String(MINIMO_DO_TEXTO_ALTERNATIVO)} a ${String(MAXIMO_DO_TEXTO_ALTERNATIVO)} caracteres.`,
        });
        return;
      }
      altText = rotulo.trim();
    }

    // A POSIÇÃO É O ÍNDICE, e nunca um número que o cliente mandou: assim não
    // há buraco nem empate a resolver, e `0` — a CAPA — é sempre a primeira do
    // vetor que chegou.
    paraGravar.push({ uploadId: foto.upload_id, position: indice, altText });
  });

  if (erros.length > 0) throw problemas.validacao(erros);
  return paraGravar;
}
