/** O caso de uso do **perfil de outra pessoa** (fatia G). */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { LeitorDeConexao } from '../../connections/ports/conexao.js';
import type { ResolvedorDeConvite } from '../../connections/ports/convite-de-conexao.js';
import type {
  FotoDoPerfilDeOutraPessoa,
  PerfilDePessoaRepository,
} from '../ports/perfil-de-pessoa-repository.js';

/** A relação entre quem olha e a pessoa, no vocabulário do contrato. */
export type EstadoDaConexaoNoPerfil =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'connected';

/** O perfil projetado, **sem URL e sem `UserId`**. */
export interface PerfilDePessoaProjetado {
  readonly handle: string;
  readonly publicRef: string;
  readonly displayName: string | null;
  readonly petsCount: number;
  readonly connectionsCount: number;
  /**
   * **O SELO DE VALIDADO** (emenda do ADR-0010, 21/10/2026, decisão do cliente): a
   * conta tem um canal de contato confirmado.
   */
  readonly canalVerificado: boolean;
  readonly connectionState: EstadoDaConexaoNoPerfil;
  /** O `ref` da **aresta**, nulo quando o estado é `none`. */
  readonly connectionRef: string | null;
  /** A vitrine, **`undefined` quando o estado não é `connected`** — e não `[]`. */
  readonly vitrine: readonly FotoDoPerfilDeOutraPessoa[] | undefined;
}

export interface DependenciasDoPerfilDePessoa {
  readonly perfis: PerfilDePessoaRepository;
  readonly conexoes: LeitorDeConexao;
  /**
   * O resolvedor de convite, **para a tela de destino do link e do QR** (decisão do
   * cliente de 20/10/2026).
   */
  readonly convites: ResolvedorDeConvite;
  readonly clock: Clock;
}

export class PerfilDePessoa {
  constructor(private readonly deps: DependenciasDoPerfilDePessoa) {}

  /** O perfil de um apelido, visto por `quemOlha`. */
  async porApelido(quemOlha: UserId, apelido: string): Promise<PerfilDePessoaProjetado> {
    const pessoa = await this.deps.perfis.perfilPorApelido(apelido, quemOlha);
    if (pessoa === undefined) throw problemas.naoEncontrado();

    const agora = this.deps.clock.now();
    const [aresta, connectionsCount] = await Promise.all([
      this.deps.conexoes.arestaVivaEntre(quemOlha, pessoa.userId, agora),
      this.deps.conexoes.contarConexoes(pessoa.userId),
    ]);

    const connectionState: EstadoDaConexaoNoPerfil = aresta?.estado ?? 'none';

    const vitrine =
      connectionState === 'connected'
        ? await this.deps.perfis.vitrineDeConexao(pessoa.userId, quemOlha)
        : undefined;

    return {
      handle: pessoa.handle,
      publicRef: pessoa.publicRef,
      displayName: pessoa.displayName,
      petsCount: pessoa.petsCount,
      connectionsCount,
      canalVerificado: pessoa.canalVerificado,
      connectionState,
      connectionRef: aresta?.ref ?? null,
      vitrine,
    };
  }

  /** **A tela de destino do link de convite e do QR**: o perfil de quem emitiu. */
  async porConvite(quemOlha: UserId, token: string): Promise<PerfilDePessoaProjetado> {
    const convite = await this.deps.convites.resolver(token, quemOlha);
    if (convite === undefined) throw problemas.naoEncontrado();
    return this.porApelido(quemOlha, convite.apelido);
  }
}
