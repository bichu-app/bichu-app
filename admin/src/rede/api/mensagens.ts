/**
 * O texto de tela para cada falha do cliente (regra de 12.4 da UX: o que houve e o
 * que fazer).
 */
import { ERRO_DAS_OBSERVACOES } from '../dominio/observacoes.ts';
import { esperaPorExtenso, type Falha } from './redeApi.ts';

const CODIGOS: Record<string, string> = {
  contact_or_payment_detected: ERRO_DAS_OBSERVACOES,
  bidi_control: 'Tire do texto os caracteres invisíveis de direção.',
  event_in_past: 'O início precisa ser depois de agora.',
  event_not_published: 'Este evento não está mais publicado, e data, local e acesso não mudam.',
  event_removed: 'Este evento foi removido. Ele não aparece no app e não pode mais ser alterado.',
  admission_incomplete: 'Informe o valor em reais, por exemplo 15 ou 15,50.',
  request_not_pending: 'Este pedido já foi decidido ou a pessoa desistiu. A lista foi atualizada.',
};

/**
 * 409 `event-not-open` na fila (UX 30.7 R2): com o estado conhecido, a frase diz
 * qual; sem ele, a generica.
 */
export function textoDeEncontroFechado(e?: { publication_status: string; timing: string }): string {
  const estado =
    e?.publication_status === 'removed' ? 'foi removido' : e?.publication_status === 'cancelled' ? 'foi cancelado' : e?.timing === 'ended' ? 'já aconteceu' : undefined;
  return estado
    ? `Este evento ${estado}. Os pedidos dele não podem mais ser aprovados nem recusados.`
    : 'Este evento não está mais aberto a pedidos. Eles não podem mais ser aprovados nem recusados.';
}

export function mensagemDaFalha(falha: Falha, acao: string): string {
  switch (falha.tipo) {
    case 'validacao': {
      const conhecido = falha.erros.map((e) => CODIGOS[e.code]).find(Boolean);
      return conhecido ?? `Não conseguimos ${acao}. Confira os campos e tente de novo.`;
    }
    case 'sem-versao':
      return 'Não conseguimos confirmar qual versão deste evento você está vendo, e nada foi gravado. Os dados foram atualizados; confira e tente de novo.';
    case 'versao':
      return 'Alguém alterou este evento antes de você. Os dados foram atualizados; confira e tente de novo.';
    case 'limite':
      return `Muitas tentativas. Tente de novo em ${esperaPorExtenso(falha.esperaSegundos)}.`;
    case 'nao-encontrado':
      return 'Este evento não existe mais.';
    case 'proibido':
      return 'Você não tem permissão para isto.';
    case 'sem-conexao':
      return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
    case 'encontro-fechado':
      return textoDeEncontroFechado();
    case 'endereco-ocupado':
      return 'Já existe um evento com um título parecido. Mude o título e tente de novo.';
    case 'sessao':
      return 'Sua sessão terminou. Entre de novo para continuar.';
    case 'servidor':
      return `Não conseguimos ${acao}. Tente de novo.`;
  }
}
