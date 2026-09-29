// Qual tela `/t/{code}` mostra, decidida pelo `type` do problema (ADR-0028,
// item 2) e nunca pelo texto. Modulo puro: testado em milissegundos, sem
// navegador (tests/unidade/telas-da-tag.test.ts).
import type { components } from '../api/generated/api.ts';
import type { Resultado } from './resultado.ts';

export type ResolucaoDaTag = components['schemas']['TagResolution'];
export type AvisoCriado = components['schemas']['FoundReportCreated'];

/** Telas comuns a abrir e a avisar. */
type TelaDeFalha =
  | { tela: 'codigo-malformado'; http: 400 }
  | { tela: 'codigo-inexistente'; http: 404 }
  | { tela: 'tag-desativada'; http: 410; proximaAcao: string | null }
  | { tela: 'espere'; http: 429; esperaSegundos: number | null }
  | { tela: 'fora-do-ar'; http: 503 }
  | { tela: 'erro'; http: number; correlationId: string | null };

export type TelaAoAbrir =
  | { tela: 'pet'; http: 200; resolucao: ResolucaoDaTag }
  | { tela: 'nao-abriu'; http: 503 }
  | TelaDeFalha;

export type TelaAoAvisar =
  | { tela: 'avisado'; http: 200; nome: string | null }
  | { tela: 'recebido'; http: 200 }
  | { tela: 'nao-avisou'; http: 503 }
  | TelaDeFalha;

function falhaPorTipo(r: Extract<Resultado<unknown>, { tipo: 'problema' }>): TelaDeFalha {
  switch (r.slug) {
    case 'tag-code-malformed':
      return { tela: 'codigo-malformado', http: 400 };
    case 'tag-code-not-found':
      return { tela: 'codigo-inexistente', http: 404 };
    case 'tag-revoked':
      return { tela: 'tag-desativada', http: 410, proximaAcao: r.problema?.next_action ?? null };
    case 'rate-limited':
      return { tela: 'espere', http: 429, esperaSegundos: r.esperaSegundos };
    case 'internal':
      return { tela: 'fora-do-ar', http: 503 };
    default:
      // `type` desconhecido, ou conhecido mas que esta operacao nao declara:
      // pagina de erro generica com o correlation_id visivel.
      return { tela: 'erro', http: r.status >= 400 && r.status < 600 ? r.status : 502, correlationId: r.problema?.correlation_id ?? null };
  }
}

/** GET /v1/tags/{code} (resolveTagCode). */
export function telaAoAbrir(r: Resultado<ResolucaoDaTag>): TelaAoAbrir {
  if (r.tipo === 'ok') return { tela: 'pet', http: 200, resolucao: r.dados };
  if (r.tipo === 'falha') return { tela: 'nao-abriu', http: 503 };
  if (r.slug === null && r.problema === null && r.status >= 500) return { tela: 'nao-abriu', http: 503 };
  return falhaPorTipo(r);
}

/** POST /v1/tags/{code}/found-reports (createFoundReportFromTag). */
export function telaAoAvisar(r: Resultado<AvisoCriado>): TelaAoAvisar {
  if (r.tipo === 'ok') return { tela: 'avisado', http: 200, nome: r.dados.pet_display_name ?? null };
  if (r.tipo === 'falha') return { tela: 'nao-avisou', http: 503 };
  if (r.slug === null && r.problema === null && r.status >= 500) return { tela: 'nao-avisou', http: 503 };
  // Contrato, 429 desta operacao: "A interface publica nao mostra erro tecnico a
  // um achador real: ela confirma o aviso e a moderacao trata o abuso depois."
  if (r.slug === 'rate-limited') return { tela: 'recebido', http: 200 };
  if (r.slug === 'internal') return { tela: 'nao-avisou', http: 503 };
  return falhaPorTipo(r);
}
