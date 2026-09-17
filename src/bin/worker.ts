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
import { manterProcessoVivo } from '../shared/process/vida-do-processo.js';
import { systemClock } from '../shared/time/clock.js';
import { expurgarEventosVencidos } from '../modules/audit/adapters/persistence/kysely-audit-log.js';

const INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

export async function main(): Promise<void> {
  assertSafeBoot();
  const config = loadAppConfig();
  const banco = createDb(config.databaseUrl);

  // Declarado ANTES de qualquer trabalho. Entre o fim do primeiro expurgo e o
  // agendamento do próximo não pode existir um instante em que o laço de
  // eventos esteja vazio: é nesse instante que o processo sai com 0.
  const vida = manterProcessoVivo();

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

  const encerrar = (sinal: string): void => {
    if (vida.estaEncerrando) return;
    console.info(JSON.stringify({ evento: 'worker.shutdown', sinal }));
    vida.encerrar();
  };
  process.once('SIGTERM', () => { encerrar('SIGTERM'); });
  process.once('SIGINT', () => { encerrar('SIGINT'); });

  await rodarExpurgo();
  const temporizador = setInterval(() => {
    if (vida.estaEncerrando) return;
    // Falha no expurgo não derruba o worker, e também não some: sai no log e a
    // próxima janela tenta de novo.
    rodarExpurgo().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'audit.purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS);
  // Sem referência: quem responde pelo tempo de vida do processo é `vida`, um
  // lugar só. Temporizador de trabalho segurando o processo por efeito colateral
  // é como o defeito anterior se escondeu.
  temporizador.unref();

  // Processo de vida longa. A plataforma orientada a requisição congela o
  // processo fora do ciclo de uma requisição, e é por isso que o worker é um
  // processo separado e não uma thread de fundo da API.
  await vida.encerrado;

  clearInterval(temporizador);
  await banco.close();
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
