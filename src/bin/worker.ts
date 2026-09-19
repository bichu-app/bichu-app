/**
 * Processo de trabalho.
 *
 * Mesma imagem de `api.ts`, outro comando. Hoje ele carrega **dois** trabalhos:
 *
 * - o expurgo dos 24 meses de retenção da trilha de auditoria, por temporizador;
 * - o **consumo da fila** (`jobs`), que hoje processa foto de pet. Alerta,
 *   lembrete e e-mail entram com as histórias que os criam.
 *
 * Os dois são coisas diferentes e é por isso que não compartilham laço: o
 * expurgo roda a cada seis horas e não tem fila; o processamento reserva
 * trabalho com `FOR UPDATE SKIP LOCKED` e precisa de uma passada curta.
 *
 * O agendamento vive aqui e não no banco: `pg_cron` não é oferecido de forma
 * uniforme pelos gerenciados, e uma extensão que só existe em um provedor é
 * amarração disfarçada de conveniência (docs/07-devops.md 3.4).
 */
import { assertSafeBoot, optionalEnv } from '../shared/config/env.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { resolverSegredos } from '../shared/config/segredos.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { createDb } from '../shared/db/pool.js';
import { manterProcessoVivo } from '../shared/process/vida-do-processo.js';
import { systemClock } from '../shared/time/clock.js';
import { expurgarEventosVencidos } from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarJobQueue } from '../shared/queue/kysely-job-queue.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { criarMediaRepository } from '../modules/media/adapters/persistence/kysely-media-repository.js';
import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { criarImageProcessor } from '../modules/media/adapters/external/sharp-image-processor.js';
import { criarPushSender } from '../modules/notifications/adapters/external/log-push-sender.js';
import { processarFoto, type CargaDoTrabalho } from '../modules/media/application/processar-foto.js';
import { varrerEnviosVencidos } from '../modules/media/application/varrer-envios-vencidos.js';

const INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

/**
 * De quanto em quanto tempo os envios vencidos são varridos.
 *
 * Quinze minutos. A autorização vale 5, então isso dá no máximo 20 minutos entre
 * o vencimento e a limpeza — folgado de sobra para lixo que ninguém vê, e raro o
 * bastante para não competir com o processamento de foto, que é o trabalho que
 * alguém está esperando.
 */
const INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS = 15 * 60 * 1000;

/**
 * Quanto o worker espera entre duas passadas na fila.
 *
 * Dois segundos, e não duzentos milissegundos: a foto do pet não é interativa —
 * o cadastro já avançou sem ela (é o ponto inteiro de BICHUS-87) e ninguém está
 * olhando um botão girar. Sondar rápido só gastaria conexão de banco para
 * encontrar a fila vazia.
 */
const INTERVALO_DA_FILA_EM_MILISSEGUNDOS = 2000;

/**
 * Quantos trabalhos por passada.
 *
 * UM. Processamento de imagem é o trabalho mais pesado em memória que existe
 * neste sistema, e o worker roda com limite de memória e reinício automático
 * (SEC-007). Pegar um lote de dez significaria dez decodificações concorrendo
 * pelo mesmo teto, e o estouro derrubaria as dez — inclusive as nove que
 * estavam saudáveis.
 */
const TRABALHOS_POR_PASSADA = 1;

export async function main(): Promise<void> {
  assertSafeBoot();
  // Os segredos vêm ANTES de `loadAppConfig()` porque é ela que os lê. Em
  // `dev` isto é o `env_file` de sempre; em `prod`/`preprod` vem do gerenciador
  // (ADR-0022), e nos dois casos o valor chega em `process.env` com o MESMO
  // nome — é o que mantém os `requireEnv('NOME')` literais visíveis para a
  // guarda da esteira e as validações de forma valendo sem uma linha nova.
  //
  // Ligar aqui não é detalhe: sem esta chamada a porta inteira seria código
  // morto, que foi exatamente o defeito que o QA achou em
  // `invalidarTodasAsSessoes` — mecanismo escrito, testado, e sem chamador.
  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));

  const config = loadAppConfig();
  const banco = createDb(config.databaseUrl);

  // Declarado ANTES de qualquer trabalho. Entre o fim do primeiro expurgo e o
  // agendamento do próximo não pode existir um instante em que o laço de
  // eventos esteja vazio: é nesse instante que o processo sai com 0.
  const vida = manterProcessoVivo();

  // Uma instância só, pelo mesmo motivo de `api.ts`: o gerador de UUIDv7 usa o
  // relógio para o prefixo ordenável, e dois geradores são dois relógios.
  const ids = criarIdGenerator(() => systemClock.now());
  const fila = criarJobQueue(banco.db, ids);

  // O remetente de push é montado AQUI, e não em `api.ts`, porque é aqui que o
  // envio acontece: a API **enfileira** (`push.send`, `alert.dispatch`) e o
  // worker envia. A métrica do ADR de arquitetura diz isso com todas as letras
  // — "da abertura ao último push ENFILEIRADO, ≤ 60 s" —, o ADR-0008 e
  // docs/07-devops.md 4.1 descrevem o log do alerta como saída DO WORKER, e o
  // cabeçalho deste arquivo já prevê que "alerta, lembrete e e-mail entram com
  // as histórias que os criam". Um remetente montado na API seria um segundo
  // caminho de envio que ninguém escolheu.
  //
  // Montar aqui não é detalhe: sem esta linha, a porta, os dois adaptadores e a
  // porteira do payload seriam código morto — a mesma família de
  // `invalidarTodasAsSessoes` e da rota do webhook de entrega, que este
  // repositório já registrou duas vezes hoje.
  //
  // O que AINDA não existe, e é honesto dizer onde para: o tratador de
  // `push.send` na fila. Ele depende da tabela `user_devices`
  // (docs/03-arquitetura.md), que não tem migração, e de quem decide QUEM
  // recebe — o raio de 5 km e o teto de fadiga, que são de outra camada e de
  // outra história. Quando ele chegar, ele recebe este `push` e mais nada muda.
  const push = criarPushSender(config.push);
  // O transporte no log de subida, antes de qualquer trabalho: "por onde este
  // processo manda push?" é a primeira pergunta de todo incidente de
  // notificação, e é para ela que a porta declara `transporte`. Responder isso
  // olhando para `ENVIRONMENT` é deduzir em vez de ler — e com `log` a resposta
  // certa é "por lugar nenhum", que ninguém adivinha.
  console.info(JSON.stringify({ evento: 'push.transporte', transporte: push.transporte }));

  const dependenciasDaFoto = {
    repositorio: criarMediaRepository(banco.db),
    armazenamento: criarObjectStorage(config.objectStorage),
    imagens: criarImageProcessor(),
    ids,
    clock: systemClock,
  };

  const rodarFila = async (): Promise<void> => {
    const trabalhos = await fila.claim(TRABALHOS_POR_PASSADA);
    for (const trabalho of trabalhos) {
      try {
        if (trabalho.kind !== 'media.process_upload') {
          // Trabalho de um tipo que este worker ainda não sabe fazer. Falhar
          // com o motivo é melhor que ignorar em silêncio: ignorado, ele fica
          // `running` para sempre e ninguém descobre que a fila tem entulho.
          await fila.fail(trabalho.id, `tipo sem tratador neste worker: ${trabalho.kind}`);
          continue;
        }

        const resultado = await processarFoto(dependenciasDaFoto, trabalho.payload as CargaDoTrabalho);
        await fila.complete(trabalho.id);
        console.info(JSON.stringify({ evento: `media.${resultado.tipo}`, foto: resultado.fotoId }));
      } catch (erro: unknown) {
        // Falha de VERDADE (armazenamento fora do ar, banco indisponível): a
        // fila adia e tenta de novo. Recusa de arquivo não passa por aqui —
        // ela vira `rejected` dentro de `processarFoto`, e é final.
        await fila.fail(trabalho.id, String(erro));
        console.error(JSON.stringify({ evento: 'media.process_failed', trabalho: trabalho.id, erro: String(erro) }));
      }
    }
  };

  const rodarVarredura = async (): Promise<void> => {
    const r = await varrerEnviosVencidos({
      repositorio: dependenciasDaFoto.repositorio,
      armazenamento: dependenciasDaFoto.armazenamento,
      clock: systemClock,
    });
    // Silêncio quando não há nada: uma linha de log a cada 15 minutos dizendo
    // "zero" afoga o log em que alguém vai procurar um problema de verdade.
    if (r.examinadas > 0) {
      console.info(JSON.stringify({ evento: 'media.purge_expired', ...r }));
    }
  };

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

  const temporizadorDaVarredura = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarVarredura().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'media.purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDaVarredura.unref();

  const temporizadorDaFila = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarFila().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'fila.passada_falhou', erro: String(erro) }));
    });
  }, INTERVALO_DA_FILA_EM_MILISSEGUNDOS);
  temporizadorDaFila.unref();

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
  clearInterval(temporizadorDaFila);
  clearInterval(temporizadorDaVarredura);
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
