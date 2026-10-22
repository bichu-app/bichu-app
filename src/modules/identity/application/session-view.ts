/**
 * Projeção da sessão e da conta para a resposta.
 *
 * A forma é a do schema `SessionResponse` de `api/openapi.yaml`, campo a campo.
 * Um campo a mais aqui não quebraria nenhum cliente, e por isso passaria
 * despercebido — é exatamente por ali que implementação e contrato se afastam.
 * Quando este arquivo mudar, a conferência é contra o documento, não contra o
 * diff.
 */
import type { Instant } from '../../../shared/types/brands.js';
import type { Conta } from '../ports/identity-repository.js';
import type { FotoProjetada } from '../domain/resposta-do-perfil.js';
import { canalDeContatoConfirmado } from '../../../shared/db/canal-de-contato-confirmado.js';

export type CampoPendente = 'email_verification' | 'phone' | 'display_name' | 'reference_area';

export interface MeView {
  id: string;
  email: string;
  email_verified: boolean;
  pending_email: string | null;
  email_deliverable: boolean;
  display_name: string | null;
  phone_e164: string | null;
  phone_verified: boolean;
  reference_area: {
    postal_code: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
  pending_profile_fields: CampoPendente[];
  can_open_lost_case: boolean;
  contact_channel_verified: boolean;
  created_at: string;
  /**
   * A FOTO DA PRÓPRIA PESSOA, a mesma que `getMe` devolve.
   *
   * ## Por que ela está aqui, e o que acontecia sem ela
   *
   * `SessionResponse.user` aponta para o schema `Me` (`api/openapi.yaml`), e
   * `Me.photo` está declarado lá desde 18/10/2026. Esta projeção não a tinha —
   * **o contrato prometia e a implementação não entregava**, que é exatamente o
   * afastamento que o cabeçalho deste arquivo manda conferir contra o documento.
   *
   * O efeito, relatado pelo cliente em 20/10/2026: *"o icone do perfil em todas
   * as paginas, não esta sendo substituido pela foto do perfil do usuário"*. O
   * app desenha o avatar da barra a partir da SESSÃO (`Escopo.sessao.usuario`),
   * e não de `getMe`; sem este campo ele caía na inicial do nome — **e caía
   * calado**, porque cair na inicial é um desfecho legítimo da cadeia
   * foto → inicial → glifo. Era um defeito que parecia certo.
   *
   * **Obrigatória, e não opcional.** Um campo opcional deixaria a projeção que
   * esquecesse dele voltar ao defeito em silêncio — e o silêncio é o que fez
   * este defeito sair do contrato (18/10) para o relato do cliente (20/10) sem
   * nenhum portão no caminho.
   */
  photo: FotoProjetada | null;
}

export interface SessionView {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: MeView;
}

function temAreaDeReferencia(conta: Conta): boolean {
  return (
    conta.referencePostalCode !== null ||
    conta.referenceNeighborhood !== null ||
    conta.referenceCity !== null
  );
}

/**
 * A conta como `Me`, campo a campo.
 *
 * `foto` é parâmetro **exigido** e não opcional de propósito: quem projetar uma
 * sessão tem de dizer o que fazer com a foto, mesmo que a resposta seja `null`.
 * Com valor padrão, cada chamada nova nasceria sem foto sem avisar ninguém.
 */
export function projetarConta(conta: Conta, foto: FotoProjetada | null): MeView {
  const pendentes: CampoPendente[] = [];
  if (conta.emailVerifiedAt === null) pendentes.push('email_verification');
  if (conta.phoneE164 === null) pendentes.push('phone');
  if (conta.displayName === null) pendentes.push('display_name');
  if (!temAreaDeReferencia(conta)) pendentes.push('reference_area');

  return {
    id: conta.id,
    email: conta.email,
    email_verified: conta.emailVerifiedAt !== null,
    pending_email: conta.pendingEmail,
    email_deliverable: conta.emailDeliverable,
    display_name: conta.displayName,
    phone_e164: conta.phoneE164,
    phone_verified: conta.phoneVerifiedAt !== null,
    reference_area: temAreaDeReferencia(conta)
      ? {
          postal_code: conta.referencePostalCode,
          neighborhood: conta.referenceNeighborhood,
          city: conta.referenceCity,
          state: conta.referenceState,
        }
      : null,
    pending_profile_fields: pendentes,
    // Falso quando nenhum canal de contato está verificado: os tutores por perto
    // vão receber a foto, e é pelo e-mail do tutor que alguém consegue avisá-lo.
    //
    // **A condição saiu daqui em 21/10/2026**: era uma segunda escrita da régua,
    // e a fonte é `canalDeContatoConfirmado`.
    can_open_lost_case: canalDeContatoConfirmado(conta),
    // **O SELO DE VALIDADO, pela MESMA régua que os outros veem.** Ver o
    // cabeçalho de `contact_channel_verified` em `resposta-do-perfil.ts`: este
    // campo existe para que o dono e o terceiro nunca discordem sobre a mesma
    // conta, e `email_verified` fica onde estava, dizendo o que o nome dele diz.
    contact_channel_verified: canalDeContatoConfirmado(conta),
    created_at: conta.createdAt.toISOString(),
    // A FOTO, pela MESMA projeção que `getMe` usa. Ver o cabeçalho do campo em
    // `MeView`: o contrato aponta `SessionResponse.user` e `getMe` para o mesmo
    // schema `Me`, e antes de 21/10/2026 só um dos dois entregava a foto.
    photo: foto,
  };
}

export interface ParDeTokens {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Instant;
}

export function projetarSessao(
  conta: Conta,
  par: ParDeTokens,
  agora: Instant,
  foto: FotoProjetada | null,
): SessionView {
  return {
    access_token: par.accessToken,
    token_type: 'Bearer',
    expires_in: par.expiresInSeconds,
    refresh_token: par.refreshToken,
    refresh_expires_in: Math.max(0, Math.floor((par.refreshExpiresAt - agora) / 1000)),
    user: projetarConta(conta, foto),
  };
}
