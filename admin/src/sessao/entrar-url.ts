/**
 * O caminho entre o painel e o documento de login `/entrar` (ADR-0027 item 5:
 * documento isolado, recarga completa nos dois sentidos). Nada pessoal vai na
 * URL: so o motivo do banner e a rota para voltar.
 */
export type MotivoDeEntrar = 'expirada' | 'saiu' | 'saiu_todas';

const MOTIVOS: readonly MotivoDeEntrar[] = ['expirada', 'saiu', 'saiu_todas'];

export const CAMINHO_DE_ENTRAR = '/entrar/';

/** So caminho interno do painel: sem esquema, sem `//host`, sem voltar ao proprio login. */
export function voltaSegura(volta: string | null | undefined): string {
  if (!volta || !volta.startsWith('/') || volta.startsWith('//') || volta.startsWith('/\\')) return '/';
  if (volta.startsWith('/entrar')) return '/';
  return volta;
}

export function urlDeEntrar(opcoes: { motivo?: MotivoDeEntrar; volta?: string } = {}): string {
  const busca = new URLSearchParams();
  if (opcoes.motivo) busca.set('motivo', opcoes.motivo);
  const volta = voltaSegura(opcoes.volta);
  if (volta !== '/') busca.set('volta', volta);
  const texto = busca.toString();
  return texto ? `${CAMINHO_DE_ENTRAR}?${texto}` : CAMINHO_DE_ENTRAR;
}

export function lerMotivo(valor: string | null): MotivoDeEntrar | undefined {
  return MOTIVOS.find((m) => m === valor);
}
