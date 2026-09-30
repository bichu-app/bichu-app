/**
 * O apagamento físico dos arquivos de uma conta que vai ser expurgada
 * (SEC-020).
 *
 * ## O defeito que este arquivo fecha
 *
 * `expurgar-contas-excluidas.ts` rodava um `DELETE FROM users` que cascateia
 * por dezoito tabelas e apagava todas as linhas, inclusive as que guardam as
 * chaves dos objetos. Os arquivos no armazenamento não eram tocados: o módulo
 * de expurgo sequer importava `ObjectStorage`. A foto do animal de quem pediu
 * exclusão continuava no balde, e a derivada pública continuava sendo servida.
 *
 * Não é dívida técnica: é o direito de eliminação da LGPD (art. 18, VI, e art.
 * 16) não sendo cumprido.
 *
 * ## Objeto primeiro, linha depois. Sempre.
 *
 * Esta função apaga os OBJETOS. Quem apaga as LINHAS é o expurgo, e só depois
 * que esta função voltou sem erro. A regra não é preferência: é a que o
 * cabeçalho de `varrer-envios-vencidos.ts` já escreveu, e a única novidade é
 * que o expurgo de conta não a seguiu.
 *
 * Se o processo morrer no meio, os dois lados são assimétricos:
 *
 * - **na ordem certa**, o resíduo é linha viva apontando para objeto que já
 *   saiu. A conta está logicamente excluída há 30 dias e ninguém consegue
 *   autenticar nela, então a foto ausente não aparece para ninguém. A rodada
 *   seguinte pega a mesma conta e termina o serviço. Autocurável;
 * - **na ordem inversa**, o resíduo é objeto sem nenhum ponteiro. Ninguém sabe
 *   que ele existe, ninguém sabe de quem era, e só uma varredura do balde
 *   inteiro o encontra. Permanente, e não existe varredura de órfãos em lugar
 *   nenhum deste repositório.
 *
 * ## Até onde o apagamento chega, e o que continua alcançável
 *
 * Removido do balde, o objeto deixa de existir na origem, e qualquer pedido que
 * chegue lá responde 404. Como a chave é CSPRNG de 128 bits e não é derivada de
 * hash do conteúdo (`domain/chave-de-objeto.ts`), não há como redescobrir a
 * URL: quem não a tinha antes nunca mais a obtém.
 *
 * **O que esta função NÃO resolve, e precisa ser dito onde alguém leia.** As
 * derivadas públicas são servidas com `max-age=31536000, immutable`, que é um
 * ano, e o ADR-0014 decidiu explicitamente que não existe operação de
 * invalidação neste desenho. Quem já tem a URL exata e tem uma cópia em cache
 * continua conseguindo ver a imagem por até 12 meses depois de apagarmos, e não
 * há API de purga no caminho.
 *
 * A frase honesta para um titular é esta, e é ela que deve ser copiada:
 * *apagamos o arquivo do nosso armazenamento em até 30 dias, e a partir daí ele
 * não é mais obtido por ninguém que não o tivesse antes; uma cópia que já tenha
 * sido baixada ou que esteja em cache intermediário pode permanecer acessível a
 * quem possua o endereço exato por até 12 meses, e não temos meio de forçar a
 * remoção dessa cópia.*
 *
 * **Não escreva "apagamos completamente".** Seria falso.
 */
import type { UserId } from '../../../shared/types/brands.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';

export interface DependenciasDoApagamentoDeObjetos {
  readonly repositorio: Pick<MediaRepository, 'chavesDaConta'>;
  readonly armazenamento: ObjectStorage;
}

/**
 * A função estreita que o expurgo recebe por injeção.
 *
 * Estreita, e não a porta inteira, porque `identity` não importa `media` e a
 * fronteira é do ADR-0008. É o mesmo arranjo de `removerPushDaConta`, e pelo
 * mesmo motivo.
 *
 * Devolve quantos objetos saíram, para a trilha. Zero é sucesso: conta sem foto
 * nenhuma é o caso comum.
 *
 * **A falha PROPAGA.** Quem chama conta a conta como falha e NÃO apaga as
 * linhas dela, então a rodada seguinte tenta de novo com os ponteiros ainda de
 * pé. Engolir o erro aqui apagaria a conta com o arquivo no balde e sem
 * nenhum ponteiro — que é exatamente o estado permanente que a ordem certa
 * existe para não produzir.
 */
export function criarApagadorDeObjetosDaConta(
  deps: DependenciasDoApagamentoDeObjetos,
): (dono: UserId) => Promise<number> {
  return async (dono: UserId): Promise<number> => {
    const objetos = await deps.repositorio.chavesDaConta(dono);
    for (const objeto of objetos) {
      // O `delete` da porta trata 404 como sucesso (`s3-object-storage.ts`), e
      // é isso que torna a repetição segura: uma rodada que morreu no meio
      // reapaga o que já saiu sem erro nenhum.
      await deps.armazenamento.delete(objeto.classe, objeto.chave);
    }
    return objetos.length;
  };
}
