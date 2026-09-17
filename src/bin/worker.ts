/**
 * Processo de trabalho.
 *
 * Mesma imagem de `api.ts`, outro comando. Nesta entrega ele carrega **um**
 * trabalho: o expurgo dos 24 meses de retenção da trilha de auditoria. Alerta,
 * lembrete, e-mail e processamento de imagem entram com as histórias que os
 * criam.
 *
 * O agendamento vive aqui e não no banco: `pg_cron` não é oferecido de forma
 * uniforme pelos gerenciados, e uma extensão que só existe em um provedor é
 * amarração disfarçada de conveniência (docs/07-devops.md 3.4).
 */
import { assertSafeBoot, optionalEnv } from '../shared/config/env.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { createDb } from '../shared/db/pool.js';
import { systemClock } from '../shared/time/clock.js';
import { expurgarEventosVencidos } from '../modules/audit/adapters/persistence/kysely-audit-log.js';

const INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

export async function main(): Promise<void> {
  assertSafeBoot();
  const config = loadAppConfig();
  const banco = createDb(config.databaseUrl);

  let rodando = true;

  const rodarExpurgo = async (): Promise<void> => {
    const resultado = await expurgarEventosVencidos(banco.db, systemClock.now());
    console.info(
      JSON.stringify({
        evento: 'audit.purge_expired',
        removidos: resultado.removidos,
        anteriores_a: resultado.limite.toISOString(),
      }),
    );
  };

  const encerrar = async (sinal: string): Promise<void> => {
    rodando = false;
    console.info(JSON.stringify({ evento: 'worker.shutdown', sinal }));
    await banco.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.once('SIGINT', () => void encerrar('SIGINT'));

  await rodarExpurgo();
  const temporizador = setInterval(() => {
    if (!rodando) return;
    // Falha no expurgo não derruba o worker, e também não some: sai no log e a
    // próxima janela tenta de novo.
    rodarExpurgo().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'audit.purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS);
  // O temporizador não segura o processo aberto sozinho: quem decide o
  // encerramento é o sinal do orquestrador.
  temporizador.unref();

  await new Promise<void>(() => {
    // Processo de vida longa. A plataforma orientada a requisição congela o
    // processo fora do ciclo de uma requisição, e é por isso que o worker é um
    // processo separado e não uma thread de fundo da API.
  });
}

if (optionalEnv('BICHU_SUPRESS_AUTOSTART') === undefined) {
  const invocadoDiretamente = process.argv[1] !== undefined &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href;
  if (invocadoDiretamente) {
    main().catch((erro: unknown) => {
      console.error(erro);
      process.exit(1);
    });
  }
}
