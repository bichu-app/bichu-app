/* global process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint deste
// repositorio nao declara os globais de Node para `**/*.mjs` fora de `src/`.
/**
 * Quem e a pilha efemera DESTE worktree: nome do projeto e tag das imagens.
 *
 * ===========================================================================
 * POR QUE ISTO E UM MODULO, E NAO DUAS LINHAS DENTRO DE `rodar.mjs`
 * ===========================================================================
 * A isca de isolamento (`isca-de-isolamento.mjs`) precisa produzir a MESMA
 * identidade que a suite produz, para duas arvores diferentes. Se ela
 * recalculasse a regra por conta propria, provaria a copia dela e nao o
 * caminho real: no dia em que `rodar.mjs` mudasse de criterio, a isca
 * continuaria aprovando a regra antiga, em silencio. Um lugar so, importado
 * pelos dois.
 *
 * ===========================================================================
 * AS DUAS DIMENSOES, E POR QUE UMA NAO COBRE A OUTRA
 * ===========================================================================
 * **Projeto** (`-p`) isola o que pertence ao projeto: conteiner, rede e
 * volume nomeado. O compose prefixa os tres com ele.
 *
 * **Tag** isola a IMAGEM, e o projeto nao a alcanca. Imagem nao pertence a
 * projeto nenhum: ela vive no registro local, que e um so para o Docker
 * inteiro da maquina. `docker compose -p a build` e `docker compose -p b
 * build` apontando para `bichu-migrador:integracao` produzem duas imagens e
 * UMA tag, e a segunda arranca a tag da primeira sem aviso.
 *
 * O estrago disso nao e simetrico entre os dois servicos:
 *
 * - `testes` monta `../..` por cima de `/app`, entao o CODIGO executado e
 *   sempre o do worktree, venha a imagem de onde vier.
 * - `migracao` NAO monta nada: o Dockerfile faz `COPY migrations ./migrations`
 *   e o esquema aplicado vem inteiro da imagem.
 *
 * Junte os dois e o resultado e uma suite que roda o teste da sua branch
 * contra o esquema de outra, sem uma linha de erro: migracao a mais nao
 * reprova teste nenhum. So reprova o que depende de coluna que a sua branch
 * ainda nao tem -- e ai o relatorio culpa o codigo.
 *
 * Em 22/09/2026 a tag `bichu-migrador:integracao` trocou de dono treze vezes,
 * a menor folga entre duas trocas sendo de tres segundos.
 *
 * ===========================================================================
 * POR QUE O CAMINHO, E NAO A BRANCH
 * ===========================================================================
 * Caminho e unico por definicao; nome de branch nao (um `git worktree move`
 * muda o caminho sem mudar a branch, e trocar de branch dentro do mesmo
 * worktree muda a branch sem mudar o caminho). O que precisa ser unico e o
 * diretorio de onde a suite roda, porque e ele que carrega o codigo sob teste.
 *
 * O prefixo `bichu-int-` garante, de quebra, que esta pilha nao possa resolver
 * para a pilha principal `bichu` por acidente de nome.
 */
import { createHash } from 'node:crypto';

/**
 * @param {string} raiz caminho absoluto da raiz do worktree (`git rev-parse --show-toplevel`)
 * @returns {{ sufixo: string, projeto: string, tagDaPilha: string }}
 */
export function identidadeDaPilha(raiz) {
  if (typeof raiz !== 'string' || raiz.trim() === '') {
    // Raiz vazia daria um sha1 constante, e um sha1 constante daria a MESMA
    // pilha para todo mundo -- que e exatamente o defeito que este modulo
    // existe para impedir. Reprovar e o unico desfecho aceitavel.
    throw new Error(
      'identidadeDaPilha: a raiz do worktree veio vazia. Sem ela o sufixo seria constante e ' +
        'dois worktrees voltariam a compartilhar projeto e imagem.',
    );
  }
  const sufixo = createHash('sha1').update(raiz).digest('hex').slice(0, 10);
  return { sufixo, projeto: `bichu-int-${sufixo}`, tagDaPilha: `int-${sufixo}` };
}
