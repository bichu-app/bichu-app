/**
 * O texto de tela para cada falha do cliente (regra de 12.4 da UX: o que
 * houve e o que fazer). Decide pelo tipo e pelo `code` do contrato, nunca
 * pelo texto do servidor.
 */
import { ERRO_DAS_OBSERVACOES } from '../dominio/observacoes.ts';
import { esperaPorExtenso, type Falha } from './redeApi.ts';

const CODIGOS: Record<string, string> = {
  contact_or_payment_detected: ERRO_DAS_OBSERVACOES,
  bidi_control: 'Tire do texto os caracteres invisíveis de direção.',
  event_in_past: 'O início precisa ser depois de agora.',
  event_not_published: 'Este encontro não está mais publicado, e data, local e acesso não mudam.',
  event_removed: 'Este encontro foi removido. Ele não aparece no app e não pode mais ser alterado.',
  admission_incomplete: 'Informe o valor em reais, por exemplo 15 ou 15,50.',
  request_not_pending: 'Este pedido já foi decidido ou a pessoa desistiu. A lista foi atualizada.',
};

export function mensagemDaFalha(falha: Falha, acao: string): string {
  switch (falha.tipo) {
    case 'validacao': {
      const conhecido = falha.erros.map((e) => CODIGOS[e.code]).find(Boolean);
      return conhecido ?? `Não conseguimos ${acao}. Confira os campos e tente de novo.`;
    }
    case 'versao':
      return 'Alguém alterou este encontro antes de você. Os dados foram atualizados; confira e tente de novo.';
    case 'limite':
      return `Muitas tentativas. Tente de novo em ${esperaPorExtenso(falha.esperaSegundos)}.`;
    case 'nao-encontrado':
      return 'Este encontro não existe mais.';
    case 'proibido':
      return 'Você não tem permissão para isto.';
    case 'precisa-da-senha':
    case 'senha-incorreta':
      return 'Confirme sua senha de novo.';
    case 'sem-conexao':
      return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
    case 'endereco-ocupado':
      return 'Já existe um encontro com um título parecido. Mude o título e tente de novo.';
    case 'sessao':
      return 'Sua sessão terminou. Entre de novo para continuar.';
    case 'servidor':
      return `Não conseguimos ${acao}. Tente de novo.`;
  }
}
