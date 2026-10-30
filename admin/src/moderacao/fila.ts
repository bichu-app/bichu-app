/** O vocabulario da FILA DE MODERACAO no painel, em pasta propria. */
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

/** O rotulo da origem. */
export const ROTULO_DA_ORIGEM = {
  review: 'Avaliação',
  conversation: 'Conversa',
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

/** Os motivos da denuncia, nas palavras de quem modera. */
const MOTIVOS: Record<string, string> = {
  spam: 'Spam',
  offensive: 'Ofensivo',
  false_information: 'Informação falsa',
  not_about_this_place: 'Não é sobre este lugar',
  extortion: 'Extorsão',
  harassment: 'Assédio',
  impersonation: 'Falsa identidade',
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

/** O SINAL DE REPETICAO numa linha -- o que separa briga de problema real. */
export function repeticaoDe(item: Item): string {
  const pessoas = item.report_count === 1 ? '1 denúncia' : `${item.report_count} denúncias`;
  return item.repeat_total > item.report_count
    ? `${pessoas} · ${item.repeat_total} no total`
    : pessoas;
}

/** Esta linha merece destaque? */
export const DENUNCIANTES_PARA_DESTAQUE = 3;

export function eInsistente(item: Item): boolean {
  return item.report_count >= DENUNCIANTES_PARA_DESTAQUE;
}

/**
 * O CONTEUDO DENUNCIADO, como a tela o escreve -- ou a explicacao de por que ele
 * nao esta ali.
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

/** A data como o painel a escreve. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** A CONTAGEM DO AVISO do item do menu. */
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
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}
