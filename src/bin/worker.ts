import { assertSafeBoot, optionalEnv } from '../shared/config/env.js';
import { loadAppConfig } from '../shared/config/app-config.js';
import { resolverSegredos } from '../shared/config/segredos.js';
import { criarSecretProvider } from '../shared/adapters/external/env-var-secret-provider.js';
import { createDb } from '../shared/db/pool.js';
import { manterProcessoVivo } from '../shared/process/vida-do-processo.js';
import { criarPassadaSemReentrada } from '../shared/process/passada-sem-reentrada.js';
import { comoData, systemClock } from '../shared/time/clock.js';
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
  desistirDaFoto,
  type CargaDoTrabalhoDeFoto,
} from '../modules/media/application/desistir-da-foto.js';
import {
  processarImagemDeCatalogo,
  type CargaDaImagemDeCatalogo,
} from '../modules/media/application/processar-imagem-de-catalogo.js';
import { criarImagensDeCatalogoDoWorker } from '../modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import {
  higienizarFotoDoAchado,
  type CargaDaHigiene,
} from '../modules/media/application/higienizar-foto-do-achado.js';
import {
  contarFotosDoAchadoPendentes,
  criarFotosDoAchadoDoWorker,
} from '../modules/media/adapters/persistence/kysely-fotos-do-achado.js';
import { TRABALHO_DE_HIGIENE_DA_FOTO_DO_ACHADO } from '../modules/media/ports/fotos-do-achado.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../modules/media/ports/imagem-de-catalogo.js';
import { varrerEnviosVencidos } from '../modules/media/application/varrer-envios-vencidos.js';
import { expurgarContasExcluidas } from '../modules/identity/application/expurgar-contas-excluidas.js';
import { criarApagadorDeObjetosDaConta } from '../modules/media/application/apagar-objetos-da-conta.js';
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

import {
  criarLeituraDoPedidoAprovado,
  expurgarPedidosVencidos,
} from '../modules/network/adapters/persistence/kysely-rede-administrativa.js';
import { TRABALHO_DE_AVISO_DE_APROVACAO } from '../modules/network/ports/aviso-de-aprovacao.js';
import { DIAS_DE_RETENCAO_DO_PEDIDO } from '../modules/network/domain/escrita-do-encontro.js';
import { avisarPedidoAprovado } from '../modules/network/application/avisar-pedido-aprovado.js';
import { criarAvisoDeAprovacaoPorPush } from '../modules/notifications/adapters/external/aviso-de-aprovacao-por-push.js';

import { TRABALHO_DE_AVISO_AO_TUTOR } from '../modules/tags/ports/aviso-ao-tutor.js';
import { criarLeituraDoAvisoAoTutor } from '../modules/tags/adapters/persistence/kysely-leitura-do-aviso-ao-tutor.js';
import { avisarTutorDoAchado } from '../modules/tags/application/avisar-tutor-do-achado.js';
import { criarAvisoAoTutorPorPush } from '../modules/notifications/adapters/external/aviso-ao-tutor-por-push.js';

import type { CaseId } from '../shared/types/brands.js';

const INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

const INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS = 15 * 60 * 1000;

const INTERVALO_DA_FILA_EM_MILISSEGUNDOS = 2000;

const INTERVALO_DO_EXPURGO_DE_LOCALIZACAO_EM_MILISSEGUNDOS = 6 * 60 * 60 * 1000;

const TRABALHOS_POR_PASSADA = 1;

const FOTOS_DE_ACHADO_POR_VARREDURA = 20;

const PRAZO_DE_ORFANDADE_EM_MILISSEGUNDOS = 5 * 60 * 1000;

const TETO_DE_ORFANDADE = 2;

const INTERVALO_DA_VARREDURA_DE_ORFAOS_EM_MILISSEGUNDOS = 60 * 1000;

const ORFAOS_POR_VARREDURA = 20;

export async function main(): Promise<void> {
  assertSafeBoot();
  await resolverSegredos(criarSecretProvider(optionalEnv('ENVIRONMENT') ?? 'dev'));

  const config = loadAppConfig();
  const banco = createDb(config.databaseUrl);

  const vida = manterProcessoVivo();

  const ids = criarIdGenerator(() => systemClock.now());
  const fila = criarJobQueue(banco.db, ids);

  const push = criarPushSender(config.push);
  console.info(JSON.stringify({ evento: 'push.transporte', transporte: push.transporte }));

  const dependenciasDaFoto = {
    repositorio: criarMediaRepository(banco.db),
    armazenamento: criarObjectStorage(config.objectStorage),
    imagens: criarImageProcessor(),
    ids,
    clock: systemClock,
  };

  const dependenciasDaImagemDeCatalogo = {
    imagens: criarImagensDeCatalogoDoWorker(banco.db),
    armazenamento: dependenciasDaFoto.armazenamento,
    processador: dependenciasDaFoto.imagens,
    ids,
  };

  const dependenciasDaHigieneDoAchado = {
    fotos: criarFotosDoAchadoDoWorker(banco.db),
    armazenamento: dependenciasDaFoto.armazenamento,
    imagens: dependenciasDaFoto.imagens,
    ids,
    clock: systemClock,
  };

  const aparelhos = new RegistroDeAparelhosService({
    repositorio: criarRegistroDeAparelhos(banco.db, ids),
    clock: systemClock,
    trilha: criarTrilhaDeAuditoria({
      db: banco.db,
      ids,
      clock: systemClock,
      ipHmacKey: config.ipHmacKey,
      onFailure: (erro, evento) => {
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
    urlDeMidia: (chave) => `${config.mediaPublicBaseUrl.replace(/\/$/, '')}/${chave}`,
  });

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
    fila,
    baseDaWeb: config.webBaseUrl,
  });

  const rodarVarreduraDeOrfaos = async (): Promise<void> => {
    const recuperados = await fila.recuperarOrfaos({
      prazoEmMs: PRAZO_DE_ORFANDADE_EM_MILISSEGUNDOS,
      tetoDeOrfandade: TETO_DE_ORFANDADE,
      limite: ORFAOS_POR_VARREDURA,
    });

    for (const trabalho of recuperados) {
      if (!trabalho.desistiu) {
        console.warn(
          JSON.stringify({
            evento: 'fila.orfao_devolvido',
            trabalho: trabalho.id,
            tipo: trabalho.kind,
            orfandades: trabalho.orfandades,
          }),
        );
        continue;
      }

      console.error(
        JSON.stringify({
          evento: 'fila.orfao_final',
          trabalho: trabalho.id,
          tipo: trabalho.kind,
          orfandades: trabalho.orfandades,
        }),
      );

      if (trabalho.kind !== 'media.process_upload') continue;

      const recusada = await desistirDaFoto(
        { repositorio: dependenciasDaFoto.repositorio, clock: systemClock },
        trabalho.payload as CargaDoTrabalhoDeFoto,
      );
      console.error(
        JSON.stringify({
          evento: recusada ? 'media.desistencia' : 'media.desistencia_sem_efeito',
          trabalho: trabalho.id,
        }),
      );
    }
  };

  const avisoDeAprovacao = {
    pedidos: criarLeituraDoPedidoAprovado(banco.db),
    entrega: criarAvisoDeAprovacaoPorPush({
      aparelhos: criarRegistroDeAparelhos(banco.db, ids),
      push,
      revogarPorTokenRecusado: (token) => aparelhos.revogarPorTokenRecusado(token),
    }),
  };

  const avisoAoTutor = {
    avisos: criarLeituraDoAvisoAoTutor(banco.db),
    entrega: criarAvisoAoTutorPorPush({
      aparelhos: criarRegistroDeAparelhos(banco.db, ids),
      push,
      revogarPorTokenRecusado: (token) => aparelhos.revogarPorTokenRecusado(token),
    }),
    mailer: criarMailer(config.mail),
    contas: criarEmailVerificadoDoChamador(banco.db),
  };

  const rodarFila = async (): Promise<void> => {
    const trabalhos = await fila.claim(TRABALHOS_POR_PASSADA);
    for (const trabalho of trabalhos) {
      try {
        if (trabalho.kind === 'alert.dispatch') {
          const { caseId } = trabalho.payload as { caseId: string };
          const desfecho = await disparoDoAlerta.disparar(caseId as CaseId);
          await fila.complete(trabalho.id);
          console.info(JSON.stringify({ evento: 'alert.dispatch', caso: caseId, ...desfecho }));
          continue;
        }

        if (trabalho.kind === 'case.transfer_consummate') {
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

        if (trabalho.kind === TRABALHO_DE_AVISO_DE_APROVACAO) {
          const { join_request_id: pedidoId } = trabalho.payload as { join_request_id: string };
          const desfecho = await avisarPedidoAprovado(avisoDeAprovacao, pedidoId);
          await fila.complete(trabalho.id);
          console.info(JSON.stringify({ evento: 'network.approval_push', ...desfecho }));
          continue;
        }

        if (trabalho.kind === TRABALHO_DE_AVISO_AO_TUTOR) {
          const { found_report_id: avisoId } = trabalho.payload as { found_report_id: string };
          const desfecho = await avisarTutorDoAchado(avisoAoTutor, avisoId, config.webBaseUrl);
          await fila.complete(trabalho.id);
          console.info(JSON.stringify({ evento: 'tag.scan_notify', ...desfecho }));
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

        if (trabalho.kind === TRABALHO_DE_HIGIENE_DA_FOTO_DO_ACHADO) {
          const higiene = await higienizarFotoDoAchado(
            dependenciasDaHigieneDoAchado,
            trabalho.payload as CargaDaHigiene,
          );
          await fila.complete(trabalho.id);
          console.info(
            JSON.stringify({ evento: `achado.foto_${higiene.tipo}`, envio: higiene.envioId }),
          );
          continue;
        }

        if (trabalho.kind === 'match.recompute') {
          const { foundReportId: achado } = trabalho.payload as { foundReportId: string };
          await fila.complete(trabalho.id);
          console.warn(
            JSON.stringify({
              evento: 'match.recompute_sem_motor',
              achado,
              detalhe:
                'achado concluido SEM cruzamento: o consumidor de match.recompute ' +
                'ainda nao foi ligado (FoundReportService.cruzarAchado existe e ' +
                'nao tem chamador). Conte este evento para dimensionar o pedido.',
            }),
          );
          continue;
        }

        if (trabalho.kind !== 'media.process_upload') {
          await fila.fail(trabalho.id, `tipo sem tratador neste worker: ${trabalho.kind}`);
          continue;
        }

        const resultado = await processarFoto(dependenciasDaFoto, trabalho.payload as CargaDoTrabalho);
        await fila.complete(trabalho.id);
        console.info(
          JSON.stringify({
            evento: `media.${resultado.tipo}`,
            foto: resultado.fotoId,
            ...(resultado.tipo === 'pronta' ? { derivadas: resultado.derivadas } : {}),
          }),
        );
      } catch (erro: unknown) {
        await fila.fail(trabalho.id, String(erro));
        console.error(JSON.stringify({ evento: 'media.process_failed', trabalho: trabalho.id, erro: String(erro) }));
      }
    }
  };

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

  const rodarVarreduraDeHigiene = async (): Promise<void> => {
    const pendentes = await dependenciasDaHigieneDoAchado.fotos.pendentes(
      FOTOS_DE_ACHADO_POR_VARREDURA,
    );
    for (const foto of pendentes) {
      await fila.enqueue(TRABALHO_DE_HIGIENE_DA_FOTO_DO_ACHADO, {
        upload_intent_id: foto.uploadIntentId,
      });
    }
    if (pendentes.length === 0) return;
    console.info(
      JSON.stringify({
        evento: 'achado.higiene_enfileirada',
        enfileiradas: pendentes.length,
        pendentes_na_fila: await contarFotosDoAchadoPendentes(banco.db),
      }),
    );
  };

  const rodarVarredura = async (): Promise<void> => {
    const r = await varrerEnviosVencidos({
      repositorio: dependenciasDaFoto.repositorio,
      armazenamento: dependenciasDaFoto.armazenamento,
      clock: systemClock,
    });
    if (r.examinadas > 0) {
      console.info(JSON.stringify({ evento: 'media.purge_expired', ...r }));
    }
  };

  const localizacoes = criarLocalizacaoDeReferenciaRepository(banco.db);

  const rodarExpurgoDeLocalizacao = async (): Promise<void> => {
    const apagadas = await localizacoes.expurgarVencidas(systemClock.now());
    if (apagadas > 0) {
      console.info(JSON.stringify({ evento: 'privacy.reference_location_purged', apagadas }));
    }
  };

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

  const apagarObjetosDaConta = criarApagadorDeObjetosDaConta({
    repositorio: dependenciasDaFoto.repositorio,
    armazenamento: dependenciasDaFoto.armazenamento,
  });

  const rodarExpurgoDeContas = async (): Promise<void> => {
    const r = await expurgarContasExcluidas({
      repositorio: contas,
      trilha: trilhaDoExpurgo,
      clock: systemClock,
      apagarObjetosDaConta,
    });
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

  const rodarExpurgoDePedidos = async (): Promise<void> => {
    const removidos = await expurgarPedidosVencidos(banco.db, comoData(systemClock.now()), DIAS_DE_RETENCAO_DO_PEDIDO);
    if (removidos > 0) console.info(JSON.stringify({ evento: 'network.join_request_purge', removidos }));
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
  await rodarExpurgoDePedidos();

  const temporizadorDosPedidos = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarExpurgoDePedidos().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'network.join_request_purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS);
  temporizadorDosPedidos.unref();

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

  const temporizadorDaHigiene = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarVarreduraDeHigiene().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'achado.higiene_sweep_failed', erro: String(erro) }));
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDaHigiene.unref();

  const temporizadorDeTransferencias = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarVarreduraDeTransferencias().catch((erro: unknown) => {
      console.error(
        JSON.stringify({ evento: 'transfer.sweep_failed', erro: String(erro) }),
      );
    });
  }, INTERVALO_DA_VARREDURA_EM_MILISSEGUNDOS);
  temporizadorDeTransferencias.unref();

  const passadaDaFila = criarPassadaSemReentrada(rodarFila);

  const temporizadorDaFila = setInterval(() => {
    if (vida.estaEncerrando) return;
    passadaDaFila().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'fila.passada_falhou', erro: String(erro) }));
    });
  }, INTERVALO_DA_FILA_EM_MILISSEGUNDOS);
  temporizadorDaFila.unref();

  const passadaDeOrfaos = criarPassadaSemReentrada(rodarVarreduraDeOrfaos);

  const temporizadorDeOrfaos = setInterval(() => {
    if (vida.estaEncerrando) return;
    passadaDeOrfaos().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'fila.varredura_de_orfaos_falhou', erro: String(erro) }));
    });
  }, INTERVALO_DA_VARREDURA_DE_ORFAOS_EM_MILISSEGUNDOS);
  temporizadorDeOrfaos.unref();

  const temporizador = setInterval(() => {
    if (vida.estaEncerrando) return;
    rodarExpurgo().catch((erro: unknown) => {
      console.error(JSON.stringify({ evento: 'audit.purge_failed', erro: String(erro) }));
    });
  }, INTERVALO_DO_EXPURGO_EM_MILISSEGUNDOS);
  temporizador.unref();

  await vida.encerrado;

  clearInterval(temporizador);
  clearInterval(temporizadorDaFila);
  clearInterval(temporizadorDeOrfaos);
  clearInterval(temporizadorDaVarredura);
  clearInterval(temporizadorDaHigiene);
  clearInterval(temporizadorDaLocalizacao);
  clearInterval(temporizadorDosPedidos);
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
