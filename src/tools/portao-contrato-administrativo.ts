/**
 * Portao do contrato administrativo (ADR-0027 item 7, regras 1 a 3; D37).
 *
 * Le `api/openapi.yaml` e confere as operacoes sob `/admin/`:
 *
 * 1. toda operacao sob `/admin/`, exceto `openAdminSession`, declara `security`
 *    com `adminSession` e declara `x-admin-roles` nao vazio, so com valores de
 *    `AdminRole`;
 * 2. toda operacao sob `/admin/` de metodo nao seguro declara `x-audit` com
 *    `action` e `resource_kind`, e `adminCsrf` (o login e a unica sem
 *    `adminCsrf`: ele nao tem sessao da qual tirar o token);
 * 3. nenhuma operacao fora de `/admin/` declara `adminSession`, `adminCsrf`,
 *    `adminReauth`, `x-admin-roles` ou `x-audit`;
 * 4. `adminReauth` no `security` e `x-admin-reauth-scope` andam juntos, e o
 *    escopo e um valor de `AdminReauthScope`;
 * 5. nenhuma operacao `GET` administrativa declara `x-audit` (GET nao muda
 *    estado, item 3).
 *
 * **Nao achar alvo reprova**: com zero operacoes sob `/admin/` o portao nao
 * verificou nada, e diz isso. As iscas que ele precisa reprovar estao no teste
 * ao lado, uma por regra.
 */
import { parse as parseYaml } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const SEGUROS: ReadonlySet<string> = new Set(['get']);
const PREFIXO = '/admin/';
const LOGIN = 'openAdminSession';
const ESQUEMAS_ADMINISTRATIVOS = ['adminSession', 'adminCsrf', 'adminReauth'];

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function enumDe(spec: Record<string, unknown>, nome: string): readonly string[] {
  const componentes = spec['components'];
  const esquemas = ehObjeto(componentes) ? componentes['schemas'] : undefined;
  const esquema = ehObjeto(esquemas) ? esquemas[nome] : undefined;
  const valores = ehObjeto(esquema) ? esquema['enum'] : undefined;
  return Array.isArray(valores) ? valores.filter((v): v is string => typeof v === 'string') : [];
}

function esquemasDe(security: unknown): Set<string> {
  const nomes = new Set<string>();
  if (!Array.isArray(security)) return nomes;
  for (const requisito of security) {
    if (ehObjeto(requisito)) for (const nome of Object.keys(requisito)) nomes.add(nome);
  }
  return nomes;
}

export interface ResultadoDoPortao {
  readonly operacoesAdministrativas: number;
  readonly violacoes: readonly string[];
}

export function conferirContratoAdministrativo(textoDaSpec: string): ResultadoDoPortao {
  const spec = parseYaml(textoDaSpec) as unknown;
  if (!ehObjeto(spec) || !ehObjeto(spec['paths'])) {
    return { operacoesAdministrativas: 0, violacoes: ['o contrato nao tem `paths`'] };
  }
  const papeis = enumDe(spec, 'AdminRole');
  const escopos = enumDe(spec, 'AdminReauthScope');
  const violacoes: string[] = [];
  if (papeis.length === 0) violacoes.push('components.schemas.AdminRole sem enum: nao ha papel contra o que conferir');
  if (escopos.length === 0) violacoes.push('components.schemas.AdminReauthScope sem enum');

  let administrativas = 0;
  for (const [caminho, item] of Object.entries(spec['paths'])) {
    if (!ehObjeto(item)) continue;
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (!ehObjeto(operacao)) continue;
      const id = typeof operacao['operationId'] === 'string' ? operacao['operationId'] : `${metodo} ${caminho}`;
      const esquemas = esquemasDe(operacao['security']);
      const papeisDeclarados = operacao['x-admin-roles'];
      const trilha = operacao['x-audit'];
      const escopo = operacao['x-admin-reauth-scope'];

      if (!caminho.startsWith(PREFIXO)) {
        const intrusos = ESQUEMAS_ADMINISTRATIVOS.filter((nome) => esquemas.has(nome));
        if (intrusos.length > 0) violacoes.push(`${id}: fora de /admin/ e declara ${intrusos.join(', ')} (regra 3)`);
        if (papeisDeclarados !== undefined) violacoes.push(`${id}: fora de /admin/ e declara x-admin-roles (regra 3)`);
        if (trilha !== undefined) violacoes.push(`${id}: fora de /admin/ e declara x-audit (regra 3)`);
        if (escopo !== undefined) violacoes.push(`${id}: fora de /admin/ e declara x-admin-reauth-scope (regra 3)`);
        continue;
      }

      administrativas += 1;
      const ehLogin = id === LOGIN;
      if (!ehLogin) {
        if (!esquemas.has('adminSession')) violacoes.push(`${id}: sem adminSession no security (regra 1)`);
        if (!Array.isArray(papeisDeclarados) || papeisDeclarados.length === 0) {
          violacoes.push(`${id}: sem x-admin-roles (regra 1)`);
        } else {
          const desconhecidos = papeisDeclarados.filter((p) => typeof p !== 'string' || !papeis.includes(p));
          if (desconhecidos.length > 0) {
            violacoes.push(`${id}: x-admin-roles com valor fora de AdminRole: ${JSON.stringify(desconhecidos)} (regra 1)`);
          }
        }
      } else if (papeisDeclarados !== undefined || esquemas.size > 0) {
        violacoes.push(`${id}: o login administrativo e a unica operacao sem sessao; nao declara security nem x-admin-roles`);
      }

      const inseguro = !SEGUROS.has(metodo);
      const trilhaCompleta =
        ehObjeto(trilha) && typeof trilha['action'] === 'string' && typeof trilha['resource_kind'] === 'string';
      if (inseguro) {
        if (!trilhaCompleta) violacoes.push(`${id}: escrita sem x-audit com action e resource_kind (regra 2)`);
        if (!ehLogin && !esquemas.has('adminCsrf')) violacoes.push(`${id}: escrita sem adminCsrf (regra 2)`);
      } else if (trilha !== undefined) {
        violacoes.push(`${id}: GET com x-audit; GET nao muda estado (regra 5)`);
      }

      const pedeReauth = esquemas.has('adminReauth');
      if (pedeReauth !== (escopo !== undefined)) {
        violacoes.push(`${id}: adminReauth e x-admin-reauth-scope precisam andar juntos (regra 4)`);
      }
      if (escopo !== undefined && (typeof escopo !== 'string' || !escopos.includes(escopo))) {
        violacoes.push(`${id}: x-admin-reauth-scope fora de AdminReauthScope (regra 4)`);
      }
    }
  }

  if (administrativas === 0) {
    violacoes.push('nenhuma operacao sob /admin/ encontrada: o portao nao tem o que verificar');
  }
  return { operacoesAdministrativas: administrativas, violacoes };
}
