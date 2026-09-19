/**
 * Comparador de destinos: o que PODE divergir está numa lista fechada, e só
 * isso pode ter divergido.
 *
 * Por que este arquivo existe
 * ---------------------------
 * O critério 12 de BICHUS-13 pede portabilidade **provada por execução** nos
 * dois destinos. A prova que existia era: o mesmo fonte foi construído duas
 * vezes e as duas pilhas subiram. O QA reprovou, com razão, por três motivos —
 * e dois deles moram aqui:
 *
 *  - **"mesmo artefato" não era verificado em lugar nenhum.** A esteira já
 *    compara `docker inspect` de `api` e `worker` e reprova se diferirem; entre
 *    DESTINOS essa asserção não existia. Aqui ela existe, e ela compara o que a
 *    aplicação responde sobre si mesma (`build.artifact` de `/v1/health`), que é
 *    calculado do disco de dentro do container e não declarado por ninguém.
 *  - **As composições divergem e a divergência não estava declarada.** `mail`
 *    tem `profiles: [dev, qa]` e não sobe no destino hospedado: um dos quatro
 *    serviços do critério 1 simplesmente não existe lá. Isso não é defeito, é
 *    uma decisão — e o que faltava era ela estar escrita num lugar que reprova
 *    quando alguém acrescenta a segunda sem dizer.
 *
 * A forma
 * -------
 * Divergência permitida é ENUMERADA, com motivo, e impressa a cada execução.
 * Lista de exceção que ninguém vê é lista que cresce. Tudo que não está nela e
 * divergiu reprova, nomeando o campo e os dois valores.
 *
 * **Quando não consegue verificar, reprova.** Destino fora do ar, JSON
 * ilegível, campo ausente — reprovação com o motivo, nunca "está tudo bem".
 *
 * O autoteste roda ANTES da rede: as iscas abaixo PRECISAM ser reprovadas, e
 * uma delas precisa passar. Se o comparador deixar de enxergar, ele falha
 * dizendo isso e nem chega a consultar os destinos. Verificação que nunca
 * reprovou não é verificação.
 *
 * Uso:
 *   node dist/tools/comparar-destinos.js <rotulo>=<url> <rotulo>=<url> [...]
 *   node dist/tools/comparar-destinos.js      (so a topologia, dizendo que so isso rodou)
 * Saída: 0 aprovado, 1 reprovado.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const VERSAO_DO_COMPARADOR = '1.0.0';

const TEMPO_LIMITE_MS = 15_000;
const CAMINHO_DA_SONDA = '/v1/health';

// ---------------------------------------------------------------------------
// A LISTA FECHADA
// ---------------------------------------------------------------------------

export interface DivergenciaPermitida {
  /** Caminho do campo na resposta da sonda, com pontos. */
  readonly campo: string;
  readonly motivo: string;
}

/**
 * O que pode divergir entre destinos na resposta de `/v1/health`.
 *
 * Entrar nesta lista é uma decisão, e ela é impressa a cada execução para que
 * seja uma decisão que alguém vê. Sair dela é o objetivo.
 */
export const DIVERGENCIAS_PERMITIDAS: readonly DivergenciaPermitida[] = [
  {
    campo: 'build.commit',
    motivo:
      'o commit é DECLARADO pela variável `BUILD_COMMIT` e não viaja dentro da imagem: ' +
      'para viajar seria preciso um `ARG` no `Dockerfile`, que hoje não existe. Enquanto ' +
      'for assim, um destino pode declarar e o outro não, e nenhum dos dois estaria ' +
      'mentindo. Quem compara artefato compara `build.artifact`, que é evidência. Esta ' +
      'linha sai da lista no dia em que o argumento de build entrar',
  },
];

/**
 * Serviços do `compose.yaml` que, por decisão, NÃO sobem no destino hospedado.
 *
 * A chave é o nome do serviço; o valor é por que ele fica de fora. Todo serviço
 * que carrega `profiles:` precisa estar aqui, e toda entrada daqui precisa
 * existir no compose COM `profiles:` — as duas direções reprovam, porque uma
 * lista que só cresce e uma lista que envelhece falham do mesmo jeito: calada.
 */
export const SERVICOS_AUSENTES_NO_HOSPEDADO: ReadonlyMap<string, string> = new Map([
  [
    'mail',
    'captura SMTP local (Mailpit). No destino hospedado `MAIL_TRANSPORT` é `log` porque o ' +
      'adaptador do Postmark ainda não existe (ADR-0009). Ele não prova entregabilidade em ' +
      'nenhum dos dois destinos: isso é reputação de domínio, SPF, DKIM e DMARC',
  ],
]);

// ---------------------------------------------------------------------------
// Comparação, pura e testável
// ---------------------------------------------------------------------------

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
    // Objeto vazio é uma folha: sem isto, `checks: {}` num destino e
    // `checks: {database: 'ok'}` no outro não produziriam campo nenhum para
    // comparar, e a ausência das sondas passaria calada.
    if (plano.size === 0) plano.set(prefixo, '{}');
    return plano;
  }
  plano.set(prefixo, JSON.stringify(valor));
  return plano;
}

/**
 * Campos que a comparação exige que EXISTAM nos dois lados.
 *
 * Sem esta lista, um destino que parasse de responder `build` sumiria da
 * comparação junto com o campo: nada para comparar vira nada para reprovar, que
 * é o jeito mais silencioso de um portão parar de valer.
 */
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

// ---------------------------------------------------------------------------
// A topologia: quem não sobe no destino hospedado
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Autoteste: as iscas rodam antes da rede
// ---------------------------------------------------------------------------

const SONDA_BASE = {
  status: 'ok',
  version: '0.1.0',
  build: { artifact: '0123456789abcdef', commit: null },
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

/** Cada isca diz o que ela precisa produzir. Resultado diferente é cegueira. */
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

  // Controle positivo: sem ele o autoteste ficaria verde com um comparador que
  // reprova tudo, que não compara nada — só reclama.
  const soOCommit = compararRespostas(par(comCampo('build.commit', '1a4a3f7')));
  if (soOCommit.falhas.length > 0) {
    falhas.push(
      'a divergência PERMITIDA `build.commit` reprovou: a lista fechada não está sendo ' +
        `consultada (${soOCommit.falhas.join('; ')})`,
    );
  }
  if (compararRespostas(par(structuredClone(SONDA_BASE))).falhas.length > 0) {
    falhas.push('duas sondas idênticas reprovaram: o comparador reprova qualquer coisa');
  }

  // Topologia: as duas direções.
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

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

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

  // SEM destino nenhum: só a topologia foi conferida, e isso é dito em voz
  // alta. É o modo que a esteira de PR usa, porque num PR o destino hospedado
  // ainda não foi implantado e comparar com ele reprovaria por motivo errado.
  // A comparação de verdade roda no fluxo agendado `dois-destinos.yml`.
  //
  // UM destino só reprova: um destino concorda consigo mesmo.
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
