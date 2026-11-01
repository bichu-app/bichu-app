import { parse as parseYaml } from 'yaml';

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const SEGUROS: ReadonlySet<string> = new Set(['get']);
const PREFIXO = '/admin/';
const SEM_SESSAO: ReadonlySet<string> = new Set(['openAdminSession', 'disavowAdminSessionAlert']);
const RECEBEM_SENHA: ReadonlySet<string> = new Set(['openAdminSession', 'reauthenticateAdmin']);
const PROBLEMA_BANIDO = 'password-reset-required';
const ESQUEMAS_ADMINISTRATIVOS = ['adminSession', 'adminCsrf', 'adminReauth'];
const VERBOS_DE_LEITURA: ReadonlySet<string> = new Set(['listed', 'read']);

function contaLinhasDevolvidas(tetos: unknown): boolean {
  return Array.isArray(tetos) && tetos.some((t) => ehObjeto(t) && t['counts'] === 'rows_returned');
}

function verboDaAcao(trilha: unknown): string | null {
  if (!ehObjeto(trilha) || typeof trilha['action'] !== 'string') return null;
  const partes = trilha['action'].split('.');
  return partes[partes.length - 1] ?? null;
}

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

function esquemaDoCorpo(spec: Record<string, unknown>, operacao: Record<string, unknown>): Record<string, unknown> | undefined {
  const corpo = operacao['requestBody'];
  const conteudo = ehObjeto(corpo) ? corpo['content'] : undefined;
  const json = ehObjeto(conteudo) ? conteudo['application/json'] : undefined;
  const esquema = ehObjeto(json) ? json['schema'] : undefined;
  if (!ehObjeto(esquema)) return undefined;
  const ref = esquema['$ref'];
  if (typeof ref !== 'string') return esquema;
  let alvo: unknown = spec;
  for (const parte of ref.replace(/^#\//, '').split('/')) alvo = ehObjeto(alvo) ? alvo[parte] : undefined;
  return ehObjeto(alvo) ? alvo : undefined;
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
  const catalogo = spec['x-problem-types'];
  if (Array.isArray(catalogo) && catalogo.some((t) => ehObjeto(t) && t['slug'] === PROBLEMA_BANIDO)) {
    violacoes.push(`x-problem-types declara ${PROBLEMA_BANIDO}: senha vazada tem de responder o 401 comum (regra 8)`);
  }

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
      const semSessao = SEM_SESSAO.has(id);
      if (!semSessao) {
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
        violacoes.push(`${id}: operacao sem sessao da lista fechada; nao declara security nem x-admin-roles`);
      }
      if (!semSessao && esquemas.size === 0) {
        violacoes.push(`${id}: operacao sob /admin/ sem sessao fora da lista fechada (${[...SEM_SESSAO].join(', ')})`);
      }

      const corpo = esquemaDoCorpo(spec, operacao);
      const propriedades = corpo === undefined ? undefined : corpo['properties'];
      if (ehObjeto(propriedades) && 'password' in propriedades && !RECEBEM_SENHA.has(id)) {
        violacoes.push(`${id}: recebe password no corpo; senha do painel so se define pelo comando (regra 7, D61)`);
      }
      if (JSON.stringify(operacao).includes(PROBLEMA_BANIDO)) {
        violacoes.push(`${id}: cita ${PROBLEMA_BANIDO}; senha vazada responde o 401 comum (regra 8, D43)`);
      }

      const inseguro = !SEGUROS.has(metodo);
      const trilhaCompleta =
        ehObjeto(trilha) && typeof trilha['action'] === 'string' && typeof trilha['resource_kind'] === 'string';
      if (inseguro) {
        if (!trilhaCompleta) violacoes.push(`${id}: escrita sem x-audit com action e resource_kind (regra 2)`);
        if (!semSessao && !esquemas.has('adminCsrf')) violacoes.push(`${id}: escrita sem adminCsrf (regra 2)`);
      } else {
        const leituraDePessoa = contaLinhasDevolvidas(operacao['x-rate-limit']);
        if (trilha !== undefined) {
          const verbo = verboDaAcao(trilha);
          if (!trilhaCompleta || verbo === null || !VERBOS_DE_LEITURA.has(verbo)) {
            violacoes.push(
              `${id}: GET com x-audit de verbo que nao e de leitura; GET nao muda estado (regra 5)`,
            );
          } else if (!leituraDePessoa) {
            violacoes.push(
              `${id}: GET com x-audit sem teto por rows_returned; so a leitura de dado pessoal auditada (D55, D56) declara trilha (regra 5)`,
            );
          } else if (semSessao) {
            violacoes.push(`${id}: GET sem sessao com x-audit; leitura auditada exige conta identificada (regra 5)`);
          }
        } else if (leituraDePessoa) {
          violacoes.push(`${id}: GET com teto por rows_returned e sem x-audit; leitura de pessoa sem trilha (regra 6, D55)`);
        }
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
