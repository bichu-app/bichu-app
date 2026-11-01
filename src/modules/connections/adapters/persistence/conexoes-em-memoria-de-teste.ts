import type { Instant, UserId } from '../../../../shared/types/brands.js';
import {
  arestaMorta,
  type ArestaGuardada,
  type EstadoGuardado,
  type OrigemDoPedido,
} from '../../domain/conexao.js';
import type { ContagensDaConta } from '../../domain/teto-de-conexoes.js';
import {
  TETO_DE_CONEXOES,
  TETO_DE_PEDIDOS_POR_DIA,
  TETO_DE_PENDENTES_ENVIADOS,
} from '../../domain/teto-de-conexoes.js';
import type {
  ArestaComApelido,
  ConnectionsRepository,
  Encerramento,
  NovoPedido,
  PaginaDeConexoes,
  PaginaDePedidos,
  RecorteDeConexoes,
  RecortePedidos,
} from '../../ports/connections-repository.js';

const DIA = 86_400_000;

interface LinhaEmMemoria {
  ref: string;
  pedinte: UserId;
  destinatario: UserId;
  estado: EstadoGuardado;
  origem: OrigemDoPedido;
  pedidoEm: number;
  expiraEm: number;
  descansoAte: number | null;
}

export interface PessoaDeTeste {
  readonly id: UserId;
  readonly apelido: string | null;
  readonly nomeDeExibicao: string | null;
  /** `false` reproduz `conta_habilitada(uuid) = false`. */
  readonly habilitada: boolean;
  /**
   * Reproduz o `EXISTS` de `pets` com `pet_photos.status = 'ready'` — o segundo
   * sinal do contador de convidados (21/10/2026).
   */
  readonly petComFotoPronta?: boolean;
  /**
   * O SELO DE VALIDADO. `true` reproduz `email_verified_at IS NOT NULL OR
   * phone_verified_at IS NOT NULL`.
   */
  readonly canalVerificado?: boolean;
  /** Quantos pets não apagados, para a lista das próprias conexões (22/10/2026). */
  readonly pets?: number;
  /** A chave da derivada `thumb` da foto, ou `null`. */
  readonly chaveDaFoto?: string | null;
}

export interface BancadaDeConexoes {
  readonly repositorio: ConnectionsRepository;
  readonly linhas: LinhaEmMemoria[];
  /** Semeia uma aresta já no estado pedido, sem passar pelos tetos. */
  semear(linha: Partial<LinhaEmMemoria> & Pick<LinhaEmMemoria, 'pedinte' | 'destinatario'>): string;
  desabilitar(pessoa: UserId): void;
  reabilitar(pessoa: UserId): void;
}

function par(um: UserId, outro: UserId): string {
  return [um, outro].sort().join('|');
}

export function conexoesEmMemoria(
  pessoas: readonly PessoaDeTeste[],
  agoraBase: Instant,
): BancadaDeConexoes {
  const linhas: LinhaEmMemoria[] = [];
  const estado = new Map<UserId, PessoaDeTeste>(pessoas.map((p) => [p.id, p]));
  let sequencia = 0;

  const habilitada = (id: UserId): boolean => estado.get(id)?.habilitada === true;
  const viva = (l: LinhaEmMemoria): boolean => habilitada(l.pedinte) && habilitada(l.destinatario);

  function comoAresta(l: LinhaEmMemoria, quemChama: UserId): ArestaGuardada {
    const souQuemPediu = l.pedinte === quemChama;
    const outroLado = souQuemPediu ? l.destinatario : l.pedinte;
    const pessoa = estado.get(outroLado);
    return {
      ref: l.ref,
      estado: l.estado,
      souQuemPediu,
      pedidoEm: l.pedidoEm as Instant,
      expiraEm: l.expiraEm as Instant,
      descansoAte: l.descansoAte === null ? null : (l.descansoAte as Instant),
      outraPessoa: {
        apelido: pessoa?.apelido ?? null,
        nomeDeExibicao: pessoa?.nomeDeExibicao ?? null,
        canalVerificado: pessoa?.canalVerificado ?? false,
      },
    };
  }

  function contarConexoesDe(pessoa: UserId): number {
    return linhas.filter(
      (l) => l.estado === 'accepted' && (l.pedinte === pessoa || l.destinatario === pessoa) && viva(l),
    ).length;
  }

  const repositorio: ConnectionsRepository = {
    contagens: (pessoa: UserId, agora: Instant): Promise<ContagensDaConta> =>
      Promise.resolve({
        conexoes: contarConexoesDe(pessoa),
        pendentesEnviados: linhas.filter(
          (l) => l.estado === 'pending' && l.pedinte === pessoa && l.expiraEm > Number(agora),
        ).length,
        pedidosNasUltimas24h: linhas.filter(
          (l) => l.pedinte === pessoa && l.pedidoEm > Number(agora) - DIA,
        ).length,
      }),

    contarConexoes: (pessoa: UserId) => Promise.resolve(contarConexoesDe(pessoa)),

    contarConvidadosQueEntraram: (pessoa: UserId) =>
      Promise.resolve(
        linhas.filter(
          (l) =>
            l.estado === 'accepted' &&
            l.destinatario === pessoa &&
            l.origem === 'invite_link' &&
            viva(l) &&
            estado.get(l.pedinte)?.petComFotoPronta === true,
        ).length,
      ),

    arestaDoPar: (quemChama: UserId, outro: UserId) => {
      const achada = linhas.find(
        (l) => par(l.pedinte, l.destinatario) === par(quemChama, outro) && viva(l),
      );
      return Promise.resolve(achada === undefined ? undefined : comoAresta(achada, quemChama));
    },

    arestaPorRef: (ref: string, quemChama: UserId) => {
      const achada = linhas.find(
        (l) =>
          l.ref === ref && (l.pedinte === quemChama || l.destinatario === quemChama) && viva(l),
      );
      return Promise.resolve(achada === undefined ? undefined : comoAresta(achada, quemChama));
    },

    pedir: (pedido: NovoPedido) => {
      if (!habilitada(pedido.quemPede) || !habilitada(pedido.alvo)) return Promise.resolve(undefined);
      const agora = Number(pedido.agora);
      if (contarConexoesDe(pedido.quemPede) >= TETO_DE_CONEXOES) return Promise.resolve(undefined);
      if (contarConexoesDe(pedido.alvo) >= TETO_DE_CONEXOES) return Promise.resolve(undefined);
      const pendentes = linhas.filter(
        (l) => l.estado === 'pending' && l.pedinte === pedido.quemPede && l.expiraEm > agora,
      ).length;
      if (pendentes >= TETO_DE_PENDENTES_ENVIADOS) return Promise.resolve(undefined);
      const doDia = linhas.filter(
        (l) => l.pedinte === pedido.quemPede && l.pedidoEm > agora - DIA,
      ).length;
      if (doDia >= TETO_DE_PEDIDOS_POR_DIA) return Promise.resolve(undefined);

      const existente = linhas.find(
        (l) => par(l.pedinte, l.destinatario) === par(pedido.quemPede, pedido.alvo),
      );
      if (existente !== undefined && !arestaMorta(comoAresta(existente, pedido.quemPede), pedido.agora)) {
        return Promise.resolve(undefined);
      }
      const nova: LinhaEmMemoria = {
        ref: pedido.ref,
        pedinte: pedido.quemPede,
        destinatario: pedido.alvo,
        estado: 'pending',
        origem: pedido.origem,
        pedidoEm: agora,
        expiraEm: agora + 30 * DIA,
        descansoAte: null,
      };
      if (existente === undefined) linhas.push(nova);
      else Object.assign(existente, nova);
      return Promise.resolve(comoAresta(existente ?? nova, pedido.quemPede));
    },

    aceitar: (ref: string, quemChama: UserId, agora: Instant) => {
      const alvo = linhas.find(
        (l) =>
          l.ref === ref &&
          l.destinatario === quemChama &&
          l.estado === 'pending' &&
          l.expiraEm > Number(agora) &&
          viva(l),
      );
      if (alvo === undefined) return Promise.resolve(undefined);
      if (contarConexoesDe(alvo.pedinte) >= TETO_DE_CONEXOES) return Promise.resolve(undefined);
      if (contarConexoesDe(alvo.destinatario) >= TETO_DE_CONEXOES) return Promise.resolve(undefined);
      alvo.estado = 'accepted';
      alvo.descansoAte = null;
      return Promise.resolve(comoAresta(alvo, quemChama));
    },

    encerrar: (ref: string, quemChama: UserId, agora: Instant): Promise<Encerramento | undefined> => {
      const indice = linhas.findIndex(
        (l) =>
          l.ref === ref &&
          (l.pedinte === quemChama || l.destinatario === quemChama) &&
          viva(l) &&
          (l.estado === 'accepted' || (l.estado === 'pending' && l.expiraEm > Number(agora))),
      );
      if (indice < 0) return Promise.resolve(undefined);
      const linha = linhas[indice] as LinhaEmMemoria;
      if (linha.estado === 'accepted') {
        linhas.splice(indice, 1);
        return Promise.resolve('undone');
      }
      if (linha.pedinte === quemChama) {
        linhas.splice(indice, 1);
        return Promise.resolve('cancelled');
      }
      linha.estado = 'declined';
      linha.descansoAte = Number(agora) + 90 * DIA;
      return Promise.resolve('declined');
    },

    pedidos: (quemChama: UserId, recorte: RecortePedidos): Promise<PaginaDePedidos> => {
      const recebidos = recorte.direcao === 'received';
      const todas = linhas
        .filter((l) => viva(l) && l.expiraEm > Number(recorte.agora))
        .filter((l) =>
          recebidos
            ? l.destinatario === quemChama && l.estado === 'pending'
            : l.pedinte === quemChama && (l.estado === 'pending' || l.estado === 'declined'),
        )
        .sort((a, b) => b.pedidoEm - a.pedidoEm);
      const inicio = (recorte.pagina - 1) * recorte.limite;
      return Promise.resolve({
        itens: todas.slice(inicio, inicio + recorte.limite).map((l) => comoAresta(l, quemChama)),
        total: todas.length,
      });
    },

    conexoes: (quemChama: UserId, recorte: RecorteDeConexoes): Promise<PaginaDeConexoes> => {
      const todas = linhas
        .filter((l) => l.estado === 'accepted' && viva(l))
        .filter((l) => l.pedinte === quemChama || l.destinatario === quemChama)
        .map((l) => estado.get(l.pedinte === quemChama ? l.destinatario : l.pedinte))
        .filter((pessoa): pessoa is PessoaDeTeste => pessoa !== undefined)
        .filter((pessoa) => pessoa.apelido !== null)
        .sort(
          (a, b) =>
            (a.nomeDeExibicao ?? '').localeCompare(b.nomeDeExibicao ?? '') ||
            (a.apelido ?? '').localeCompare(b.apelido ?? ''),
        );
      const inicio = (recorte.pagina - 1) * recorte.limite;
      return Promise.resolve({
        itens: todas.slice(inicio, inicio + recorte.limite).map((pessoa) => ({
          apelido: pessoa.apelido as string,
          nomeDeExibicao: pessoa.nomeDeExibicao,
          petsCount: pessoa.pets ?? 0,
          connectionsCount: contarConexoesDe(pessoa.id),
          photoKey: pessoa.chaveDaFoto ?? null,
        })),
        total: todas.length,
      });
    },

    arestasPorApelido: (
      quemChama: UserId,
      apelidos: readonly string[],
      agora: Instant,
    ): Promise<readonly ArestaComApelido[]> => {
      const procurados = new Set(apelidos);
      const achadas: ArestaComApelido[] = [];
      for (const l of linhas) {
        if (!viva(l)) continue;
        if (l.pedinte !== quemChama && l.destinatario !== quemChama) continue;
        if (l.estado !== 'accepted' && l.expiraEm <= Number(agora)) continue;
        const outroLado = l.pedinte === quemChama ? l.destinatario : l.pedinte;
        const apelido = estado.get(outroLado)?.apelido;
        if (apelido === null || apelido === undefined) continue;
        if (!procurados.has(apelido)) continue;
        achadas.push({ apelido, aresta: comoAresta(l, quemChama) });
      }
      return Promise.resolve(achadas);
    },

    estaConectado: (um: UserId, outro: UserId) =>
      Promise.resolve(
        linhas.some(
          (l) => par(l.pedinte, l.destinatario) === par(um, outro) && l.estado === 'accepted' && viva(l),
        ),
      ),

    desfazerPorBloqueio: (um: UserId, outro: UserId) => {
      const antes = linhas.length;
      for (let i = linhas.length - 1; i >= 0; i -= 1) {
        const l = linhas[i] as LinhaEmMemoria;
        if (par(l.pedinte, l.destinatario) === par(um, outro)) linhas.splice(i, 1);
      }
      return Promise.resolve(antes - linhas.length);
    },
  };

  return {
    repositorio,
    linhas,
    semear(parcial) {
      for (const lado of [parcial.pedinte, parcial.destinatario]) {
        if (!estado.has(lado)) {
          estado.set(lado, {
            id: lado,
            apelido: null,
            nomeDeExibicao: null,
            habilitada: true,
            canalVerificado: false,
          });
        }
      }
      sequencia += 1;
      const ref = `semeada${String(sequencia).padStart(14, '0')}`;
      const agora = Number(agoraBase);
      linhas.push({
        ref,
        estado: 'pending',
        origem: 'invite_link',
        pedidoEm: agora - DIA,
        expiraEm: agora + 29 * DIA,
        descansoAte: null,
        ...parcial,
      });
      return ref;
    },
    desabilitar(pessoa: UserId) {
      const atual = estado.get(pessoa);
      if (atual !== undefined) estado.set(pessoa, { ...atual, habilitada: false });
    },
    reabilitar(pessoa: UserId) {
      const atual = estado.get(pessoa);
      if (atual !== undefined) estado.set(pessoa, { ...atual, habilitada: true });
    },
  };
}
