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

/**
 * A decisão a partir da contagem JÁ APURADA.
 *
 * `hit` compara depois de somar (`contagem <= limite`), e `peek` compara antes
 * (`contagem < limite`). Os dois usam este mesmo cálculo para que a fronteira
 * não seja escrita duas vezes: um deslize de um em qualquer dos dois faz o
 * balde recusar uma requisição cedo demais ou tarde demais, e nada acusa.
 */
function decidir(
  contagem: number,
  limite: number,
  expiraEm: number,
  agoraEmMilissegundos: number,
): RateLimitDecision {
  if (contagem <= limite) return { allowed: true, remaining: Math.max(0, limite - contagem) };
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((expiraEm - agoraEmMilissegundos) / 1000)),
  };
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

      return Promise.resolve(decidir(balde.contagem, limite, expiraEm, agoraEmMilissegundos));
    },

    /**
     * Lê sem somar, e pergunta o que aconteceria **se** a próxima entrasse —
     * daí o `contagem + 1`. O balde com `limite` tentativas inválidas dentro já
     * chegou ao teto, e a próxima é a que precisa ser recusada antes de custar
     * trabalho. Sem o `+ 1`, a 21ª de um teto de 20 ainda passaria e só a 22ª
     * seria barrada.
     */
    peek: (bucketKey, limite, janela) => {
      const agoraEmMilissegundos = agora();
      const inicio = inicioDaJanela(agoraEmMilissegundos, janela);
      const chave = `${bucketKey}|${inicio.getTime()}`;
      const expiraEm = inicio.getTime() + janela * 1000;
      const contagem = baldes.get(chave)?.contagem ?? 0;
      return Promise.resolve(decidir(contagem + 1, limite, expiraEm, agoraEmMilissegundos));
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

      return decidir(linha.count, limite, expiraEm, agoraEmMilissegundos);
    },

    /**
     * Lê sem somar, e por isso **não** precisa ser atômico: dois pedidos
     * simultâneos lendo o mesmo balde podem ambos passar, e o pior caso é uma
     * tentativa inválida a mais sendo conferida. O que não pode escapar é a
     * contagem, e ela continua no `hit()` atômico de cima.
     */
    peek: async (bucketKey, limite, janela) => {
      const agoraEmMilissegundos = agora();
      const inicio = inicioDaJanela(agoraEmMilissegundos, janela);
      const expiraEm = inicio.getTime() + janela * 1000;

      const linha = await db
        .selectFrom('rate_limit_counters')
        .select('count')
        .where('bucket_key', '=', bucketKey)
        .where('window_start', '=', inicio)
        .executeTakeFirst();

      return decidir((linha?.count ?? 0) + 1, limite, expiraEm, agoraEmMilissegundos);
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
    peek: () => Promise.resolve({ allowed: true, remaining: Number.MAX_SAFE_INTEGER }),
    reset: () => Promise.resolve(),
  };
}
