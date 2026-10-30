/** ISCA — `marcarVista` GRAVA e SO DEPOIS conta, com o MESMO instante. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Clock } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import {
  criarContadoresDeSecaoService,
  type DependenciasDosContadores,
} from './contadores-de-secao-service.js';
import type { ContagemDePerdidosNovos } from '../../lostfound/ports/contagem-de-perdidos-novos.js';
import type { ContagemDeEventosNovos } from '../../network/ports/contagem-de-eventos-novos.js';
import type { ContagemDeEntradasNovas } from '../../professionals/ports/contagem-de-entradas-novas.js';
import type { MarcadoresDeSecao, SecaoComContador } from '../ports/marcadores-de-secao.js';

const CONTA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PRIMEIRO = 1_792_500_000_000 as Instant;

interface Diario {
  readonly passos: string[];
  instanteDaEscrita?: Instant;
  instanteDaContagem?: Instant;
  cidadeDaContagem?: string | undefined;
}

/** Um relogio que ANDA a cada leitura. */
function relogioQueAnda(diario: Diario): Clock {
  let proximo = PRIMEIRO;
  return {
    now: () => {
      const valor = proximo;
      proximo = (proximo + 1_000) as Instant;
      diario.passos.push('relogio');
      return valor;
    },
  };
}

/** As quatro portas, dubladas. */
function portasDeTeste(diario: Diario): DependenciasDosContadores {
  const marcadores: MarcadoresDeSecao = {
    ler: () => {
      diario.passos.push('ler marcadores');
      return Promise.resolve({});
    },
    marcarVista: (_chamador: UserId, _secao: SecaoComContador, agora: Instant) => {
      diario.passos.push('marcarVista');
      diario.instanteDaEscrita = agora;
      return Promise.resolve();
    },
  };
  const perdidos: ContagemDePerdidosNovos = {
    contar: (recorte) => {
      diario.passos.push('contar');
      diario.instanteDaContagem = recorte.agora;
      diario.cidadeDaContagem = recorte.cidade;
      return Promise.resolve(0);
    },
  };
  const eventos: ContagemDeEventosNovos = { contar: () => Promise.resolve(7) };
  const diretorio: ContagemDeEntradasNovas = { contar: () => Promise.resolve(11) };
  return { marcadores, perdidos, eventos, diretorio, clock: relogioQueAnda(diario) };
}

function servico(diario: Diario) {
  return criarContadoresDeSecaoService(portasDeTeste(diario));
}

void describe('ISCA: marcar a area vista grava antes de contar', () => {
  void it('ISCA: grava e SO DEPOIS conta -- a resposta nao traz o numero de antes', async () => {
    const diario: Diario = { passos: [] };
    await servico(diario).marcarVista({ userId: CONTA }, 'pets');
    assert.deepEqual(
      diario.passos.filter((p) => p !== 'relogio' && p !== 'ler marcadores'),
      ['marcarVista', 'contar'],
      'REPROVA: a ordem nao foi gravar-depois-contar. Contando antes, a resposta ' +
        'devolve o numero de ANTES da visita e a tela acende de novo o selo que a ' +
        'pessoa acabou de olhar -- indistinguivel, na tela, de o contador nao zerar.',
    );
  });

  void it('ISCA: o marcador e a contagem usam o MESMO instante', async () => {
    const diario: Diario = { passos: [] };
    await servico(diario).marcarVista({ userId: CONTA }, 'network_events');
    assert.equal(
      diario.instanteDaContagem,
      diario.instanteDaEscrita,
      'REPROVA: a escrita e a contagem receberam instantes DIFERENTES, quer dizer ' +
        'que o servico leu o relogio duas vezes. O item publicado no vao entre os ' +
        'dois sai da contagem sem nunca ter sido visto -- conteudo que desaparece, ' +
        'e nao numero que repete.',
    );
  });

  void it('ISCA: a cidade atravessa para a contagem da resposta', async () => {
    const diario: Diario = { passos: [] };
    await servico(diario).marcarVista({ userId: CONTA }, 'pets', 'Campinas');
    assert.equal(
      diario.cidadeDaContagem,
      'Campinas',
      'REPROVA: a cidade nao chegou na contagem da resposta. O corpo devolvido e o ' +
        'que a barra vai pintar; recalculado sem a cidade, ele discorda do selo que ' +
        'a leitura acabou de produzir no mesmo aparelho.',
    );
  });

  void it('ISCA: `contar` sozinho NAO escreve marcador -- ler nao e ver', async () => {
    const diario: Diario = { passos: [] };
    await servico(diario).contar({ userId: CONTA });
    assert.equal(
      diario.instanteDaEscrita,
      undefined,
      'REPROVA: a leitura dos contadores escreveu marcador. Pintar a barra nao e ' +
        'ver a area: a barra e desenhada em TODA tela, e zerar ao desenhar apagaria ' +
        'a contagem de quem nunca entrou na secao.',
    );
  });
});
