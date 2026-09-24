/**
 * Processo de trabalho.
 *
 * Mesma imagem de `api.ts`, outro comando. Hoje ele carrega **dois** trabalhos:
 *
 * - o expurgo dos 24 meses de retenção da trilha de auditoria, por temporizador;
 * - o **consumo da fila** (`jobs`), que processa foto de pet e **dispara o
 *   alerta de 5 km** (`alert.dispatch`, BICHUS-18). Lembrete e e-mail entram
 *   com as histórias que os criam.
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
import {
  criarTrilhaDeAuditoria,
  expurgarEventosVencidos,
} from '../modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarJobQueue } from '../shared/queue/kysely-job-queue.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { criarMediaRepository } from '../modules/media/adapters/persistence/kysely-media-repository.js';
import { criarObjectStorage } from '../modules/media/adapters/external/s3-object-storage.js';
import { criarImageProcessor } from '../modules/media/adapters/external/sharp-image-processor.js';
import { criarPushSender } from '../modules/notifications/adapters/external/log-push-sender.js';
import { processarFoto, type CargaDoTrabalho } from '../modules/media/application/processar-foto.js';
import {
  processarImagemDeCatalogo,
  type CargaDaImagemDeCatalogo,
} from '../modules/media/application/processar-imagem-de-catalogo.js';
import { criarImagensDeCatalogoDoWorker } from '../modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../modules/media/ports/imagem-de-catalogo.js';
import { varrerEnviosVencidos } from '../modules/media/application/varrer-envios-vencidos.js';
import { expurgarContasExcluidas } from '../modules/identity/application/expurgar-contas-excluidas.js';
import { criarIdentityRepository } from '../modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarLocalizacaoDeReferenciaRepository } from '../modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';
import { criarRegistroDeAparelhos } from '../modules/notifications/adapters/persistence/kysely-registro-de-aparelhos.js';
import { RegistroDeAparelhosService } from '../modules/notifications/application/registro-de-aparelhos-service.js';
import { criarEntregaDoAlertaPorPush } from '../modules/notifications/adapters/external/entrega-do-alerta-por-push.js';
import { criarAlcancePorPostGIS } from '../modules/lostfound/adapters/persistence/kysely-alcance-por-postgis.js';
import { criarRegistroDeDisparos } from '../modules/lostfound/adapters/persistence/kysely-registro-de-disparos.js';
import { DisparoDoAlertaService } from '../modules/lostfound/application/disparo-do-alerta-service.js';
import { criarMailer } from '../modules/identity/adapters/external/smtp-mailer.js';
import {
  criarTransferRepository,
  transferenciasVencidas,
} from '../modules/transfers/adapters/persistence/kysely-transfer-repository.js';
import {
  criarEmailVerificadoDoChamador,
  criarNomeDoPet,
} from '../modules/transfers/adapters/persistence/kysely-consultas-de-apoio.js';
import { PetTransferService } from '../modules/transfers/application/pet-transfer-service.js';
import type { TransferId } from '../modules/transfers/ports/transfer-repository.js';

import type { CaseId } from '../shared/types/brands.js';

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
 * De quanto em quanto tempo as localizações de referência vencidas são
 * apagadas.
 *
 * Seis horas, o mesmo da trilha, e a folga é intencional. **Este temporizador
 * não é o que faz a conta sair da base de alerta** — isso o `WHERE
 * expires_at > agora` de toda leitura já fez, no milissegundo do vencimento
 * (critério 7 da BICHUS-92). O que ele faz é retenção: dado vencido não fica
 * guardado esperando alguém precisar dele (ADR-0010). Errar por seis horas na
 * hora de apagar não muda quem recebe alerta nenhum; errar no sentido contrário
 * — depender desta varredura para a elegibilidade — faria a janela de 30 dias
 * virar "30 dias mais o atraso do worker", e ninguém acusaria.
 */
const INTERVALO_DO_EXPURGO_DE_LOCALIZACAO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

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

  // ADR-0027 item 10 (BICHUS-267). A imagem de catalogo do painel, pelo mesmo
  // armazenamento e o mesmo processador da foto do pet.
  const dependenciasDaImagemDeCatalogo = {
    imagens: criarImagensDeCatalogoDoWorker(banco.db),
    armazenamento: dependenciasDaFoto.armazenamento,
    processador: dependenciasDaFoto.imagens,
    ids,
  };

  // BICHUS-18. O DISPARO DO ALERTA DE 5 KM, montado aqui e em lugar nenhum
  // mais. É esta fiação que liga as três funções que a BICHUS-91 deixou com o
  // chamador nomeado e ausente: `enderecoDeEnvio` e `revogarPorTokenRecusado`
  // entram por `criarEntregaDoAlertaPorPush`, e o remetente de push acima
  // deixa de ser decoração.
  //
  // A trilha é a do serviço de aparelhos e não uma nova: a revogação por token
  // recusado grava `device.revoked` com o motivo, e como a linha do aparelho é
  // apagada, essa é a única memória de por que aquele aparelho parou de
  // receber.
  const aparelhos = new RegistroDeAparelhosService({
    repositorio: criarRegistroDeAparelhos(banco.db, ids),
    clock: systemClock,
    trilha: criarTrilhaDeAuditoria({
      db: banco.db,
      ids,
      clock: systemClock,
      ipHmacKey: config.ipHmacKey,
      onFailure: (erro, evento) => {
        // A trilha não derruba o alerta: um incidente no esquema de auditoria
        // não é motivo para 500 vizinhos ficarem sem o aviso. Ruidosa, porém —
        // falha silenciosa aqui apagaria a única memória da revogação.
        console.error(
          JSON.stringify({
            evento: 'audit.write_failed',
            acao: evento.action,
            erro: String(erro),
          }),
        );
      },
    }),
  });

  const disparoDoAlerta = new DisparoDoAlertaService({
    disparos: criarRegistroDeDisparos(banco.db),
    alcance: criarAlcancePorPostGIS(banco.db),
    entrega: criarEntregaDoAlertaPorPush({
      aparelhos,
      push,
      revogarPorTokenRecusado: (token) => aparelhos.revogarPorTokenRecusado(token),
    }),
    clock: systemClock,
    // A mesma montagem de `api.ts`: o banco guarda a chave, e a URL pública é
    // montada na leitura. Uma URL gravada carrega o domínio do dia em que foi
    // escrita, e é assim que `localhost` vaza para produção.
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

  // BICHUS-66. QUEM FECHA A JANELA DE 24 H.
  //
  // O aceite agenda `case.transfer_consummate` para daqui 24 h; este servico e
  // quem executa. Ele mora no WORKER e nao na API de proposito: consumar troca o
  // dono do pet e revoga todas as tags (ADR-0004), e isso nao pode depender de
  // alguem abrir uma tela na hora certa.
  const transferencias = new PetTransferService({
    repositorio: criarTransferRepository(banco.db),
    ids,
    clock: systemClock,
    trilha: criarTrilhaDeAuditoria({
      db: banco.db,
      ids,
      clock: systemClock,
      ipHmacKey: config.ipHmacKey,
      onFailure: (erro, evento) => {
        console.error(
          JSON.stringify({ evento: 'audit.failure', acao: evento.action, erro: String(erro) }),
        );
      },
    }),
    mailer: criarMailer(config.mail),
    contas: criarEmailVerificadoDoChamador(banco.db),
    pets: criarNomeDoPet(banco.db),
    // A consumacao nao enfileira nada. A fila entra na porta porque o tipo a
    // exige (o mesmo servico serve a API, que agenda), e nao porque este lado a
    // use -- e por isso ela e a mesma instancia, e nao uma segunda.
    fila,
    baseDaWeb: config.webBaseUrl,
  });

  const rodarFila = async (): Promise<void> => {
    const trabalhos = await fila.claim(TRABALHOS_POR_PASSADA);
    for (const trabalho of trabalhos) {
      try {
        if (trabalho.kind === 'alert.dispatch') {
          // BICHUS-18. O desfecho vem como VALOR e não como exceção, e por isso
          // todos eles completam o trabalho: "o caso não existe mais" e "este
          // caso já avisou hoje" não são falhas, e reenfileirá-los gastaria a
          // fila contra algo que nunca vai mudar de resposta.
          const { caseId } = trabalho.payload as { caseId: string };
          const desfecho = await disparoDoAlerta.disparar(caseId as CaseId);
          await fila.complete(trabalho.id);
          console.info(JSON.stringify({ evento: 'alert.dispatch', caso: caseId, ...desfecho }));
          continue;
        }

        if (trabalho.kind === 'case.transfer_consummate') {
          // Mesmo padrao do alerta: o desfecho vem como VALOR e nao como
          // excecao. "Ja cancelada" e "caso de perdido aberto" sao desfechos
          // NORMAIS desta operacao -- reenfileira-los gastaria a fila contra
          // algo que nunca vai mudar de resposta.
          const { transferId } = trabalho.payload as { transferId: string };
          const desfecho = await transferencias.consumar(transferId as TransferId);
          await fila.complete(trabalho.id);
          console.info(
            JSON.stringify({
              evento: 'transfer.consummate',
              transferencia: transferId,
              ...desfecho,
            }),
          );
          continue;
        }

        if (trabalho.kind === TRABALHO_DE_IMAGEM_DE_CATALOGO) {
          const imagem = await processarImagemDeCatalogo(
            dependenciasDaImagemDeCatalogo,
            trabalho.payload as CargaDaImagemDeCatalogo,
          );
          await fila.complete(trabalho.id);
          console.info(JSON.stringify({ evento: `catalogo.${imagem.tipo}`, imagem: imagem.imagemId }));
          continue;
        }

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

  /**
   * BICHUS-66. A REDE DE SEGURANCA DA JANELA, e ela nao e redundancia inutil.
   *
   * O trabalho agendado pode nao ter rodado: processo caido por mais de um dia,
   * banco restaurado de um backup anterior ao agendamento, fila purgada. Sem
   * esta varredura, uma transferencia aceita ficaria `accepted` para sempre --
   * com a tela do tutor dizendo que a janela corre e NADA acontecendo quando ela
   * fecha, que e a pior forma de errar aqui: a promessa continua na tela e o
   * sistema parou de honra-la.
   *
   * Reenfileirar em vez de consumar na varredura mantem UM caminho de
   * consumacao. Dois caminhos divergem, e o que diverge primeiro e sempre o que
   * ninguem esta olhando.
   */
  const rodarVarreduraDeTransferencias = async (): Promise<void> => {
    const agora = systemClock.now();
    const { aExpirar, aConsumar } = await transferenciasVencidas(banco.db, agora, 50);
    const repositorio = criarTransferRepository(banco.db);
    for (const id of aExpirar) {
      if (await repositorio.expirar(id, agora)) {
        console.info(JSON.stringify({ evento: 'transfer.expired', transferencia: id }));
      }
    }
    for (const id of aConsumar) {
      await fila.enqueue('case.transfer_consummate', { transferId: id });
      console.info(JSON.stringify({ evento: 'transfer.reenqueued', transferencia: id }));
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

  const localizacoes = criarLocalizacaoDeReferenciaRepository(banco.db);

  const rodarExpurgoDeLocalizacao = async (): Promise<void> => {
    const apagadas = await localizacoes.expurgarVencidas(systemClock.now());
    // Silêncio quando não há nada, pelo mesmo motivo da varredura de envios.
    if (apagadas > 0) {
      console.info(JSON.stringify({ evento: 'privacy.reference_location_purged', apagadas }));
    }
  };


  /**
   * O expurgo de conta excluída, e ele mora aqui e não na API pelo mesmo motivo
   * do expurgo da trilha: `DELETE /v1/me` responde 202 porque o efeito completo
   * tem prazo de 30 dias, e o que tem prazo é do worker.
   *
   * A trilha é montada aqui, e não é a mesma dos aparelhos por acaso: ela grava
   * `privacy.account_purged`, que é a **única** memória de que aquela conta
   * existiu depois que a linha some. `audit.events` não referencia `users` de
   * propósito, e é isso que faz o registro sobreviver ao que ele registra.
   */
  const contas = criarIdentityRepository(banco.db, ids);
  const trilhaDoExpurgo = criarTrilhaDeAuditoria({
    db: banco.db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro, evento) => {
      console.error(
        JSON.stringify({ evento: 'audit.write_failed', acao: evento.action, erro: String(erro) }),
      );
    },
  });

  const rodarExpurgoDeContas = async (): Promise<void> => {
    const r = await expurgarContasExcluidas({
      repositorio: contas,
      trilha: trilhaDoExpurgo,
      clock: systemClock,
    });
    // Silêncio quando não há nada, pelo mesmo motivo das outras varreduras. A
    // exceção é a falha: ela fala SEMPRE, mesmo com zero expurgadas, porque uma
    // conta que não some no prazo é descumprimento de política e não ruído.
    if (r.examinadas > 0 || r.falhas > 0) {
      console.info(JSON.stringify({ evento: 'privacy.account_purge', ...r }));
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
  await rodarExpurgoDeLocalizacao();
  await rodarExpurgoDeContas();

  const temporizadorDaVarredura = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarVarredura().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'media.purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDaVarredura.unref();

  const temporizadorDasContas = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarExpurgoDeContas().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'privacy.account_purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDasContas.unref();

  const temporizadorDaLocalizacao = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarExpurgoDeLocalizacao().catch((erro: unknown) => {
      console.error(
        JSON.stringify({ evento: 'privacy.reference_location_purge_failed', erro: String(erro) }),
      );
    });
  }, INTERVALO_DO_EXPURGO_DE_LOCALIZACAO_EM_MILISSEGUNDOS);
  temporizadorDaLocalizacao.unref();

  const temporizadorDeTransferencias = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarVarreduraDeTransferencias().catch((erro: unknown) => {
      console.error(
        JSON.stringify({ evento: 'transfer.sweep_failed', erro: String(erro) }),
      );
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDeTransferencias.unref();

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
  clearInterval(temporizadorDaLocalizacao);
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
