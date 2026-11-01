import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Clock } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
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
  alcanceEstoura?: boolean;
}

function montar(cenario: Cenario = {}) {
  const conclusoes: ConclusaoDoDisparo[] = [];
  const avisos: AvisoDeVizinhanca[] = [];
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
          pedidoEm: comoData(AGORA),
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
    const { servico, linhaDoTempo } = montar({
      alcance: { destinatarios: [vizinho(1), vizinho(2)], tetoAtingido: false },
    });

    await servico.disparar(CASO);

    assert.equal(linhaDoTempo[0], 'gravou');
    assert.deepEqual(linhaDoTempo, ['gravou', 'mandou', 'mandou']);
  });

  void it('o teto atingido é gravado, porque muda a leitura da métrica', async () => {
    const { servico, conclusoes } = montar({
      alcance: { destinatarios: [vizinho(1)], tetoAtingido: true },
    });

    await servico.disparar(CASO);

    assert.equal(conclusoes[0]?.tetoAtingido, true);
  });

  void it('alcance ZERO grava `computed` com zero, e não vira silêncio', async () => {
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
    const { servico, conclusoes, avisos } = montar({ contexto: { centro: undefined } });

    assert.deepEqual(await servico.disparar(CASO), { tipo: 'semCentro' });
    assert.deepEqual(conclusoes, []);
    assert.deepEqual(avisos, []);
  });

  void it('caso ENCERRADO não acorda ninguém', async () => {
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
