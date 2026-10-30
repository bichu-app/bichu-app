/**
 * Comparador de destinos: o que PODE divergir está numa lista fechada, e só isso
 * pode ter divergido.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const VERSAO_DO_COMPARADOR = '1.0.0';

const TEMPO_LIMITE_MS = 15_000;
const CAMINHO_DA_SONDA = '/v1/health';

export interface DivergenciaPermitida {
  /** Caminho do campo na resposta da sonda, com pontos. */
  readonly campo: string;
  readonly motivo: string;
}

/** O que pode divergir entre destinos na resposta de `/v1/health`. */
export const DIVERGENCIAS_PERMITIDAS: readonly DivergenciaPermitida[] = [
];

/** Serviços do `compose.yaml` que, por decisão, NÃO sobem no destino hospedado. */
export const SERVICOS_AUSENTES_NO_HOSPEDADO: ReadonlyMap<string, string> = new Map([
  [
    'mail',
    'captura SMTP local (Mailpit). No destino hospedado `MAIL_TRANSPORT` é `log` porque o ' +
      'adaptador do Postmark ainda não existe (ADR-0009). Ele não prova entregabilidade em ' +
      'nenhum dos dois destinos: isso é reputação de domínio, SPF, DKIM e DMARC',
  ],
  [
    'objeto',
    'armazenamento de objeto falando a API S3 (MinIO), e so o destino LOCAL precisa de um. ' +
      'Em hml e em produção o armazenamento é o gerenciado (ADR-0007 Emenda 1): ' +
      '`OBJECT_STORAGE_ENDPOINT` aponta para o PROVEDOR, e a `api`, o `worker` e o `midia` ' +
      'montam o cliente S3 do endereço da CONFIGURAÇÃO — nenhum deles fala com este ' +
      'container. Quem o declarava em `depends_on` passou a declarar `required: false`, que é o ' +
      'que deixa os quatro subirem onde ele não existe. Ele vale 256 MB de uma VM de 1976: ' +
      'mantê-lo de pé sem uso deixava a folga em ~224 MB, abaixo do piso de 300',
  ],
  [
    'objeto_init',
    'cria os dois buckets do ADR-0007 no MinIO e aplica a política anônima. Só tem o que fazer ' +
      'onde existe MinIO: no destino hospedado os buckets já existem no armazenamento ' +
      'gerenciado, criados no provisionamento e com IAM próprio, e este `mc` nem alcançaria ' +
      '`http://objeto:9000`. Anda junto com o `objeto` e pelo mesmo motivo — perfil `dev`/`qa` ' +
      'nos dois, então ou os dois sobem ou nenhum sobe',
  ],
  [
    'ferramentas',
    'serviço de ferramenta, e não de runtime: mesma imagem da `api` e do `worker`, teto ' +
      'próprio de 1 GB e nenhum comando útil por padrão. Ele existe para `docker compose run ' +
      '--rm ferramentas <comando>` compilar fora de um serviço com teto de runtime — a `api` ' +
      'tem 320 MB, dimensionados para rodar `node dist/bin/api.js`, e o `tsc` estoura isso. ' +
      'Não sobe em destino nenhum, hospedado ou local: se subisse, entraria na soma de 1792 MB ' +
      'que é o orçamento da e2-small',
  ],
]);

export interface RespostaDeDestino {
  readonly rotulo: string;
  readonly corpo: unknown;
}

function achatar(valor: unknown, prefixo = ''): Map<string, string> {
  const plano = new Map<string, string>();
  if (typeof valor === 'object' && valor !== null && !Array.isArray(valor)) {
    for (const [chave, dentro] of Object.entries(valor as Record<string, unknown>)) {
      for (const [caminho, folha] of achatar(dentro, prefixo === '' ? chave : `${prefixo}.${chave}`)) {
        plano.set(caminho, folha);
      }
    }
    if (plano.size === 0) plano.set(prefixo, '{}');
    return plano;
  }
  plano.set(prefixo, JSON.stringify(valor));
  return plano;
}

/** Campos que a comparação exige que EXISTAM nos dois lados. */
const CAMPOS_OBRIGATORIOS = ['status', 'version', 'build.artifact', 'build.commit'];

export interface ResultadoDaComparacao {
  readonly falhas: readonly string[];
  /** Divergências que a lista fechada permitiu, com o valor de cada destino. */
  readonly permitidas: readonly string[];
  /** Entradas da lista fechada que não divergiram: ela pode encolher. */
  readonly naoUsadas: readonly string[];
}

export function compararRespostas(
  respostas: readonly RespostaDeDestino[],
  permitidas: readonly DivergenciaPermitida[] = DIVERGENCIAS_PERMITIDAS,
): ResultadoDaComparacao {
  const falhas: string[] = [];
  const usadas = new Set<string>();
  const anotadas: string[] = [];

  if (respostas.length < 2) {
    return {
      falhas: [
        `comparar exige dois destinos e vieram ${respostas.length}: um destino sozinho ` +
          'concorda consigo mesmo, que é a afirmação sem prova que o critério 12 recusa',
      ],
      permitidas: [],
      naoUsadas: [],
    };
  }

  const planos = respostas.map((r) => ({ rotulo: r.rotulo, plano: achatar(r.corpo) }));
  const nomesPermitidos = new Set(permitidas.map((p) => p.campo));

  for (const obrigatorio of CAMPOS_OBRIGATORIOS) {
    for (const { rotulo, plano } of planos) {
      if (!plano.has(obrigatorio)) {
        falhas.push(
          `${rotulo}: a sonda não trouxe \`${obrigatorio}\`. Sem ele não há o que comparar, e ` +
            'não haver o que comparar não é concordância',
        );
      }
    }
  }

  const todos = new Set<string>();
  for (const { plano } of planos) for (const campo of plano.keys()) todos.add(campo);

  for (const campo of [...todos].sort()) {
    const valores = planos.map(({ rotulo, plano }) => ({
      rotulo,
      valor: plano.get(campo) ?? '(ausente)',
    }));
    const distintos = new Set(valores.map((v) => v.valor));
    if (distintos.size === 1) continue;
    const descricao = valores.map((v) => `${v.rotulo}=${v.valor}`).join(' ');
    if (nomesPermitidos.has(campo)) {
      usadas.add(campo);
      anotadas.push(`${campo}: ${descricao}`);
      continue;
    }
    falhas.push(
      `${campo} divergiu entre os destinos e NÃO está na lista fechada: ${descricao}. ` +
        'Ou os destinos deixaram de rodar a mesma coisa, ou a divergência é uma decisão e ' +
        'precisa estar escrita em DIVERGENCIAS_PERMITIDAS, com motivo',
    );
  }

  return {
    falhas,
    permitidas: anotadas,
    naoUsadas: permitidas.filter((p) => !usadas.has(p.campo)).map((p) => p.campo),
  };
}

export function conferirTopologia(
  textoDoCompose: string,
  declarados: ReadonlyMap<string, string> = SERVICOS_AUSENTES_NO_HOSPEDADO,
): string[] {
  const falhas: string[] = [];
  let documento: unknown;
  try {
    documento = parseYaml(textoDoCompose);
  } catch (erro) {
    return [`compose.yaml não pôde ser lido: ${String(erro)}`];
  }
  const servicos =
    typeof documento === 'object' && documento !== null
      ? (documento as Record<string, unknown>)['services']
      : undefined;
  if (typeof servicos !== 'object' || servicos === null) {
    return ['compose.yaml não tem bloco `services`: nada para conferir não é nada errado'];
  }

  const comPerfil = new Set<string>();
  for (const [nome, definicao] of Object.entries(servicos as Record<string, unknown>)) {
    const perfis =
      typeof definicao === 'object' && definicao !== null
        ? (definicao as Record<string, unknown>)['profiles']
        : undefined;
    if (Array.isArray(perfis) && perfis.length > 0) comPerfil.add(nome);
  }

  for (const nome of comPerfil) {
    if (!declarados.has(nome)) {
      falhas.push(
        `o serviço \`${nome}\` tem \`profiles:\` e não sobe em todo destino, e essa ` +
          'divergência não está declarada. O critério 1 de BICHUS-13 lista quatro serviços; ' +
          'um serviço que existe num destino e não no outro precisa estar em ' +
          'SERVICOS_AUSENTES_NO_HOSPEDADO, com o motivo',
      );
    }
  }
  for (const nome of declarados.keys()) {
    if (!(nome in (servicos as Record<string, unknown>))) {
      falhas.push(
        `\`${nome}\` está declarado como ausente no destino hospedado e não existe mais no ` +
          'compose: a declaração envelheceu e está protegendo um serviço que não existe',
      );
    } else if (!comPerfil.has(nome)) {
      falhas.push(
        `\`${nome}\` está declarado como ausente no destino hospedado, mas no compose ele ` +
          'NÃO tem `profiles:` — ou seja, ele sobe nos dois. A declaração diz o contrário do ' +
          'arquivo',
      );
    }
  }
  return falhas;
}

const SONDA_BASE = {
  status: 'ok',
  version: '0.1.0',
  build: { artifact: '0123456789abcdef', commit: '262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90' },
  checks: { database: 'ok' },
};

function comCampo(caminho: string, valor: unknown): Record<string, unknown> {
  const copia = structuredClone(SONDA_BASE) as Record<string, unknown>;
  const partes = caminho.split('.');
  let alvo = copia;
  for (const parte of partes.slice(0, -1)) alvo = alvo[parte] as Record<string, unknown>;
  const ultima = partes[partes.length - 1] as string;
  if (valor === undefined) delete alvo[ultima];
  else alvo[ultima] = valor;
  return copia;
}

/** Cada isca diz o que ela precisa produzir. */
export function autoteste(): string[] {
  const falhas: string[] = [];
  const par = (outro: unknown): RespostaDeDestino[] => [
    { rotulo: 'a', corpo: SONDA_BASE },
    { rotulo: 'b', corpo: outro },
  ];

  const precisaReprovar: [string, unknown][] = [
    ['artefato diferente', comCampo('build.artifact', 'fedcba9876543210')],
    ['sonda sem `build`', comCampo('build', undefined)],
    ['versão diferente', comCampo('version', '0.2.0')],
    ['uma sonda a menos', comCampo('checks', {})],
    ['uma sonda a mais', comCampo('checks', { database: 'ok', objeto: 'ok' })],
  ];
  for (const [nome, corpo] of precisaReprovar) {
    if (compararRespostas(par(corpo)).falhas.length === 0) {
      falhas.push(`isca "${nome}" PASSOU: o comparador parou de enxergar esta divergência`);
    }
  }

  const commitDiferente = compararRespostas(
    par(comCampo('build.commit', 'b528bc8fedcba9876543210fedcba9876543210f')),
  );
  if (commitDiferente.falhas.length === 0) {
    falhas.push(
      'isca "commit diferente entre destinos" PASSOU: com o commit viajando dentro da imagem, ' +
        'dois destinos com o mesmo artefato não podem reportar commits diferentes',
    );
  }
  const commitNulo = compararRespostas(par(comCampo('build.commit', null)));
  if (commitNulo.falhas.length === 0) {
    falhas.push(
      'isca "um destino com commit nulo" PASSOU: o destino que não sabe de onde veio some da ' +
        'comparação em vez de reprovar',
    );
  }

  const comExcecaoDeTeste = compararRespostas(par(comCampo('version', '0.2.0')), [
    { campo: 'version', motivo: 'exceção só deste autoteste, nunca da lista real' },
  ]);
  if (comExcecaoDeTeste.falhas.length > 0) {
    falhas.push(
      'a divergência PERMITIDA por uma lista fechada reprovou: a lista não está sendo ' +
        `consultada (${comExcecaoDeTeste.falhas.join('; ')})`,
    );
  }
  if (compararRespostas(par(structuredClone(SONDA_BASE))).falhas.length > 0) {
    falhas.push('duas sondas idênticas reprovaram: o comparador reprova qualquer coisa');
  }

  const semDeclaracao = conferirTopologia(
    'services:\n  api: {}\n  mail:\n    profiles: [dev]\n  outro:\n    profiles: [dev]\n',
    new Map([['mail', 'motivo']]),
  );
  if (semDeclaracao.length === 0) {
    falhas.push('isca "serviço com perfil não declarado" PASSOU: a lista fechada é decorativa');
  }
  const declaracaoVelha = conferirTopologia(
    'services:\n  api: {}\n',
    new Map([['mail', 'motivo']]),
  );
  if (declaracaoVelha.length === 0) {
    falhas.push('isca "declaração que envelheceu" PASSOU: a lista nunca encolhe');
  }
  const topologiaBoa = conferirTopologia(
    'services:\n  api: {}\n  mail:\n    profiles: [dev, qa]\n',
    new Map([['mail', 'motivo']]),
  );
  if (topologiaBoa.length > 0) {
    falhas.push(`topologia correta reprovou: ${topologiaBoa.join('; ')}`);
  }

  return falhas;
}

async function buscarSonda(rotulo: string, base: string): Promise<RespostaDeDestino> {
  const url = `${base.replace(/\/$/, '')}${CAMINHO_DA_SONDA}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { 'user-agent': 'bichu-comparador-de-destinos/1' },
    });
  } catch (erro) {
    throw new Error(`${rotulo}: GET ${url} falhou: ${String(erro)}`);
  }
  if (resposta.status !== 200) {
    throw new Error(`${rotulo}: GET ${url} devolveu ${resposta.status}, esperado 200`);
  }
  const texto = await resposta.text();
  try {
    return { rotulo, corpo: JSON.parse(texto) };
  } catch (erro) {
    throw new Error(`${rotulo}: a sonda não devolveu JSON (${String(erro)})`);
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const destinos = argv.map((bruto) => {
    const corte = bruto.indexOf('=');
    if (corte <= 0) {
      throw new Error(`argumento "${bruto}" não está na forma <rotulo>=<url>`);
    }
    return { rotulo: bruto.slice(0, corte), base: bruto.slice(corte + 1) };
  });

  console.log(`comparador de destinos ${VERSAO_DO_COMPARADOR}`);

  const cegueira = autoteste();
  console.log(`  [${cegueira.length === 0 ? 'ok' : 'REPROVA'}] autoteste das iscas`);
  if (cegueira.length > 0) {
    console.log('\nO COMPARADOR ESTA CEGO:');
    for (const f of cegueira) console.log(`  - ${f}`);
    return 1;
  }

  const falhas: string[] = [];

  const topologia = conferirTopologia(readFileSync('compose.yaml', 'utf8'));
  console.log(`  [${topologia.length === 0 ? 'ok' : 'REPROVA'}] topologia declarada`);
  falhas.push(...topologia);

  if (destinos.length === 0) {
    console.log(
      '\n  [aviso] nenhum destino informado: a COMPARACAO ENTRE DESTINOS NAO RODOU, ' +
        'so a topologia declarada foi conferida',
    );
    if (falhas.length > 0) {
      console.log(`\nREPROVADO com ${falhas.length} achado(s):`);
      for (const f of falhas) console.log(`  - ${f}`);
      return 1;
    }
    console.log('APROVADO (so topologia)');
    return 0;
  }
  if (destinos.length < 2) {
    console.log(
      '\nREPROVADO: um destino sozinho concorda consigo mesmo. Informe dois, ' +
        '<rotulo>=<url> <rotulo>=<url>',
    );
    return 1;
  }

  const respostas: RespostaDeDestino[] = [];
  for (const { rotulo, base } of destinos) {
    try {
      respostas.push(await buscarSonda(rotulo, base));
      console.log(`  [ok] ${rotulo} respondeu a sonda`);
    } catch (erro) {
      console.log(`  [REPROVA] ${rotulo} não respondeu a sonda`);
      falhas.push(String(erro instanceof Error ? erro.message : erro));
    }
  }

  if (respostas.length === destinos.length) {
    const resultado = compararRespostas(respostas);
    console.log(`  [${resultado.falhas.length === 0 ? 'ok' : 'REPROVA'}] os destinos concordam`);
    falhas.push(...resultado.falhas);

    console.log('\nDivergencias permitidas (lista fechada, impressa sempre):');
    if (DIVERGENCIAS_PERMITIDAS.length === 0) {
      console.log(
        '  - nenhuma. Todo campo da sonda precisa bater nos dois destinos, `build.commit` ' +
          'inclusive (BICHUS-210)',
      );
    }
    for (const permitida of DIVERGENCIAS_PERMITIDAS) {
      const usada = resultado.permitidas.find((p) => p.startsWith(`${permitida.campo}:`));
      const valores = usada === undefined ? 'nao divergiu' : usada.slice(permitida.campo.length + 2);
      console.log(`  - ${permitida.campo}: ${valores}`);
      console.log(`      ${permitida.motivo}`);
    }
    for (const nome of SERVICOS_AUSENTES_NO_HOSPEDADO) {
      console.log(`  - servico \`${nome[0]}\` nao sobe no destino hospedado`);
      console.log(`      ${nome[1]}`);
    }
    for (const campo of resultado.naoUsadas) {
      console.log(
        `  [aviso] \`${campo}\` esta na lista fechada e nao divergiu: a lista pode encolher`,
      );
    }
    for (const resposta of respostas) {
      const plano = achatar(resposta.corpo);
      console.log(
        `  ${resposta.rotulo}: artifact=${plano.get('build.artifact') ?? '(ausente)'} ` +
          `commit=${plano.get('build.commit') ?? '(ausente)'}`,
      );
    }
  } else {
    falhas.push('nem todos os destinos responderam: nao ha comparacao a fazer, e isso reprova');
  }

  if (falhas.length > 0) {
    console.log(`\nREPROVADO com ${falhas.length} achado(s):`);
    for (const f of falhas) console.log(`  - ${f}`);
    return 1;
  }
  console.log('\nAPROVADO');
  return 0;
}

const invocadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (erro: unknown) => {
      console.error(erro);
      process.exit(1);
    },
  );
}
