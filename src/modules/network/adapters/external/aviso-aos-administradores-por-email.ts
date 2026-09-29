/**
 * O aviso a todos os administradores (D52, D60), por e-mail, a cada encontro
 * criado, movido, cancelado, com condicao de acesso trocada ou com observacoes
 * mudadas.
 *
 * Quem recebe: toda conta ATIVA com papel `admin`, lida no instante do envio.
 * Um envio por conta, e a falha de um nao impede os outros: o aviso existe
 * para que alguem perceba uma conta tomada, e basta que ele chegue a uma
 * pessoa. A falha de cada envio sai no log, sem o endereco.
 *
 * Sai DEPOIS do `COMMIT` (quem chama garante): um e-mail sobre uma escrita
 * desfeita seria um aviso falso.
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
      // Os administradores sao as contas ATIVAS de `admin_accounts` (ADR-0027
      // item 20): conta do app nunca recebe aviso do painel.
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
