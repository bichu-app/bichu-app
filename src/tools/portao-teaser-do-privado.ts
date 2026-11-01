export const TEASER = 'NetworkEventPrivateTeaser';
export const PUBLICO = 'NetworkEventPublic';
export const DETALHES = 'NetworkEventPrivateDetails';
export const CAMPOS_DO_TEASER = ['local_date', 'slug', 'status', 'title', 'visibility'];

/**
 * Operacoes que por desenho nunca devolvem privado a quem nao pode ver, com o
 * motivo escrito.
 */
export const SO_PUBLICO: Readonly<Record<string, string>> = {
  listNearbyNetworkEvents:
    'a posicao do privado numa lista por distancia ja e localizacao (ADR-0027 12.14)',
  createNetworkEvent:
    'o autor recebe o encontro que ele mesmo acabou de criar, e ele nasce publico: esta operacao nao aceita `visibility` (ADR-0025 emenda 3)',
  updateNetworkEvent:
    'edita SOMENTE encontro `origin: community` da propria conta (404 para o de terceiro, ADR-0021), e o autor precisa do encontro inteiro para editar',
  cancelNetworkEvent:
    'cancela SOMENTE encontro `origin: community` da propria conta (404 para o de terceiro, ADR-0021), e devolve ao autor o proprio encontro',
};

/** A unica operacao que pode devolver o conteudo oculto. */
export const OPERACAO_DOS_DETALHES = 'getNetworkEventPrivateDetails';

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nomeDoRef(ref: string): string | undefined {
  return /^#\/components\/schemas\/(.+)$/.exec(ref)?.[1];
}

function alcancados(
  raiz: unknown,
  esquemas: Objeto,
): { nomes: Set<string>; publicoSemTeaser: boolean } {
  const nomes = new Set<string>();
  let publicoSemTeaser = false;
  const visitados = new Set<string>();

  const visitar = (no: unknown, dentroDeOneOfComTeaser: boolean): void => {
    if (Array.isArray(no)) {
      for (const item of no) visitar(item, dentroDeOneOfComTeaser);
      return;
    }
    if (!ehObjeto(no)) return;
    const ref = no['$ref'];
    if (typeof ref === 'string') {
      const nome = nomeDoRef(ref);
      if (nome === undefined) return;
      nomes.add(nome);
      if (nome === PUBLICO && !dentroDeOneOfComTeaser) publicoSemTeaser = true;
      if (visitados.has(nome)) return;
      visitados.add(nome);
      visitar(esquemas[nome], false);
      return;
    }
    for (const [chave, valor] of Object.entries(no)) {
      if (chave === 'oneOf' && Array.isArray(valor)) {
        const temTeaser = valor.some(
          (v) => ehObjeto(v) && typeof v['$ref'] === 'string' && nomeDoRef(v['$ref']) === TEASER,
        );
        for (const item of valor) visitar(item, temTeaser);
      } else if (chave !== 'discriminator') {
        visitar(valor, false);
      }
    }
  };
  visitar(raiz, false);
  return { nomes, publicoSemTeaser };
}

function conferirTeaser(teaser: Objeto): string[] {
  const falhas: string[] = [];
  const props = ehObjeto(teaser['properties']) ? Object.keys(teaser['properties']).sort() : [];
  if (JSON.stringify(props) !== JSON.stringify(CAMPOS_DO_TEASER)) {
    falhas.push(
      `${TEASER} declara [${props.join(', ')}], e a lista permitida e [${CAMPOS_DO_TEASER.join(', ')}]`,
    );
  }
  if (teaser['additionalProperties'] !== false) {
    falhas.push(`${TEASER} precisa de additionalProperties: false`);
  }
  const exigidos = Array.isArray(teaser['required'])
    ? (teaser['required'] as unknown[]).map(String).sort()
    : [];
  if (JSON.stringify(exigidos) !== JSON.stringify(CAMPOS_DO_TEASER)) {
    falhas.push(`${TEASER} precisa exigir as cinco propriedades em required`);
  }
  return falhas;
}

export function inspecionar(spec: Objeto): string[] {
  const componentes = ehObjeto(spec['components']) ? spec['components'] : {};
  const esquemas = ehObjeto(componentes['schemas']) ? componentes['schemas'] : {};
  const teaser = esquemas[TEASER];
  if (!ehObjeto(teaser)) {
    return [`${TEASER} nao existe no contrato: o portao nao tem o que conferir, e isso reprova`];
  }
  const falhas = conferirTeaser(teaser);

  const paths = ehObjeto(spec['paths']) ? spec['paths'] : {};
  let usos = 0;
  for (const [caminho, item] of Object.entries(paths)) {
    if (!caminho.startsWith('/network/') || !ehObjeto(item)) continue;
    for (const operacao of Object.values(item)) {
      if (!ehObjeto(operacao) || typeof operacao['operationId'] !== 'string') continue;
      const id = operacao['operationId'];
      const { nomes, publicoSemTeaser } = alcancados(operacao['responses'], esquemas);
      if (nomes.has(TEASER)) usos += 1;
      if (nomes.has(DETALHES) && id !== OPERACAO_DOS_DETALHES) {
        falhas.push(`${id} alcanca ${DETALHES}, que so ${OPERACAO_DOS_DETALHES} pode devolver`);
      }
      if (publicoSemTeaser && SO_PUBLICO[id] === undefined) {
        falhas.push(`${id} devolve ${PUBLICO} fora de um oneOf com ${TEASER}: o privado sairia inteiro`);
      }
    }
  }
  if (usos === 0) {
    falhas.push(`nenhuma operacao da Rede usa ${TEASER}: o portao nao tem alvo, e isso reprova`);
  }
  return falhas;
}
