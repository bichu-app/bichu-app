/**
 * O aviso a todos os administradores (D52, D60), por e-mail, a cada encontro
 * criado, movido, cancelado, com condicao de acesso trocada ou com observacoes
 * mudadas.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { Mailer } from '../../../identity/ports/mailer.js';
import type { AvisoAosAdministradores } from '../../ports/rede-administrativa.js';

export interface DependenciasDoAviso {
  readonly db: Db;
  readonly mailer: Mailer;
  readonly registrarOcorrencia: (dados: Record<string, unknown>, mensagem: string) => void;
}

export function criarAvisoAosAdministradores(deps: DependenciasDoAviso): AvisoAosAdministradores {
  return {
    async avisar({ assunto, linhas }) {
      const contas = await deps.db
        .selectFrom('admin_accounts')
        .select(['email'])
        .where('status', '=', 'active')
        .execute();
      if (contas.length === 0) {
        deps.registrarOcorrencia({ evento: 'admin.network_event.notice_no_recipient' }, 'aviso sem administrador ativo para receber');
        return;
      }
      const corpo = `${linhas.join('\n')}\n\nEste aviso vai para todos os administradores do painel do Bichu.`;
      let falhas = 0;
      for (const { email } of contas) {
        try {
          await deps.mailer.enviar({ para: email, assunto: `[Bichu painel] ${assunto}`, corpo });
        } catch (erro) {
          falhas += 1;
          deps.registrarOcorrencia(
            { evento: 'admin.network_event.notice_failed', err: String(erro) },
            'aviso a um administrador nao saiu',
          );
        }
      }
      if (falhas === contas.length) throw new Error('nenhum administrador recebeu o aviso');
    },
  };
}
