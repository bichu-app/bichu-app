/**
 * A assinatura da URL de leitura da foto da conversa, como a BORDA precisa dela.
 *
 * ## Por que é uma função e não a porta `ObjectStorage` inteira
 *
 * `media/ports/object-storage.ts` declara oito operações, e seis delas escrevem
 * ou leem bytes. Entregá-la às rotas da conversa daria à borda da conversa o
 * poder de `put`, `delete` e `get` — e uma rota HTTP deste produto não lê bytes
 * de foto nem apaga objeto, está escrito na própria porta ("só o worker").
 *
 * Uma função de um argumento dá à borda exatamente o que ela faz: transformar
 * uma chave que já está gravada numa URL que o aparelho baixa. A classe do
 * balde (`privado`) e a validade não são escolha de quem chama — elas são
 * decisão, e moram na fiação (`bin/api.ts`) ao lado do número e do motivo
 * (`domain/leitura-da-foto.ts`).
 *
 * ## A chave é `string`, e não `ObjectKey`
 *
 * Pela mesma razão de `MensagemGravada.photoObjectKey`: a marca só é emitida por
 * `comoObjectKey`, que mora no domínio de `media`, e um módulo não enxerga o
 * domínio de outro (§6). Quem converte é o adaptador na fiação, que já está do
 * lado de `media`.
 *
 * ## O que ela NÃO faz
 *
 * Não decide SE a foto pode ser servida. Essa decisão já aconteceu duas vezes
 * antes: no `WHERE` da leitura da conversa (que é o que recorta a conversa para
 * o chamador) e na invariante da escrita, que garante que a chave gravada é a da
 * derivada higienizada e nunca a do original
 * (`ports/foto-da-conversa.ts`). Chave presente significa chave limpa, e é por
 * isso que esta função pode ser cega.
 */
import type { AbsoluteUrl } from '../../../shared/types/brands.js';

export type AssinadorDeFoto = (chave: string) => Promise<AbsoluteUrl>;
