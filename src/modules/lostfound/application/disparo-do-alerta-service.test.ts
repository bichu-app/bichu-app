/**
 * O disparo, orquestrado: o que ele grava, o que ele manda, e o que ele recusa.
 *
 * Esta suíte usa dublês e por isso tem um limite que precisa estar escrito: ela
 * prova a **ordem das decisões**, não que a consulta filtra. Quem prova o filtro
 * é `sete-criterios-na-consulta.test.ts` (sobre o SQL compilado) e
 * `tests/integration/alcance-e-disparo.test.ts` (contra PostGIS de verdade). Um
 * dublê que devolve a lista que eu escrevi não sabe nada sobre `ST_DWithin`.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `disparo-do-alerta-service.ts`, rodadas e vistas reprovar em
 * 22/09/2026, e depois restauradas. A conferência de que o arquivo mudou foi
 * por CONTEÚDO, e não por `git diff`: o arquivo é novo e não rastreado.
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `podeDispararDeNovo` deixando de ser consultado | 2 casos |
 * | `concluir` deixando de gravar os avisados | 3 casos |
 * | `unavailable` virando `computed` com zero | 2 casos |
 * | a gravação passando para DEPOIS do laço de envio | 1 caso |
 * | o caso encerrado deixando de ser recusado | 1 caso |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Clock } from '../../../shared/ports/index.js';
import type { CaseId, Instant, UserId } from '../../../shared/types/brands.js';
import { JANELA_DE_24H_EM_MS } from '../domain/disparo-do-alerta.js';
import type { AlcanceCalculado, AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { AvisoDeVizinhanca, EntregaDoAlerta } from '../ports/entrega-do-alerta.js';
import type {
  ConclusaoDoDisparo,
  ContextoDoCaso,
  DisparoGravado,
  RegistroDeDisparos,
} from '../ports/registro-de-disparos.js';
import { DisparoDoAlertaService } from './disparo-do-alerta-service.js';

const AGORA = 1_800_000_000_000 as Instant;
const CASO = '018f3a2b-0000-7000-8000-0000000000ca' as CaseId;
const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const DISPARO = '018f3a2b-0000-7000-8000-0000000000d1';

function vizinho(i: number, aparelhos = 1): { usuario: UserId; aparelhos: string[] } {
  return {
    usuario: `018f3a2b-0000-7000-8000-${String(i).padStart(12, '0')}` as UserId,
    aparelhos: Array.from(
      { length: aparelhos },
      (_, k) => `018f3a2b-0000-7000-8000-a${String(i)}${String(k)}${'0'.repeat(9)}`,
    ),
  };
}

interface Cenario {
  contexto?: Partial<ContextoDoCaso> | null;
  disparo?: DisparoGravado | null;
  ultimoEnvio?: Instant | null;
  alcance?: AlcanceCalculado | null;
  /** A consulta ESTOURA, em vez de devolver `null`. */
  alcanceEstoura?: boolean;
}

function montar(cenario: Cenario = {}) {
  const conclusoes: ConclusaoDoDisparo[] = [];
  const avisos: AvisoDeVizinhanca[] = [];
  /** A ordem entre gravar e mandar. Ver o caso que a cobra. */
  const linhaDoTempo: string[] = [];

  const contexto: ContextoDoCaso | null =
    cenario.contexto === null
      ? null
      : {
          caso: CASO,
          tutor: TUTOR,
          centro: { lat: -23.56, lon: -46.68 },
          bairro: 'Vila Madalena',
          nomeDoPet: 'Maia',
          especie: 'dog',
          tokenPublico: 'c-abc123xyz',
          fotoKey: 'publico/card-abc.jpg',
          aberto: true,
          ...cenario.contexto,
        };

  const disparo: DisparoGravado | null =
    cenario.disparo === null
      ? null
      : (cenario.disparo ?? {
          id: DISPARO,
          caso: CASO,
          estado: 'queued',
          destinatarios: null,
          raioEmMetros: 5000,
          tetoAtingido: false,
          pedidoEm: new Date(Number(AGORA)),
          enviadoEm: null,
        });

  const disparos: RegistroDeDisparos = {
    abrir: () => Promise.reject(new Error('o worker não abre disparo')),
    ultimoDoCaso: () => Promise.resolve(disparo),
    ultimoEnvioDoCaso: () => Promise.resolve(cenario.ultimoEnvio ?? null),
    contextoDoCaso: () => Promise.resolve(contexto),
    concluir: (entrada) => {
      conclusoes.push(entrada);
      linhaDoTempo.push('gravou');
      return Promise.resolve();
    },
  };

  const alcance: AlcanceDoAlerta = {
    alcancaveis: () => {
      if (cenario.alcanceEstoura === true) {
        return Promise.reject(new Error('relation "user_reference_locations" does not exist'));
      }
      return Promise.resolve(
        cenario.alcance === undefined
          ? { destinatarios: [vizinho(1), vizinho(2)], tetoAtingido: false }
          : cenario.alcance,
      );
    },
  };

  const entrega: EntregaDoAlerta = {
    avisar: (aviso) => {
      avisos.push(aviso);
      linhaDoTempo.push('mandou');
      return Promise.resolve('aceito');
    },
  };

  const clock: Clock = { now: () => AGORA };

  const servico = new DisparoDoAlertaService({
    disparos,
    alcance,
    entrega,
    clock,
    urlDeMidia: (chave) => `https://midia.bichu.test/${chave}`,
  });

  return { servico, conclusoes, avisos, linhaDoTempo };
}

void describe('o critério 7: um disparo por caso por dia', () => {
  void it('o caso que disparou há uma hora NÃO dispara de novo', async () => {
    const umaHoraAtras = (Number(AGORA) - 3_600_000) as Instant;
    const { servico, conclusoes, avisos } = montar({ ultimoEnvio: umaHoraAtras });

    const desfecho = await servico.disparar(CASO);

    assert.deepEqual(desfecho, { tipo: 'jaDisparou' });
    assert.deepEqual(conclusoes, [], 'gravou um disparo que não devia existir');
    assert.deepEqual(avisos, [], 'acordou a vizinhança pela segunda vez no mesmo dia');
  });

  void it('a recusa acontece ANTES da consulta cara', async () => {
    // Uma retentativa da fila contra um caso que já disparou não deve custar
    // uma varredura geoespacial para descobrir que não vai mandar nada. Se a
    // ordem se inverter, este caso continua passando pelo desfecho — por isso
    // ele cobra que a consulta que ESTOURA nem chegue a ser chamada.
    const umaHoraAtras = (Number(AGORA) - 3_600_000) as Instant;
    const { servico } = montar({ ultimoEnvio: umaHoraAtras, alcanceEstoura: true });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'jaDisparou' });
  });

  void it('passadas as 24 h o caso volta a poder disparar', async () => {
    const ontem = (Number(AGORA) - JANELA_DE_24H_EM_MS) as Instant;
    const { servico, conclusoes } = montar({ ultimoEnvio: ontem });

    const desfecho = await servico.disparar(CASO);

    assert.equal(desfecho.tipo, 'rodou');
    assert.equal(conclusoes.length, 1);
  });

  void it('a retentativa da fila é idempotente pelo mesmo critério', async () => {
    // O worker pode reentregar o trabalho depois de um reinício. A segunda
    // passada lê o `dispatched_at` que a primeira gravou e desiste — sem uma
    // trava nova, e sem 500 pessoas acordadas duas vezes.
    const { servico, avisos } = montar({ ultimoEnvio: AGORA });

    await servico.disparar(CASO);

    assert.deepEqual(avisos, []);
  });
});

void describe('o alcance vira o disparo gravado', () => {
  void it('grava `computed` com o total, e manda para cada aparelho', async () => {
    const { servico, conclusoes, avisos } = montar({
      alcance: { destinatarios: [vizinho(1), vizinho(2, 2)], tetoAtingido: false },
    });

    const desfecho = await servico.disparar(CASO);

    assert.deepEqual(desfecho, { tipo: 'rodou', estado: 'computed', avisados: 2 });
    assert.equal(conclusoes[0]?.estado, 'computed');
    // DUAS contas e TRÊS aparelhos: o número do disparo conta PESSOAS, não
    // envios. Contar aparelhos faria `reachable_tutors` crescer com quem tem
    // celular e tablet, e a tela prometeria mais vizinhos do que existem.
    assert.equal(conclusoes[0]?.avisados.length, 2);
    assert.equal(avisos.length, 3);
  });

  void it('quem foi escolhido entra em `alert_recipients`, e é a lista inteira', async () => {
    const { servico, conclusoes } = montar({
      alcance: { destinatarios: [vizinho(1), vizinho(2), vizinho(3)], tetoAtingido: false },
    });

    await servico.disparar(CASO);

    assert.deepEqual(
      conclusoes[0]?.avisados,
      [vizinho(1).usuario, vizinho(2).usuario, vizinho(3).usuario],
      'a lista gravada divergiu da lista alcançada; o teto de fadiga passaria a ' +
        'contar menos do que aconteceu e daria alertas extras no dia seguinte',
    );
  });

  void it('a gravação vem ANTES do primeiro envio', async () => {
    // Se o processo morrer no meio do laço, o pior desfecho é um disparo
    // registrado que alcançou menos gente do que diz. O desfecho oposto —
    // mandar e não registrar — faz a retentativa acordar as mesmas pessoas de
    // novo, e o teto de fadiga fica sem o que contar.
    const { servico, linhaDoTempo } = montar({
      alcance: { destinatarios: [vizinho(1), vizinho(2)], tetoAtingido: false },
    });

    await servico.disparar(CASO);

    assert.equal(linhaDoTempo[0], 'gravou');
    assert.deepEqual(linhaDoTempo, ['gravou', 'mandou', 'mandou']);
  });

  void it('o teto atingido é gravado, porque muda a leitura da métrica', async () => {
    // Critério 9 da BICHUS-18: 500 com corte e 500 sem corte são fatos
    // diferentes, e quem lê o painel meses depois não tem como distinguir os
    // dois se o fato não estiver gravado.
    const { servico, conclusoes } = montar({
      alcance: { destinatarios: [vizinho(1)], tetoAtingido: true },
    });

    await servico.disparar(CASO);

    assert.equal(conclusoes[0]?.tetoAtingido, true);
  });

  void it('alcance ZERO grava `computed` com zero, e não vira silêncio', async () => {
    // A BICHUS-20 inteira em um caso. "Não há ninguém num raio de 5 km" é uma
    // resposta, e ela precisa ficar registrada como resposta: um disparo que
    // sumisse deixaria a tela sem saber a diferença entre "ninguém por perto" e
    // "o alerta não rodou".
    const { servico, conclusoes, avisos } = montar({
      alcance: { destinatarios: [], tetoAtingido: false },
    });

    const desfecho = await servico.disparar(CASO);

    assert.deepEqual(desfecho, { tipo: 'rodou', estado: 'computed', avisados: 0 });
    assert.equal(conclusoes[0]?.estado, 'computed');
    assert.deepEqual(conclusoes[0]?.avisados, []);
    assert.deepEqual(avisos, []);
  });
});

void describe('falha de cálculo não vira zero', () => {
  void it('a consulta que ESTOURA vira `unavailable`, e nunca `computed`', async () => {
    const { servico, conclusoes } = montar({ alcanceEstoura: true });

    const desfecho = await servico.disparar(CASO);

    assert.deepEqual(desfecho, { tipo: 'rodou', estado: 'unavailable', avisados: 0 });
    assert.equal(conclusoes[0]?.estado, 'unavailable');
  });

  void it('`unavailable` e `computed` com zero são desfechos DIFERENTES', async () => {
    // ADR-0006: "mostrar zero quando houve erro é a forma mais barata de mentir
    // para alguém em pânico". Os dois casos acima passariam juntos se o serviço
    // colapsasse as duas respostas; este é o que exige que elas se distingam.
    const falhou = await montar({ alcanceEstoura: true }).servico.disparar(CASO);
    const vazio = await montar({
      alcance: { destinatarios: [], tetoAtingido: false },
    }).servico.disparar(CASO);

    assert.notDeepEqual(falhou, vazio);
  });

  void it('a consulta que devolve `null` também vira `unavailable`', async () => {
    const { servico, conclusoes } = montar({ alcance: null });

    assert.equal((await servico.disparar(CASO)).tipo, 'rodou');
    assert.equal(conclusoes[0]?.estado, 'unavailable');
  });
});

void describe('os casos em que nenhum alerta sai', () => {
  void it('caso sem coordenada não dispara, e não é falha de envio', async () => {
    // Critério 14 da BICHUS-18. Ele não deveria chegar aqui — um caso sem
    // centro nasce `no_location` e não é enfileirado — e a guarda existe porque
    // o worker recebe um identificador e não pode assumir o que o produtor fez.
    const { servico, conclusoes, avisos } = montar({ contexto: { centro: undefined } });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'semCentro' });
    assert.deepEqual(conclusoes, []);
    assert.deepEqual(avisos, []);
  });

  void it('caso ENCERRADO não acorda ninguém', async () => {
    // O animal voltou, ou a busca acabou. Um alerta que saísse agora mandaria
    // 500 pessoas procurar um pet que está em casa, e a próxima vez que o aviso
    // de verdade chegar elas já terão aprendido a ignorá-lo.
    const { servico, avisos } = montar({ contexto: { aberto: false } });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'casoEncerrado' });
    assert.deepEqual(avisos, []);
  });

  void it('caso que sumiu entre a fila e a execução devolve desfecho, e não erro', async () => {
    const { servico } = montar({ contexto: null });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'casoInexistente' });
  });

  void it('sem linha de disparo pendente nada é enviado', async () => {
    const { servico, avisos } = montar({ disparo: null });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'semDisparoPendente' });
    assert.deepEqual(avisos, []);
  });
});

void describe('o que atravessa a porta de entrega', () => {
  void it('vai o identificador do aparelho, e NUNCA um token', async () => {
    const { servico, avisos } = montar({
      alcance: { destinatarios: [vizinho(1)], tetoAtingido: false },
    });

    await servico.disparar(CASO);

    assert.equal(avisos[0]?.aparelhoId, vizinho(1).aparelhos[0]);
    assert.doesNotMatch(
      JSON.stringify(avisos[0]),
      /token(?!Publico)/i,
      'um token de aparelho atravessou a porta; ele é resolvido no instante do envio',
    );
  });

  void it('vai o bairro, e nenhuma coordenada de tutor nenhum', async () => {
    // Critério 8 da BICHUS-18. O alcance traz conta e aparelho, e nenhuma
    // distância: o dado não existe neste caminho, então não há o que vazar.
    const { servico, avisos } = montar();

    await servico.disparar(CASO);

    assert.equal(avisos[0]?.bairro, 'Vila Madalena');
    assert.doesNotMatch(JSON.stringify(avisos[0]), /-?\d{1,3}\.\d{3,}/);
  });

  void it('a URL da foto é montada na leitura, a partir da chave', async () => {
    const { servico, avisos } = montar();

    await servico.disparar(CASO);

    assert.equal(avisos[0]?.imagemUrl, 'https://midia.bichu.test/publico/card-abc.jpg');
  });

  void it('sem foto, a imagem é ausente em vez de uma URL inventada', async () => {
    const { servico, avisos } = montar({ contexto: { fotoKey: null } });

    await servico.disparar(CASO);

    assert.equal(avisos[0]?.imagemUrl, undefined);
  });
});
