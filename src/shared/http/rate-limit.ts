/**
 * Contador de limite de chamadas, nas duas implementações da porta.
 *
 * O limite é aplicado na borda **e revalidado aqui**: basta um job, uma rota
 * interna nova ou um endpoint publicado por engano para a borda ser contornada,
 * e aí o limite vira decoração (ADR-0001).
 *
 * O driver em memória só é correto com **uma** instância. Com duas, cada uma
 * conta o seu contador e todo número da política de `docs/04-seguranca.md` dobra
 * sem nenhum alarme. Isso não é degradação elegante, é a proteção valendo
 * metade; por isso `assertSafeBoot` recusa a subida na combinação errada.
 */
import { sql } from 'kysely';
import type { Db } from '../db/pool.js';
import type { RateLimitDecision, RateLimitStore } from '../ports/rate-limit-store.js';

export function janelaEmSegundos(janela: string): number {
  const casado = /^(\d+)(s|m|h|d)$/.exec(janela.trim());
  if (casado === null) throw new Error(`Janela de limite malformada: ${janela}`);
  const quantidade = Number.parseInt(casado[1] ?? '0', 10);
  const fatores = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  const unidade = casado[2] as keyof typeof fatores;
  return quantidade * fatores[unidade];
}

function inicioDaJanela(agoraEmMilissegundos: number, janelaEmSegundos: number): Date {
  const janelaEmMilissegundos = janelaEmSegundos * 1000;
  return new Date(Math.floor(agoraEmMilissegundos / janelaEmMilissegundos) * janelaEmMilissegundos);
}

export function criarContadorEmMemoria(agora: () => number): RateLimitStore {
  const baldes = new Map<string, { expiraEm: number; contagem: number }>();

  return {
    hit: (bucketKey, limite, janela) => {
      const agoraEmMilissegundos = agora();
      const inicio = inicioDaJanela(agoraEmMilissegundos, janela);
      const chave = `${bucketKey}|${inicio.getTime()}`;
      const expiraEm = inicio.getTime() + janela * 1000;

      // Varredura preguiçosa: sem ela o mapa cresce com toda chave já vencida, e
      // "limite em memória" vira vazamento de memória em produção.
      for (const [existente, valor] of baldes) {
        if (valor.expiraEm <= agoraEmMilissegundos) baldes.delete(existente);
      }

      const balde = baldes.get(chave) ?? { expiraEm, contagem: 0 };
      balde.contagem += 1;
      baldes.set(chave, balde);

      const permitido = balde.contagem <= limite;
      const decisao: RateLimitDecision = permitido
        ? { allowed: true, remaining: Math.max(0, limite - balde.contagem) }
        : {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((expiraEm - agoraEmMilissegundos) / 1000)),
          };
      return Promise.resolve(decisao);
    },

    reset: (prefixo) => {
      for (const chave of baldes.keys()) {
        if (prefixo === undefined || chave.startsWith(prefixo)) baldes.delete(chave);
      }
      return Promise.resolve();
    },
  };
}

export function criarContadorEmPostgres(
  db: Db,
  agora: () => number,
  producao: boolean,
): RateLimitStore {
  return {
    hit: async (bucketKey, limite, janela) => {
      const agoraEmMilissegundos = agora();
      const inicio = inicioDaJanela(agoraEmMilissegundos, janela);
      const expiraEm = inicio.getTime() + janela * 1000;

      // Incremento atômico: ler e depois somar permitiria a dois pedidos
      // simultâneos passarem pelo mesmo teto.
      const linha = await db
        .insertInto('rate_limit_counters')
        .values({ bucket_key: bucketKey, window_start: inicio, count: 1 })
        .onConflict((oc) =>
          oc.columns(['bucket_key', 'window_start']).doUpdateSet({
            count: sql<number>`rate_limit_counters.count + 1`,
          }),
        )
        .returning('count')
        .executeTakeFirstOrThrow();

      if (linha.count <= limite) {
        return { allowed: true, remaining: Math.max(0, limite - linha.count) };
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((expiraEm - agoraEmMilissegundos) / 1000)),
      };
    },

    reset: async (prefixo) => {
      // Só existe para o preparo de cenário de teste. Recusa em produção: um
      // zerador de contador alcançável em produção é o próprio limite desligado.
      if (producao) {
        throw new Error('Zerar contador de limite não é permitido em produção.');
      }
      let consulta = db.deleteFrom('rate_limit_counters');
      if (prefixo !== undefined) {
        consulta = consulta.where('bucket_key', 'like', `${prefixo}%`);
      }
      await consulta.execute();
    },
  };
}

/** Sempre permite. Existe só para `RATE_LIMIT_DRIVER=disabled` fora de produção. */
export function criarContadorDesligado(): RateLimitStore {
  return {
    hit: () => Promise.resolve({ allowed: true, remaining: Number.MAX_SAFE_INTEGER }),
    reset: () => Promise.resolve(),
  };
}
