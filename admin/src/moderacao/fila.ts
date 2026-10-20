/**
 * O vocabulario da FILA DE MODERACAO no painel, em pasta propria.
 *
 * ## Pasta nova, e nao linhas em outro modulo
 *
 * Doze frentes mexem neste repositorio ao mesmo tempo, e `admin/src/diretorio/`
 * e `admin/src/rede/` estao sendo trabalhados por outras. Modulo novo em pasta
 * nova faz a mescla ser limpa, e e o mesmo arranjo -- e o mesmo motivo -- de
 * `plaquinhas/fila.ts` e de `diretorio/fila.ts`.
 *
 * ## A TELA NAO DECIDE NADA
 *
 * [erroDoMotivo] existe para a tela nao OFERECER o que o servidor vai recusar,
 * e nao para substituir a recusa. Quem decide e o caso de uso, com trava de
 * linha sobre as denuncias; se esta funcao for apagada, a escrita continua
 * recusada, so que depois do clique.
 */
import { useCallback, useEffect, useState } from 'react';

import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';
import type { TipoDeSelo } from '../componentes/basicos.tsx';

export type Item = Esquemas['AdminModerationItem'];
export type Origem = Esquemas['ModerationOrigin'];
export type EstadoDaFila = Esquemas['ModerationQueueState'];
export type Decisao = Esquemas['ModerationResolution'];

/** As abas, na ordem em que o operador trabalha. */
export const ABAS: readonly EstadoDaFila[] = ['open', 'resolved'];

export const ROTULO_DA_ABA = {
  open: 'Na fila',
  resolved: 'Decididas',
} as const satisfies Record<EstadoDaFila, string>;

export const VAZIO_DA_ABA = {
  open: 'Nenhuma denúncia esperando decisão.',
  resolved: 'Nenhuma denúncia decidida ainda.',
} as const satisfies Record<EstadoDaFila, string>;

/**
 * O rotulo da origem.
 *
 * `satisfies Record<Origem, string>` como TRAVA: quando a frente de comunidade
 * acrescentar `profile` ou `photo` ao `enum` do contrato, o compilador do
 * painel reprova AQUI -- em vez de a tela mostrar `profile` cru para quem
 * modera. E a mesma trava de `CONTATOS` em `diretorio/fila.ts`, e e por ela
 * que o desenho "pronto para receber" se cobra de verdade.
 */
export const ROTULO_DA_ORIGEM = {
  review: 'Avaliação',
  conversation: 'Conversa',
  // AS TRES DA UNIAO DE 18/10/2026. O `satisfies Record<Origem, string>` e
  // quem cobrou: com os tres valores novos no `enum` do contrato e sem estes
  // tres rotulos, o painel NAO COMPILA -- que e a trava descrita acima
  // funcionando. O filtro de origem tambem sai deste mapa, entao os tres
  // aparecem na lista sem uma linha a mais.
  profile: 'Perfil',
  photo: 'Foto',
  publication: 'Publicação',
} as const satisfies Record<Origem, string>;

export const ROTULO_DA_DECISAO = {
  content_removed: 'Conteúdo removido',
  dismissed: 'Denúncia descartada',
} as const satisfies Record<Decisao, string>;

export const SELO_DA_DECISAO = {
  content_removed: 'retirado',
  dismissed: 'inativo',
} as const satisfies Record<Decisao, TipoDeSelo>;

/**
 * Os motivos da denuncia, nas palavras de quem modera.
 *
 * **Os dois vocabularios no mesmo mapa, e nao um `satisfies Record`**: os
 * valores diferem por origem (a avaliacao tem `offensive` e
 * `not_about_this_place`; a conversa tem `extortion` e `harassment`) e o
 * contrato devolve `reason` como cadeia livre justamente por isso -- um `enum`
 * unico misturaria os dois e passaria a valer como se fosse um. O `??` abaixo
 * e a rede: motivo novo no banco aparece cru em vez de desaparecer.
 */
const MOTIVOS: Record<string, string> = {
  // Avaliacao
  spam: 'Spam',
  offensive: 'Ofensivo',
  false_information: 'Informação falsa',
  not_about_this_place: 'Não é sobre este lugar',
  // Conversa
  extortion: 'Extorsão',
  harassment: 'Assédio',
  impersonation: 'Falsa identidade',
  // As duas
  other: 'Outro',
};

export function rotuloDoMotivo(valor: string): string {
  return MOTIVOS[valor] ?? valor;
}

/** O teto do motivo da decisao: o MESMO numero do `CHECK` do banco. */
export const LIMITE_DO_MOTIVO = 500;
/** O piso. Tres simbolos nao e justificativa: e "nao e vazio". */
export const MINIMO_DO_MOTIVO = 3;

export const AJUDA_DO_MOTIVO =
  'Quem vai ler isto é quem auditar depois e o próximo moderador — não quem denunciou e não ' +
  'quem foi denunciado. Ninguém é avisado.';

export function erroDoMotivo(valor: string): string | undefined {
  const limpo = valor.trim();
  if (limpo.length < MINIMO_DO_MOTIVO) return 'Escreva o motivo da decisão.';
  if (limpo.length > LIMITE_DO_MOTIVO) {
    return `O motivo tem no máximo ${LIMITE_DO_MOTIVO} caracteres.`;
  }
  return undefined;
}

/**
 * O SINAL DE REPETICAO numa linha -- o que separa briga de problema real.
 *
 * Dois numeros e nao um, porque respondem perguntas diferentes:
 * `report_count` e quantas PESSOAS denunciaram; `repeat_total` e quantas VEZES,
 * somando a insistencia de cada uma. Uma briga de vizinho da "1 denúncia"; um
 * problema real da "7 denúncias · 11 no total".
 */
export function repeticaoDe(item: Item): string {
  const pessoas = item.report_count === 1 ? '1 denúncia' : `${item.report_count} denúncias`;
  return item.repeat_total > item.report_count
    ? `${pessoas} · ${item.repeat_total} no total`
    : pessoas;
}

/**
 * Esta linha merece destaque?
 *
 * Tres ou mais denunciantes distintos e o mesmo numero que o contrato ja usa
 * como `on_exceed: raise_queue_priority` na dimensao `report_target` de
 * `reportConversation` -- "e esta a dimensao que pega denuncia em laco de
 * verdade". A tela nao inventa um limiar: ela mostra o que o contrato ja
 * decidiu que e sinal.
 */
export const DENUNCIANTES_PARA_DESTAQUE = 3;

export function eInsistente(item: Item): boolean {
  return item.report_count >= DENUNCIANTES_PARA_DESTAQUE;
}

/**
 * O CONTEUDO DENUNCIADO, como a tela o escreve -- ou a explicacao de por que
 * ele nao esta ali.
 *
 * Na origem `conversation` o contrato devolve `content: null` SEMPRE, e isso e
 * desenho: a conversa e privada entre duas pessoas e nada neste produto
 * autoriza o administrador a le-la. A tela **diz isso por extenso** em vez de
 * mostrar um campo vazio -- um vazio sem explicacao faria quem modera achar
 * que a tela quebrou, e tentar de novo.
 */
export function conteudoDo(item: Item): { texto: string; ausente: boolean } {
  if (item.content) return { texto: item.content, ausente: false };
  if (item.origin === 'conversation') {
    return {
      texto:
        'A conversa é privada entre as duas pessoas e não é mostrada aqui. Decida pelo motivo e ' +
        'pelo relato de quem denunciou.',
      ausente: true,
    };
  }
  return { texto: 'Avaliação sem texto: só a nota.', ausente: true };
}

/** A nota em estrelas, quando o alvo tem nota. */
export function notaDe(item: Item): string {
  return item.rating === null || item.rating === undefined ? '—' : `${item.rating}★`;
}

/** A data como o painel a escreve. Sem hora: a fila trabalha por dia. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * A CONTAGEM DO AVISO do item do menu.
 *
 * `limit: 1` e nao `limit: 50`: o numero que interessa e `pending_total`, que o
 * servidor manda independente do recorte -- pedir a pagina inteira so para ler
 * um inteiro seria trafego por nada. Mesmo desenho de `useIndicacoesPendentes`.
 *
 * **O numero vem do servidor, e nao de uma soma na tela**: ele passa pelo mesmo
 * filtro de conta desabilitada da listagem e da leitura (os tres lugares), e
 * uma soma local contaria o que a lista nao mostra -- que e exatamente o
 * defeito de "1 pendente" sobre fila vazia.
 */
export function useDenunciasPendentes(api: ClienteDaApi, versao = 0): number | undefined {
  const [pendentes, setPendentes] = useState<number>();

  const buscar = useCallback(
    async (sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/moderation/reports', {
        params: { query: { state: 'open', page: 1, limit: 1 } },
        signal: sinal,
      });
      return data?.pending_total;
    },
    [api],
  );

  useEffect(() => {
    const controle = new AbortController();
    void buscar(controle.signal)
      .then((n) => {
        if (!controle.signal.aborted && n !== undefined) setPendentes(n);
      })
      // Silencio de proposito: um aviso de contagem que nao carregou nao e
      // motivo para a casca do painel mostrar erro. O item do menu fica sem o
      // numero, e a tela da fila diz a verdade quando alguem abrir.
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}
