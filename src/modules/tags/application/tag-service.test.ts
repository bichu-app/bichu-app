/**
 * As operações da tag. O que se prova aqui é o **efeito**, não a chamada.
 *
 * Três casos abaixo são os que o ADR-0021 e o ADR-0004 mandaram existir, e os
 * três são escritos de forma que passar por engano seja difícil:
 *
 * - **O corpo público é o mesmo nos três `viewer`.** A asserção não lê campo por
 *   campo: ela serializa a resposta inteira sem o `viewer` e compara os três
 *   textos. Um ramo privilegiado acrescentado depois quebra aqui, mesmo que
 *   quem o acrescentou não conheça este teste.
 * - **`getTagOwnerContext` faz UMA consulta, e é a vinculada.** O repositório de
 *   memória conta as chamadas dos dois métodos: a prova de que não há "busca a
 *   tag e compara o dono depois" é `resolverPorCodigo` ter sido chamado zero
 *   vezes.
 * - **Tag revogada responde 410 e o aviso nunca é descartado.** O contador de
 *   linhas gravadas é o que sustenta a segunda metade: agrupar muda
 *   `owner_notified`, não muda quantos avisos existem.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../../../shared/http/errors.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../shared/ports/index.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  PetId,
  TagId,
  UserId,
} from '../../../shared/types/brands.js';
import { comoData, comoIso } from '../../../shared/time/clock.js';
import { criarTagService, type Chamador } from './tag-service.js';
import type {
  AvisoRecente,
  ContextoDoDono,
  NovaTag,
  NovoAviso,
  NovoScan,
  ResultadoDaEmissao,
  TagDoTutor,
  TagRepository,
  TagResolvida,
} from '../ports/tag-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;

const CODIGO = '7K2F-9QJB-3XR0-5TWD-8MNC-VH12-34';
const AGORA = 1_800_000_000_000;

function petPadrao(): TagResolvida['pet'] {
  return {
    displayName: 'Thor',
    species: 'dog',
    breedLabel: 'Vira-lata',
    size: 'M',
    primaryColor: 'preto e branco',
    distinctiveMarks: 'Coleira vermelha.',
    careNotes: 'É medroso. Não corra atrás.',
    isLost: true,
  };
}

interface EstadoDoRepositorio {
  tag?: TagResolvida;
  contextoDoDono?: ContextoDoDono;
  avisoRecente?: AvisoRecente;
  jaAvisou?: boolean;
  emissao?: ResultadoDaEmissao;
}

interface Contadores {
  resolverPorCodigo: number;
  buscarContextoDoDono: number;
  scansGravados: NovoScan[];
  avisosGravados: NovoAviso[];
  tagsEmitidas: NovaTag[];
  donoUsadoNaBusca: (UserId | undefined)[];
}

function repositorioDeMemoria(
  estado: EstadoDoRepositorio,
): { repositorio: TagRepository; contadores: Contadores } {
  const contadores: Contadores = {
    resolverPorCodigo: 0,
    buscarContextoDoDono: 0,
    scansGravados: [],
    avisosGravados: [],
    tagsEmitidas: [],
    donoUsadoNaBusca: [],
  };

  const repositorio: TagRepository = {
    resolverPorCodigo: () => {
      contadores.resolverPorCodigo += 1;
      return Promise.resolve(estado.tag);
    },
    buscarContextoDoDono: (_hash, dono) => {
      contadores.buscarContextoDoDono += 1;
      contadores.donoUsadoNaBusca.push(dono);
      // O repositório de verdade resolve os dois predicados no banco. Aqui o
      // vínculo é reproduzido: quem não é o dono do estado não recebe nada, e
      // recebe exatamente o mesmo nada de quem pediu um código inexistente.
      if (estado.contextoDoDono === undefined) return Promise.resolve(undefined);
      return Promise.resolve(dono === DONO ? estado.contextoDoDono : undefined);
    },
    listarTagsDoPet: (_petId, dono) =>
      Promise.resolve(dono === DONO ? ([] as readonly TagDoTutor[]) : undefined),
    emitir: (nova) => {
      contadores.tagsEmitidas.push(nova);
      return Promise.resolve(
        estado.emissao ?? {
          tipo: 'emitida',
          tag: {
            id: nova.id,
            status: 'active',
            codeSuffix: nova.codeSuffix,
            label: nova.label,
            scanCount: 0,
            lastScannedAt: null,
            revokedAt: null,
            revocationReason: null,
            createdAt: comoData(AGORA as Instant),
          },
        },
      );
    },
    registrarScan: (scan) => {
      contadores.scansGravados.push(scan);
      return Promise.resolve();
    },
    registrarAviso: (aviso) => {
      contadores.avisosGravados.push(aviso);
      return Promise.resolve();
    },
    avisoRecenteDoMesmoAchador: () => Promise.resolve(estado.avisoRecente),
    jaAvisouRecentemente: () => Promise.resolve(estado.jaAvisou ?? false),
  };

  return { repositorio, contadores };
}

function servico(estado: EstadoDoRepositorio) {
  const { repositorio, contadores } = repositorioDeMemoria(estado);
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => AGORA as Instant };
  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => {
      sequencia += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sequencia).padStart(4, '0')}`;
    },
    opaqueToken: () => `token-${String(sequencia)}` as OpaqueToken,
    random128: () => new Uint8Array(16).fill(0x2b),
  };
  const cifra: SecretCipher = {
    encrypt: (texto) => Promise.resolve(new TextEncoder().encode(texto)),
    decrypt: (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
  };

  return {
    tags: criarTagService({
      repositorio,
      cifra,
      ids,
      clock,
      trilha,
      baseDaTag: 'https://exemplo.invalido' as AbsoluteUrl,
      baseDaWeb: 'https://exemplo.invalido' as AbsoluteUrl,
    }),
    contadores,
    eventos,
  };
}

function chamador(userId: UserId | undefined): Chamador {
  return {
    userId,
    ipHmac: new Uint8Array(32).fill(1),
    userAgentHash: new Uint8Array(32).fill(2),
    identidadeDoAchador: new Uint8Array(32).fill(3),
    ip: '203.0.113.7',
    correlationId: '018f3a2b-0000-7000-8000-000000000fff',
  };
}

function tagAtiva(): TagResolvida {
  return {
    tagId: TAG,
    petId: PET,
    ownerUserId: DONO,
    status: 'active',
    petIndisponivel: false,
    pet: petPadrao(),
  };
}

async function capturar(executar: () => Promise<unknown>): Promise<AppError> {
  try {
    await executar();
  } catch (erro) {
    assert.ok(erro instanceof AppError, `esperava AppError e veio ${String(erro)}`);
    return erro;
  }
  throw new Error('a operação não recusou, e deveria ter recusado');
}

void describe('resolveTagCode: a operação mais pública do produto', () => {
  void it('devolve o MESMO corpo para os três valores de viewer', async () => {
    const semViewer = async (quem: UserId | undefined): Promise<string> => {
      const { tags } = servico({ tag: tagAtiva() });
      const resolucao = await tags.resolver(CODIGO, chamador(quem));
      // A cópia sem `viewer` é feita por remoção de chave, e não listando os
      // campos esperados: um ramo privilegiado acrescentado depois entra na
      // serialização sozinho, e a comparação acusa sem ninguém atualizar o teste.
      const copia: Record<string, unknown> = { ...resolucao };
      delete copia['viewer'];
      return JSON.stringify(copia);
    };

    const doDono = await semViewer(DONO);
    const deOutroLogado = await semViewer(OUTRO_TUTOR);
    const deQuemNaoTemConta = await semViewer(undefined);

    assert.equal(doDono, deOutroLogado);
    assert.equal(doDono, deQuemNaoTemConta);
  });

  void it('`viewer` é sinal de navegação, e é o único campo que muda', async () => {
    const { tags } = servico({ tag: tagAtiva() });
    assert.equal((await tags.resolver(CODIGO, chamador(DONO))).viewer, 'owner');
    assert.equal((await tags.resolver(CODIGO, chamador(OUTRO_TUTOR))).viewer, 'authenticated_other');
    assert.equal((await tags.resolver(CODIGO, chamador(undefined))).viewer, 'anonymous');
  });

  void it('não devolve UUID nenhum, nem para o dono', async () => {
    const { tags } = servico({ tag: tagAtiva() });
    const serializada = JSON.stringify(await tags.resolver(CODIGO, chamador(DONO)));
    // A busca é por forma, e não por nome de campo: um `pet_id` renomeado para
    // `identificador` continuaria sendo o vazamento que o SEC-001 descreve.
    assert.doesNotMatch(serializada, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  void it('grava exatamente um scan por leitura', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    await tags.resolver(CODIGO, chamador(undefined));
    await tags.resolver(CODIGO, chamador(undefined));
    assert.equal(contadores.scansGravados.length, 2);
    assert.equal(contadores.scansGravados.every((scan) => !scan.resultouEmAviso), true);
  });

  void it('o scan guarda o HMAC do endereço, nunca o endereço', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    await tags.resolver(CODIGO, chamador(undefined));
    const gravado = JSON.stringify(contadores.scansGravados[0]);
    assert.doesNotMatch(gravado, /203\.0\.113/);
  });

  void it('tag revogada responde 410 com next_action, e NUNCA 404', async () => {
    const { tags } = servico({ tag: { ...tagAtiva(), status: 'revoked' } });
    const erro = await capturar(() => tags.resolver(CODIGO, chamador(undefined)));
    assert.equal(erro.status, 410);
    assert.equal(erro.problemType, 'tag-revoked');
    assert.equal(erro.nextAction, 'register_stray_found_report');
  });

  void it('pet indisponível responde o mesmo 410, sem dizer por quê', async () => {
    // Óbito e exclusão chegam aqui. O corpo é idêntico ao da tag revogada de
    // propósito: ninguém precisa descobrir a morte de um animal por uma página
    // web (ADR-0004).
    const { tags } = servico({ tag: { ...tagAtiva(), petIndisponivel: true } });
    const erro = await capturar(() => tags.resolver(CODIGO, chamador(undefined)));
    assert.equal(erro.status, 410);
    assert.equal(erro.problemType, 'tag-revoked');
    assert.equal(erro.detail, 'Esta tag foi desativada pelo tutor.');
  });

  void it('tag revogada NÃO grava scan: a leitura não chegou a acontecer', async () => {
    const { tags, contadores } = servico({ tag: { ...tagAtiva(), status: 'revoked' } });
    await capturar(() => tags.resolver(CODIGO, chamador(undefined)));
    assert.equal(contadores.scansGravados.length, 0);
  });

  void it('código bem formado e inexistente é 404, diferente de revogado', async () => {
    const { tags } = servico({});
    const erro = await capturar(() => tags.resolver(CODIGO, chamador(undefined)));
    assert.equal(erro.status, 404);
    assert.equal(erro.problemType, 'tag-code-not-found');
  });

  void it('texto que não normaliza é 400, e não 404: é erro de digitação', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    const erro = await capturar(() => tags.resolver('U' + CODIGO, chamador(undefined)));
    assert.equal(erro.status, 400);
    assert.equal(erro.problemType, 'tag-code-malformed');
    // E o banco nem foi tocado: o formato se decide antes da consulta.
    assert.equal(contadores.resolverPorCodigo, 0);
  });
});

void describe('getTagOwnerContext: a busca vinculada do ADR-0021', () => {
  void it('faz UMA consulta, e é a que leva o dono junto do código', async () => {
    const { tags, contadores } = servico({
      tag: tagAtiva(),
      contextoDoDono: { petId: PET, tagId: TAG },
    });
    await tags.contextoDoDono(CODIGO, DONO);

    assert.equal(contadores.buscarContextoDoDono, 1);
    // Esta é a asserção que sustenta a regra. Se alguém trocar a implementação
    // por "busca a tag e compara o dono depois", `resolverPorCodigo` passa a ser
    // chamado e o teste acusa — que é a diferença entre a versão correta e o
    // BOLA que o SEC-001 descreve.
    assert.equal(contadores.resolverPorCodigo, 0);
    assert.deepEqual(contadores.donoUsadoNaBusca, [DONO]);
  });

  void it('devolve os identificadores ao dono', async () => {
    const { tags } = servico({ contextoDoDono: { petId: PET, tagId: TAG } });
    assert.deepEqual(await tags.contextoDoDono(CODIGO, DONO), { petId: PET, tagId: TAG });
  });

  void it('404 idêntico nos três casos que não são do dono', async () => {
    const inexistente = await capturar(() => servico({}).tags.contextoDoDono(CODIGO, DONO));

    const revogada = await capturar(() =>
      // Tag que existe e foi revogada: o repositório vinculado exige `active`,
      // então o resultado que chega aqui é o mesmo vazio.
      servico({ tag: { ...tagAtiva(), status: 'revoked' } }).tags.contextoDoDono(CODIGO, DONO),
    );

    const deOutroTutor = await capturar(() =>
      servico({ contextoDoDono: { petId: PET, tagId: TAG } }).tags.contextoDoDono(
        CODIGO,
        OUTRO_TUTOR,
      ),
    );

    for (const erro of [inexistente, revogada, deOutroTutor]) {
      assert.equal(erro.status, 404);
      assert.equal(erro.problemType, 'not-found');
    }
    // Corpos idênticos: distinguir confirmaria tag alheia a qualquer pessoa com
    // conta, e faria da rota um oráculo de enumeração com cadastro grátis.
    assert.equal(inexistente.title, deOutroTutor.title);
    assert.equal(inexistente.detail, deOutroTutor.detail);
    assert.equal(revogada.title, deOutroTutor.title);
  });
});

void describe('issuePetTag: a única resposta que traz o código em claro', () => {
  void it('grava o resumo e o cifrado, e nunca o código', async () => {
    const { tags, contadores } = servico({});
    const emitida = await tags.emitir(PET, DONO, 'coleira do dia a dia', chamador(DONO));
    const gravada = contadores.tagsEmitidas[0];
    assert.ok(gravada !== undefined);

    assert.equal(gravada.codeHash.length, 32);
    assert.equal(gravada.codeSuffix, emitida.codigo.slice(-4));
    // O que a coluna de resumo guarda não é o código: um SHA-256 de 32 bytes
    // não contém os 26 caracteres, e a conferência abaixo é a que acusaria
    // alguém trocando o resumo pelo valor.
    assert.notEqual(Buffer.from(gravada.codeHash).toString('utf8'), emitida.codigo);
  });

  void it('a URL impressa aponta para o código, e o código não vira URL no banco', async () => {
    const { tags, contadores } = servico({});
    const emitida = await tags.emitir(PET, DONO, null, chamador(DONO));
    assert.equal(emitida.url, `https://exemplo.invalido/t/${emitida.codigo}`);
    assert.doesNotMatch(JSON.stringify(contadores.tagsEmitidas[0]), /https?:/);
  });

  void it('a trilha registra a emissão sem o código', async () => {
    const { tags, eventos } = servico({});
    const emitida = await tags.emitir(PET, DONO, null, chamador(DONO));
    const evento = eventos[0];
    assert.ok(evento !== undefined);
    assert.equal(evento.action, 'tag.issued');
    assert.equal(evento.actorUserId, DONO);
    assert.doesNotMatch(JSON.stringify(evento), new RegExp(emitida.codigo));
  });

  void it('teto de cinco tags ativas responde 409', async () => {
    const { tags } = servico({ emissao: { tipo: 'teto_de_ativas' } });
    const erro = await capturar(() => tags.emitir(PET, DONO, null, chamador(DONO)));
    assert.equal(erro.status, 409);
  });

  void it('teto diário responde 429 com Retry-After', async () => {
    const { tags } = servico({ emissao: { tipo: 'teto_diario', retryAfterSeconds: 86_400 } });
    const erro = await capturar(() => tags.emitir(PET, DONO, null, chamador(DONO)));
    assert.equal(erro.status, 429);
    assert.equal(erro.retryAfterSeconds, 86_400);
  });

  void it('pet de outro tutor é 404, e não 403', async () => {
    const { tags } = servico({ emissao: { tipo: 'pet_nao_e_deste_tutor' } });
    const erro = await capturar(() => tags.emitir(PET, OUTRO_TUTOR, null, chamador(OUTRO_TUTOR)));
    assert.equal(erro.status, 404);
  });
});

void describe('createFoundReportFromTag: o aviso de quem achou', () => {
  void it('funciona com corpo vazio: um toque, zero campos', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    const criado = await tags.avisar(CODIGO, chamador(undefined), {});
    assert.equal(contadores.avisosGravados.length, 1);
    assert.equal(criado.ownerNotified, true);
    assert.equal(criado.petDisplayName, 'Thor');
  });

  void it('não devolve identificador interno a quem não tem conta', async () => {
    const { tags } = servico({ tag: tagAtiva() });
    const criado = await tags.avisar(CODIGO, chamador(undefined), {});
    assert.doesNotMatch(
      JSON.stringify(criado),
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  void it('guarda o resumo do token do achador, nunca o token', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    const criado = await tags.avisar(CODIGO, chamador(undefined), {});
    const gravado = contadores.avisosGravados[0];
    assert.ok(gravado !== undefined);
    assert.equal(gravado.finderTokenHash.length, 32);
    assert.doesNotMatch(JSON.stringify(gravado), new RegExp(criado.finderToken));
  });

  void it('agrupar muda `owner_notified` e NÃO descarta o aviso', async () => {
    const { tags, contadores } = servico({
      tag: tagAtiva(),
      avisoRecente: { id: 'anterior', criadoEm: comoData((AGORA - 3600_000) as Instant) },
    });
    const criado = await tags.avisar(CODIGO, chamador(undefined), {});

    assert.equal(criado.ownerNotified, false);
    // A metade que costuma faltar: o aviso continua existindo. Contar a linha
    // gravada é o que separa "agrupou" de "engoliu".
    assert.equal(contadores.avisosGravados.length, 1);
  });

  void it('marca o scan como originador do aviso', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    await tags.avisar(CODIGO, chamador(undefined), {});
    assert.equal(contadores.scansGravados.length, 1);
    assert.equal(contadores.scansGravados[0]?.resultouEmAviso, true);
  });

  void it('tag revogada responde 410 e não grava aviso nenhum', async () => {
    const { tags, contadores } = servico({ tag: { ...tagAtiva(), status: 'revoked' } });
    const erro = await capturar(() => tags.avisar(CODIGO, chamador(undefined), {}));
    assert.equal(erro.status, 410);
    assert.equal(contadores.avisosGravados.length, 0);
  });

  void it('recusa `found_at` no futuro', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    const futuro = comoIso((AGORA + 3600_000) as Instant);
    const erro = await capturar(() => tags.avisar(CODIGO, chamador(undefined), { foundAt: futuro }));
    assert.equal(erro.status, 400);
    assert.equal(contadores.avisosGravados.length, 0);
  });

  void it('aceita `found_at` no passado: o achador pode avisar horas depois', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    const passado = AGORA - 7200_000;
    await tags.avisar(CODIGO, chamador(undefined), {
      foundAt: comoIso(passado as Instant),
    });
    assert.equal(contadores.avisosGravados[0]?.foundAt, passado);
  });

  void it('sem `found_at`, a hora é do servidor', async () => {
    const { tags, contadores } = servico({ tag: tagAtiva() });
    await tags.avisar(CODIGO, chamador(undefined), {});
    assert.equal(contadores.avisosGravados[0]?.foundAt, AGORA);
  });
});
