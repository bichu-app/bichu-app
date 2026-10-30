#!/usr/bin/env node
/* global console, process, fetch, AbortSignal, Buffer */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. Mesma linha dos irmaos deste diretorio.
/**
 * O `.env` da subida e o gerenciador de segredos dizem a MESMA coisa?
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * `src/shared/config/segredos.ts` SOBRESCREVE `process.env` no boot: em
 * ambiente hospedado (`NODE_ENV=production`, ou `ENVIRONMENT` em `prod`/
 * `preprod`) `resolverSegredos` le cada nome de `SEGREDOS_DE_RUNTIME` no Secret
 * Manager do GCP e grava o valor em cima do que o `env_file` tinha posto ali.
 * Os quatro executaveis fazem isso: `bin/api.js`, `bin/worker.js`,
 * `bin/leitor-de-midia.js` e `bin/conta-admin.js`.
 *
 * Em homologacao, o `.env` da VM tinha a chave CERTA do Google Cloud Storage. O
 * Secret Manager tinha UMA unica versao, de 29/09 -- a chave do MinIO, anterior
 * a migracao para o GCS. O boot sobrescrevia a chave certa pela errada, e a
 * aplicacao passava a assinar politica `GOOG4` com credencial de MinIO: TODO
 * envio de foto do app falhava com 403, desde 08/10. So apareceu quando o
 * cliente tentou mandar uma foto.
 *
 * O aviso estava escrito no proprio `segredos.ts`, em cima das duas linhas:
 *
 *   "As duas credenciais de armazenamento andam juntas; uma so assina o que o
 *    armazenamento recusa, e a falha apareceria no primeiro envio de foto."
 *
 * Previsto, comentado, e sem ninguem medindo. Este arquivo e a medicao.
 *
 * ====================================================================
 * POR QUE AS SONDAS DE ANTES LIAM 204 E NAO VIAM NADA
 * ====================================================================
 *
 * Foram SEIS rodadas para fechar o diagnostico, porque as duas sondas obvias
 * mentem, as duas pelo mesmo motivo:
 *
 *   - `docker exec <container> node -e ...` roda um processo NOVO. Processo novo
 *     nao executa `resolverSegredos`: ele le o `env_file` e para ali. A sonda
 *     respondia com o valor do `.env`, que era o CERTO, e a conclusao era "o
 *     ambiente esta correto".
 *   - `/proc/1/environ` mostra o ambiente com que o PID 1 foi EXECUTADO. As
 *     mutacoes de `process.env` em tempo de execucao nao aparecem ali. Mesmo
 *     engano, outra roupa.
 *
 * So o inspector do Node atracado no PID 1 respondeu. Isso nao serve de portao:
 * exige porta aberta, processo de pe e um humano olhando.
 *
 * A saida e nao perguntar ao processo. As duas fontes que o boot vai usar podem
 * ser lidas SEPARADAMENTE, antes de qualquer container subir, e comparadas. E o
 * que este portao faz, e e por isso que ele vale sem a aplicacao de pe.
 *
 * ====================================================================
 * DECISAO 1: ONDE ELE RODA
 * ====================================================================
 *
 * Alvo do `Makefile`, no padrao dos 59 `verificar-*` que ja existem, dividido em
 * dois como os vizinhos:
 *
 *   `verificar-segredos-do-gerenciador-autoteste`  as iscas, sem nuvem e sem
 *                                                  segredo -- entra em
 *                                                  `make verificar`;
 *   `verificar-segredos-do-gerenciador`            a conferencia de verdade,
 *                                                  com `--exigir`, chamada na
 *                                                  subida.
 *
 * E a mesma divisao de `verificar-boot-do-alvo-prod` / `-autoteste`: o autoteste
 * prova que o juizo ENXERGA e cabe na lista local; a metade que precisa de
 * recurso externo fica fora dela. O cabecalho de `make verificar` diz, com
 * essas palavras, "tudo que nao precisa de nuvem nem de segredo", e este portao
 * precisa das duas coisas -- ele reprovaria toda maquina de desenvolvimento se
 * entrasse ali.
 *
 * Os outros dois candidatos foram MEDIDOS e recusados:
 *
 *   - passo do `infra/cd/implantar.sh`: o arquivo existe no disco desta maquina
 *     e NAO esta no git (`git ls-files infra/cd/` volta vazio, e
 *     `git check-ignore` nao casa: ele simplesmente nunca foi commitado). Um
 *     passo escrito la nao e revisado, nao e lintado, nao e exercitado por
 *     autoteste nenhum e nao viaja para outro clone. O roteiro de subida CHAMA
 *     este alvo; a regra mora no repositorio.
 *   - verificacao no proprio boot: e tarde e e circular. Tarde porque o boot ja
 *     sobrescreveu `process.env` quando teria o que comparar -- o valor do
 *     `.env` nao existe mais para ser lido. Circular porque quem comparasse
 *     seria o mesmo processo cujo defeito se quer pegar, e a divergencia
 *     legitima (rotacao: versao nova no gerenciador, `.env` velho) passaria a
 *     derrubar a aplicacao em producao em vez de reprovar uma subida.
 *
 * ====================================================================
 * DECISAO 2: COMO COMPARAR SEM IMPRIMIR SEGREDO
 * ====================================================================
 *
 * Por IMPRESSAO DIGITAL: `sha256` do valor, truncado em 12 digitos hex, mais o
 * comprimento em bytes. O valor nunca e impresso, nem em pedaco, nem em prefixo
 * -- prefixo de `AKIA...`/`GOOG1...` identificaria a conta.
 *
 * A digital e SEM SAL de proposito, e a escolha tem preco e motivo. O preco:
 * duas digitais iguais em dois logs diferentes dizem que o valor e o mesmo, e
 * um dicionario de valores suspeitos poderia ser testado contra ela. O motivo:
 * e exatamente isso que faz o diagnostico ser possivel sem o segredo na mao --
 * quem investiga roda `printf %s "$valor" | shasum -a 256 | cut -c1-12` na
 * ponta que ele tem e compara com o log. Com sal por execucao, as duas colunas
 * desta tabela continuariam comparaveis entre si e nada mais, e a sexta rodada
 * de hoje teria sido a setima.
 *
 * Quando as duas digitais diferem, o portao ainda diz COMO diferem, sem dizer o
 * que sao: espaco em branco nas pontas, caixa, ou comprimento. O primeiro caso
 * e o mais comum de todos na pratica -- `echo "$chave" | gcloud secrets create`
 * sem `-n` grava um `\n` no fim, e "divergem" sozinho manda procurar a chave
 * errada quando o defeito e um byte invisivel.
 *
 * ====================================================================
 * DECISAO 3: SEM ACESSO A NUVEM
 * ====================================================================
 *
 * Tres desfechos, tres codigos de saida, e NENHUM deles e verde por omissao:
 *
 *   0  APROVADO      comparou >= 1 segredo e todos batem.
 *   1  REPROVA       divergiu, ou faltou declaracao, ou o gerenciador recusou
 *                    um nome, ou o portao nao conseguiu conferir COM `--exigir`.
 *   2  INCONCLUSIVO  uma das duas fontes nao esta ao alcance (sem credencial,
 *                    sem `.env`, subida que nao liga a troca).
 *
 * Quem roda numa maquina de desenvolvimento, sem credencial do GCP, recebe 2 com
 * o nome de cada variavel que ficou SEM CONFERIR e a receita para conferir. Ele
 * nao e acusado de nada -- nao e defeito dele nao ter nuvem -- e tambem nao
 * recebe "APROVADO", que e a mentira que este repositorio ja pagou caro: o run
 * 35750052587 ficou verde porque um passo leu "nao consegui perguntar" como
 * resposta (ver `infra/verificacao/verificar_consulta_externa.py`).
 *
 * `--exigir` colapsa 2 em 1, e e a diferenca entre "nao tenho como conferir" e
 * "era obrigatorio conferir aqui". A subida passa `--exigir`: na VM a
 * credencial existe (servidor de metadados), e se ela nao existe a aplicacao
 * tambem nao vai subir. Fora da subida, ninguem passa `--exigir`.
 *
 * CONTROLE POSITIVO DE TODO ZERO. Zero divergencia so vale se algo foi
 * comparado: comparou zero segredos NAO imprime APROVADO, reprova dizendo que
 * comparou zero. Vale para a lista vazia, para o `.env` sem nenhum dos nomes e
 * para a lista que encolheu na fonte.
 *
 * ====================================================================
 * O QUE ELE ANCORA NA FONTE, EM VEZ DE COPIAR
 * ====================================================================
 *
 * Portao que copia a regra aprova depois de a regra mudar de lugar. Tres coisas
 * sao LIDAS de `src/`, e cada leitura tem controle positivo no autoteste:
 *
 *   1. a lista de nomes, de `SEGREDOS_DE_RUNTIME` em `segredos.ts`;
 *   2. a regra condicional do `MAIL_API_TOKEN`, da propria `segredosDeRuntime`;
 *   3. o ENDERECO que o adaptador monta e a raiz do gerenciador, de
 *      `gcp-secret-manager.ts` -- se o adaptador passar a ler outra versao ou
 *      outro caminho, este portao estaria medindo outro lugar, e reprova.
 *
 * A UNICA coisa que ele afirma por conta propria e que as DUAS credenciais de
 * armazenamento estao na lista. Isso e deliberado: sao elas que custaram as seis
 * rodadas, e uma delas sumir da lista em silencio e o defeito voltando pela
 * porta de tras. Se sairem de proposito, este portao precisa ser reescrito, e e
 * o que a mensagem de reprovacao diz.
 *
 * Uso:
 *   node infra/verificacao/verificar-segredos-do-gerenciador.mjs --autoteste
 *   node infra/verificacao/verificar-segredos-do-gerenciador.mjs --exigir
 *   node infra/verificacao/verificar-segredos-do-gerenciador.mjs \
 *     --env /caminho/do/.env --projeto <projeto> --versao latest
 * Saida: 0 aprovado, 1 reprovado, 2 inconclusivo.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ =
  spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || '.';

const FONTE_DA_LISTA = 'src/shared/config/segredos.ts';
const FONTE_DO_ADAPTADOR = 'src/shared/adapters/external/gcp-secret-manager.ts';

/** A raiz do gerenciador. Conferida contra `FONTE_DO_ADAPTADOR` antes de ser usada. */
const GERENCIADOR = 'https://secretmanager.googleapis.com/v1';
/** O endereco do token da conta de servico da VM. */
const METADADOS =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** `latest`, como `VERSAO_PADRAO` do adaptador. */
const VERSAO_PADRAO = 'latest';
/** `TRANSPORTE_DE_EMAIL_PADRAO` de `src/shared/config/transporte-de-email.ts`. */
const TRANSPORTE_PADRAO = 'smtp';
/** O transporte que exige o token do provedor (`exigeTokenDoProvedor`). */
const TRANSPORTE_COM_TOKEN = 'postmark';

/** As duas que custaram as seis rodadas. Nao podem sair da lista em silencio. */
const AS_DUAS_DO_ARMAZENAMENTO = [
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
];

/** A subida nao pode ficar pendurada esperando rede, como no adaptador. */
const TIMEOUT_MS = 5_000;

export const SAIDA = { APROVADO: 0, REPROVADO: 1, INCONCLUSIVO: 2 };

// ---------------------------------------------------------------------------
// A LEITURA DA FONTE. Tudo aqui e puro: o autoteste passa texto.
// ---------------------------------------------------------------------------

/** Tira comentario de bloco e de linha, para que texto de comentario nao vire nome. */
function semComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Os nomes de `SEGREDOS_DE_RUNTIME`, lidos do texto de `segredos.ts`.
 *
 * Lanca quando nao da para ler: constante renomeada, bloco com outra forma ou
 * lista vazia. Portao que nao consegue ler a lista nao confere lista nenhuma.
 */
export function extrairListaDeRuntime(texto) {
  const bloco = /SEGREDOS_DE_RUNTIME[^=]*=\s*\[([\s\S]*?)\]\s*;/.exec(texto);
  if (bloco === null) {
    throw new Error(
      `nao achei a lista \`SEGREDOS_DE_RUNTIME\` em ${FONTE_DA_LISTA}: ` +
        'a constante foi renomeada, ou o bloco mudou de forma',
    );
  }
  const nomes = [...semComentarios(bloco[1]).matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((m) => m[1]);
  if (nomes.length === 0) {
    throw new Error(
      `\`SEGREDOS_DE_RUNTIME\` em ${FONTE_DA_LISTA} esta vazia: nao ha segredo de runtime a conferir`,
    );
  }
  return nomes;
}

/**
 * O nome que `segredosDeRuntime` tira da lista quando o transporte de e-mail
 * nao exige token do provedor. Lido da fonte, e nao copiado: hoje e
 * `MAIL_API_TOKEN`, e se virar outro o portao segue a fonte.
 */
export function extrairCondicionalDaFonte(texto) {
  const corpo = /segredosDeRuntime\s*\([\s\S]*?\n}/.exec(texto);
  if (corpo === null) {
    throw new Error(
      `nao achei a funcao \`segredosDeRuntime\` em ${FONTE_DA_LISTA}: ` +
        'a lista desta subida deixou de ser derivada ali',
    );
  }
  const condicional = /nome !== '([A-Z][A-Z0-9_]*)'/.exec(corpo[0]);
  if (condicional === null) {
    throw new Error(
      `\`segredosDeRuntime\` em ${FONTE_DA_LISTA} nao filtra mais um nome por transporte: ` +
        'a regra condicional mudou de forma e este portao precisa ser reescrito',
    );
  }
  return condicional[1];
}

/** O endereco que ESTE portao vai ler, e que precisa ser o mesmo do adaptador. */
export function enderecoDoSegredo(raiz, projeto, versao, nome) {
  return `${raiz}/projects/${projeto}/secrets/${nome}/versions/${versao}:access`;
}

/**
 * O endereco e a raiz do gerenciador, lidos do texto de `gcp-secret-manager.ts`
 * e normalizados para a mesma forma canonica que `enderecoDoSegredo` produz.
 *
 * ESTE E O CONTROLE POSITIVO QUE IMPORTA MAIS: se o adaptador passar a ler
 * outro caminho (outra versao, outro projeto, `:access` trocado), este portao
 * continuaria comparando o `.env` com um lugar que o boot nao le -- e aprovaria
 * para sempre. Em vez de confiar, ele compara as duas formas.
 */
export function extrairEnderecoDoAdaptador(texto) {
  const raiz = /GERENCIADOR\s*=\s*'([^']+)'/.exec(texto);
  if (raiz === null) {
    throw new Error(
      `nao achei a constante \`GERENCIADOR\` em ${FONTE_DO_ADAPTADOR}: ` +
        'a raiz do gerenciador saiu de la',
    );
  }
  const alvo = /const alvo = `([^`]+)`/.exec(texto);
  if (alvo === null) {
    throw new Error(
      `nao achei o endereco (\`const alvo = ...\`) em ${FONTE_DO_ADAPTADOR}: ` +
        'o adaptador monta a URL de outro jeito e este portao precisa ser reescrito',
    );
  }
  const canonico = alvo[1]
    .replaceAll('${GERENCIADOR}', '<raiz>')
    .replaceAll('${config.projeto}', '<projeto>')
    .replaceAll('${config.versao}', '<versao>')
    .replaceAll('${nome}', '<nome>');
  return { raiz: raiz[1], canonico };
}

/** A forma canonica do endereco deste portao, para comparar com a da fonte. */
export function enderecoCanonicoDoPortao() {
  return enderecoDoSegredo('<raiz>', '<projeto>', '<versao>', '<nome>');
}

/** A mesma pergunta de `exigeGerenciadorDeSegredos`, feita sobre um `.env`. */
export function trocaEstaLigada(valores) {
  const ambiente = valores.get('ENVIRONMENT') ?? '';
  return (
    valores.get('NODE_ENV') === 'production' || ambiente === 'prod' || ambiente === 'preprod'
  );
}

/** A lista que ESTA subida resolve, como `segredosDeRuntime` a monta. */
export function listaDesteBoot(nomes, condicional, transporte) {
  if (transporte === TRANSPORTE_COM_TOKEN) return [...nomes];
  return nomes.filter((n) => n !== condicional);
}

// ---------------------------------------------------------------------------
// A LEITURA DO `.env`
// ---------------------------------------------------------------------------

/**
 * O `.env` como o `env_file` do compose o entrega: ultima ocorrencia vence,
 * comentario so em linha inteira, aspas das pontas removidas.
 *
 * `#` no MEIO do valor NAO abre comentario, de proposito -- o `env_file` nao
 * trata assim, e um portao que cortasse ali inventaria divergencia em toda
 * senha com `#`. Falso REPROVA custa mais que o portao vale.
 */
export function parsearEnv(texto) {
  const valores = new Map();
  const comAspas = new Set();
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (linha === '' || linha.startsWith('#')) continue;
    const corte = linha.indexOf('=');
    if (corte <= 0) continue;
    let chave = linha.slice(0, corte).trim();
    if (chave.startsWith('export ')) chave = chave.slice('export '.length).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) continue;
    let valor = linha.slice(corte + 1).trim();
    const aspas = /^(['"])([\s\S]*)\1$/.exec(valor);
    if (aspas !== null) {
      valor = aspas[2];
      comAspas.add(chave);
    } else {
      comAspas.delete(chave);
    }
    valores.set(chave, valor);
  }
  return { valores, comAspas };
}

// ---------------------------------------------------------------------------
// A DIGITAL, E O DIAGNOSTICO DA DIVERGENCIA. Nenhum valor sai daqui.
// ---------------------------------------------------------------------------

/** `sha256` truncado mais o comprimento. Nunca o valor, nem prefixo dele. */
export function digital(valor) {
  const hex = createHash('sha256').update(valor, 'utf8').digest('hex').slice(0, 12);
  return `sha256:${hex} (${String(Buffer.byteLength(valor, 'utf8'))} bytes)`;
}

/** COMO os dois diferem, sem dizer o que sao. */
export function diagnosticar(declarado, doGerenciador) {
  if (declarado.trim() === doGerenciador.trim()) {
    return (
      'iguais depois de tirar espaco em branco das PONTAS. Provavel versao gravada ' +
      'com `echo` sem `-n`, que poe um \\n no fim. O boot usa o valor verbatim, ' +
      'entao este \\n basta para a assinatura ser recusada'
    );
  }
  if (declarado.toLowerCase() === doGerenciador.toLowerCase()) {
    return 'iguais a menos de CAIXA. Provavel copia por transcricao, nao por recorte';
  }
  const a = Buffer.byteLength(declarado, 'utf8');
  const b = Buffer.byteLength(doGerenciador, 'utf8');
  if (a !== b) {
    return `comprimentos diferentes (${String(a)} e ${String(b)} bytes): sao valores distintos, nao variacao do mesmo`;
  }
  return 'mesmo comprimento e conteudo diferente: provavel credencial de OUTRA conta';
}

// ---------------------------------------------------------------------------
// A DECISAO, isolada de proposito: e ela que o autoteste exercita.
// ---------------------------------------------------------------------------

/**
 * Compara nome por nome. `declarados` e o Map do `.env`; `doGerenciador` e um
 * Map de nome para `{ valor }` ou `{ erro }`.
 */
export function comparar(nomes, declarados, doGerenciador) {
  const iguais = [];
  const divergentes = [];
  const semDeclaracao = [];
  const semNoGerenciador = [];

  for (const nome of nomes) {
    const resposta = doGerenciador.get(nome);
    if (resposta === undefined || resposta.erro !== undefined) {
      semNoGerenciador.push({
        nome,
        motivo: resposta?.erro ?? 'o gerenciador nao foi consultado para este nome',
      });
      continue;
    }
    const declarado = declarados.get(nome);
    if (declarado === undefined || declarado === '') {
      semDeclaracao.push(nome);
      continue;
    }
    if (declarado === resposta.valor) {
      iguais.push(nome);
      continue;
    }
    divergentes.push({
      nome,
      declarada: digital(declarado),
      doGerenciador: digital(resposta.valor),
      diagnostico: diagnosticar(declarado, resposta.valor),
    });
  }

  return { iguais, divergentes, semDeclaracao, semNoGerenciador };
}

/**
 * O veredito sobre um resultado de `comparar`. Devolve `{ codigo, motivos }`.
 *
 * COMPAROU ZERO NAO E APROVADO. Essa linha e o controle positivo de todo zero
 * deste arquivo: sem ela, uma lista que encolheu, um `.env` sem nenhum dos nomes
 * ou um gerenciador que recusou tudo imprimiriam "nenhuma divergencia".
 */
export function veredito(resultado) {
  const motivos = [];
  const comparados = resultado.iguais.length + resultado.divergentes.length;

  if (resultado.divergentes.length > 0) {
    motivos.push(
      `${String(resultado.divergentes.length)} segredo(s) divergem entre o .env e o gerenciador`,
    );
  }
  if (resultado.semDeclaracao.length > 0) {
    motivos.push(
      `${String(resultado.semDeclaracao.length)} segredo(s) sem valor no .env: nao ha com o que comparar`,
    );
  }
  if (resultado.semNoGerenciador.length > 0) {
    motivos.push(
      `${String(resultado.semNoGerenciador.length)} segredo(s) que o gerenciador nao entregou`,
    );
  }
  if (comparados === 0) {
    motivos.push('comparou ZERO segredos: nao ha medicao, e sem medicao nao ha aprovacao');
  }

  return { codigo: motivos.length === 0 ? SAIDA.APROVADO : SAIDA.REPROVADO, motivos };
}

// ---------------------------------------------------------------------------
// O ACESSO AO GERENCIADOR. Injetavel, para que o autoteste rode sem rede.
// ---------------------------------------------------------------------------

/** O token da conta de servico da VM, ou `undefined` se nao houver VM. */
async function tokenDoMetadados(buscar) {
  try {
    const resposta = await buscar(METADADOS, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) return undefined;
    const corpo = await resposta.json();
    return typeof corpo?.access_token === 'string' ? corpo.access_token : undefined;
  } catch {
    return undefined;
  }
}

/** O token da credencial de quem roda a mao. Nao cria nem renova nada. */
function tokenDoGcloud() {
  const r = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' });
  if (r.status !== 0) return undefined;
  const token = (r.stdout ?? '').trim();
  return token === '' ? undefined : token;
}

/**
 * Le os nomes no gerenciador. Devolve um Map de nome para `{ valor }` ou
 * `{ erro }` -- erro POR NOME, e nao uma excecao que apaga a tabela inteira.
 */
export async function lerDoGerenciador(nomes, { raiz, projeto, versao, token, buscar }) {
  const saida = new Map();
  for (const nome of nomes) {
    const alvo = enderecoDoSegredo(raiz, projeto, versao, nome);
    try {
      const resposta = await buscar(alvo, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resposta.ok) {
        saida.set(nome, {
          erro: `o gerenciador respondeu ${String(resposta.status)} para a versao "${versao}" no projeto ${projeto}`,
        });
        continue;
      }
      const corpo = await resposta.json();
      const dados = corpo?.payload?.data;
      if (typeof dados !== 'string') {
        saida.set(nome, { erro: 'resposta 200 sem `payload.data` (o corpo NAO e impresso: pode conter o valor)' });
        continue;
      }
      const valor = Buffer.from(dados, 'base64').toString('utf8');
      if (valor === '') {
        saida.set(nome, { erro: `a versao "${versao}" existe e esta VAZIA` });
        continue;
      }
      saida.set(nome, { valor });
    } catch (erro) {
      saida.set(nome, {
        erro: `nao foi possivel falar com o gerenciador: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// IMPRESSAO
// ---------------------------------------------------------------------------

function imprimirInconclusivo(motivo, nomes, exigir, receita) {
  const canal = exigir ? console.error : console.log;
  canal(exigir ? `REPROVA: ${motivo}` : `INCONCLUSIVO -- NAO CONFERIDO: ${motivo}`);
  if (nomes.length > 0) {
    canal(`  ${String(nomes.length)} segredo(s) ficaram SEM CONFERIR:`);
    for (const n of nomes) canal(`    - ${n}`);
  }
  for (const linha of receita) canal(`  ${linha}`);
  if (exigir) {
    canal('  `--exigir` foi passado: aqui era obrigatorio conferir, e "nao consegui');
    canal('  perguntar" nao e resposta. Ver verificar_consulta_externa.py.');
  } else {
    canal('  Isto NAO e aprovacao, e tambem nao e culpa de quem rodou: a conferencia');
    canal('  precisa das duas fontes, e uma delas nao esta ao alcance desta maquina.');
  }
  process.exit(exigir ? SAIDA.REPROVADO : SAIDA.INCONCLUSIVO);
}

function imprimirResultado(resultado, contexto) {
  const { codigo, motivos } = veredito(resultado);

  if (codigo === SAIDA.APROVADO) {
    console.log(
      `APROVADO: os ${String(resultado.iguais.length)} segredos de runtime desta subida tem o MESMO ` +
        `valor no ${contexto.env} e no gerenciador (projeto ${contexto.projeto}, versao ${contexto.versao}).`,
    );
    for (const nome of resultado.iguais) console.log(`  = ${nome}  ${contexto.digitais.get(nome)}`);
    console.log('  A digital e sha256 truncado: nenhum valor foi impresso.');
    return SAIDA.APROVADO;
  }

  console.error('REPROVA: o que o .env declara e o que o gerenciador devolve NAO sao a mesma coisa.');
  for (const m of motivos) console.error(`  - ${m}`);

  if (resultado.divergentes.length > 0) {
    console.error('');
    console.error('  DIVERGEM (o boot vai usar a coluna do gerenciador, por cima do .env):');
    for (const d of resultado.divergentes) {
      console.error(`    ${d.nome}`);
      console.error(`      no ${contexto.env}:  ${d.declarada}`);
      console.error(`      no gerenciador: ${d.doGerenciador}`);
      console.error(`      ${d.diagnostico}`);
    }
  }
  if (resultado.semDeclaracao.length > 0) {
    console.error('');
    console.error('  SEM VALOR NO .env (ADR-0022: o nome da variavel e o nome do segredo):');
    for (const n of resultado.semDeclaracao) console.error(`    - ${n}`);
  }
  if (resultado.semNoGerenciador.length > 0) {
    console.error('');
    console.error('  O GERENCIADOR NAO ENTREGOU (o boot morreria nestes, mais tarde):');
    for (const { nome, motivo } of resultado.semNoGerenciador) {
      console.error(`    - ${nome}: ${motivo}`);
    }
  }

  console.error('');
  console.error('  POR QUE ISTO E GRAVE, e nao um aviso: `resolverSegredos` SOBRESCREVE');
  console.error('  `process.env` no boot. O valor do .env e descartado em silencio, e a');
  console.error('  aplicacao passa a usar o do gerenciador sem dizer nada a ninguem.');
  console.error('  Foi assim que todo envio de foto falhou com 403 por onze dias.');
  console.error('');
  console.error('  Saida: decida QUAL dos dois e o valor certo (o portao nao sabe, e nao');
  console.error('  tenta adivinhar) e crie uma VERSAO NOVA do segredo com o valor certo,');
  console.error('  depois reinicie o processo -- o adaptador le `latest` justamente para');
  console.error('  que rotacionar nao precise de deploy. Nao edite o .env para "bater":');
  console.error('  quem manda no runtime e o gerenciador.');
  return SAIDA.REPROVADO;
}

// ---------------------------------------------------------------------------
// AUTOTESTE
// ---------------------------------------------------------------------------

async function autoteste() {
  let ruim = 0;
  const caso = (nome, ok, detalhe) => {
    if (!ok) ruim++;
    console.log(`  [ ${ok ? 'ok' : 'RUIM'} ] ${nome}`);
    if (!ok && detalhe !== undefined) console.log(`           ${detalhe}`);
  };

  // -- A ISCA PRINCIPAL, NOS DOIS SENTIDOS ---------------------------------
  // A lista real, o `.env` real em forma, e o gerenciador respondendo.
  const nomes = [
    'DATABASE_URL',
    'IP_HMAC_KEY',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  ];
  const certos = new Map([
    ['DATABASE_URL', 'postgres://u:p@h/db'],
    ['IP_HMAC_KEY', 'chave-de-hmac'],
    ['OBJECT_STORAGE_ACCESS_KEY_ID', 'GOOG1EDOCERTO'],
    ['OBJECT_STORAGE_SECRET_ACCESS_KEY', 'segredo-do-gcs-certo'],
  ]);
  const comoGerenciador = (m) => new Map([...m].map(([n, v]) => [n, { valor: v }]));

  const iguais = comparar(nomes, certos, comoGerenciador(certos));
  caso(
    'ISCA POSITIVA: os dois lados iguais APROVAM, e os quatro foram comparados',
    veredito(iguais).codigo === SAIDA.APROVADO && iguais.iguais.length === 4,
    `veio codigo ${String(veredito(iguais).codigo)} com ${String(iguais.iguais.length)} comparados`,
  );

  // O DEFEITO DE HOJE, plantado: o gerenciador tem a chave do MinIO.
  const comMinio = new Map(certos);
  comMinio.set('OBJECT_STORAGE_ACCESS_KEY_ID', 'minio-de-29-09');
  const plantada = comparar(nomes, certos, comoGerenciador(comMinio));
  caso(
    'ISCA NEGATIVA (o defeito de hoje): a chave do MinIO no gerenciador REPROVA',
    veredito(plantada).codigo === SAIDA.REPROVADO,
  );
  caso(
    '  e a reprovacao NOMEIA a variavel, nao so a contagem',
    plantada.divergentes.length === 1 &&
      plantada.divergentes[0].nome === 'OBJECT_STORAGE_ACCESS_KEY_ID',
    `divergentes: ${plantada.divergentes.map((d) => d.nome).join(', ') || '(nenhuma)'}`,
  );
  caso(
    '  e NENHUM valor aparece na saida da divergencia',
    !JSON.stringify(plantada.divergentes).includes('minio-de-29-09') &&
      !JSON.stringify(plantada.divergentes).includes('GOOG1EDOCERTO'),
  );
  caso(
    '  e os outros tres continuam conferidos (a divergencia nao apaga a tabela)',
    plantada.iguais.length === 3,
  );

  // A assimetria que o comentario de `segredos.ts` previu: UMA das duas.
  const soASecreta = new Map(certos);
  soASecreta.set('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'segredo-do-minio');
  const assimetrica = comparar(nomes, certos, comoGerenciador(soASecreta));
  caso(
    'so a SECRET_ACCESS_KEY divergindo tambem reprova, nomeando ela',
    veredito(assimetrica).codigo === SAIDA.REPROVADO &&
      assimetrica.divergentes.length === 1 &&
      assimetrica.divergentes[0].nome === 'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  );

  // As duas juntas: nomeia AS DUAS.
  const asDuas = new Map(certos);
  asDuas.set('OBJECT_STORAGE_ACCESS_KEY_ID', 'minio-id');
  asDuas.set('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'minio-segredo');
  const duasDivergem = comparar(nomes, certos, comoGerenciador(asDuas));
  caso(
    'as duas credenciais de armazenamento divergindo nomeiam AS DUAS',
    duasDivergem.divergentes.map((d) => d.nome).sort().join(',') ===
      AS_DUAS_DO_ARMAZENAMENTO.slice().sort().join(','),
  );

  // -- O \n DO `echo`, que e o caso mais comum na pratica -------------------
  const comQuebra = new Map(certos);
  comQuebra.set('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'segredo-do-gcs-certo\n');
  const doEcho = comparar(nomes, certos, comoGerenciador(comQuebra));
  caso(
    'versao gravada com `echo` sem -n (um \\n no fim) REPROVA, e nao passa por igual',
    doEcho.divergentes.length === 1,
  );
  caso(
    '  e o diagnostico diz que o defeito e espaco em branco, nao "chave errada"',
    doEcho.divergentes[0]?.diagnostico.includes('PONTAS') === true,
    doEcho.divergentes[0]?.diagnostico,
  );

  // -- OS ZEROS, cada um com controle positivo ------------------------------
  caso(
    'TODO ZERO: comparar ZERO segredos NAO aprova',
    veredito(comparar([], certos, comoGerenciador(certos))).codigo === SAIDA.REPROVADO,
  );
  caso(
    'TODO ZERO: `.env` sem nenhum dos nomes NAO aprova',
    veredito(comparar(nomes, new Map(), comoGerenciador(certos))).codigo === SAIDA.REPROVADO,
  );
  caso(
    'TODO ZERO: gerenciador que recusou tudo NAO aprova',
    veredito(comparar(nomes, certos, new Map())).codigo === SAIDA.REPROVADO,
  );

  // -- Falta de um lado so -------------------------------------------------
  const semUm = new Map(certos);
  semUm.delete('OBJECT_STORAGE_ACCESS_KEY_ID');
  const faltaNoEnv = comparar(nomes, semUm, comoGerenciador(certos));
  caso(
    'nome ausente no .env reprova NOMEANDO ele, em vez de ser ignorado',
    veredito(faltaNoEnv).codigo === SAIDA.REPROVADO &&
      faltaNoEnv.semDeclaracao.join(',') === 'OBJECT_STORAGE_ACCESS_KEY_ID',
  );
  const vazioNoEnv = new Map(certos);
  vazioNoEnv.set('IP_HMAC_KEY', '');
  caso(
    'nome VAZIO no .env conta como ausente (o `.env.example` traz `CHAVE=`)',
    comparar(nomes, vazioNoEnv, comoGerenciador(certos)).semDeclaracao.join(',') === 'IP_HMAC_KEY',
  );
  const recusado = comoGerenciador(certos);
  recusado.set('TAG_CODE_KEY', { erro: 'o gerenciador respondeu 403' });
  caso(
    'nome que o gerenciador recusou reprova NOMEANDO ele',
    comparar([...nomes, 'TAG_CODE_KEY'], certos, recusado).semNoGerenciador[0]?.nome ===
      'TAG_CODE_KEY',
  );

  // -- A DIGITAL -----------------------------------------------------------
  caso(
    'a digital nao contem o valor, e e estavel entre chamadas',
    !digital('GOOG1SEGREDO').includes('GOOG1SEGREDO') &&
      digital('GOOG1SEGREDO') === digital('GOOG1SEGREDO'),
  );
  caso(
    'valores diferentes dao digitais diferentes',
    digital('a') !== digital('b'),
  );
  caso(
    'a digital acusa o \\n: ele muda a digital e o comprimento',
    digital('x') !== digital('x\n'),
  );

  // -- O `.env`: o parse nao pode INVENTAR divergencia ---------------------
  const { valores, comAspas } = parsearEnv(
    [
      '# comentario',
      '',
      'DATABASE_URL=postgres://u:p@h/db',
      'export IP_HMAC_KEY=com-export',
      'OBJECT_STORAGE_ACCESS_KEY_ID="entre-aspas"',
      "OBJECT_STORAGE_SECRET_ACCESS_KEY='entre-apostrofos'",
      'COM_CERQUILHA=senha#nao-e-comentario',
      'REPETIDA=primeira',
      'REPETIDA=segunda',
      'SEM_IGUAL',
      'NAO E CHAVE=valor',
    ].join('\n'),
  );
  caso('o .env le valor simples', valores.get('DATABASE_URL') === 'postgres://u:p@h/db');
  caso('o .env le `export CHAVE=valor`', valores.get('IP_HMAC_KEY') === 'com-export');
  caso(
    'o .env tira as aspas das pontas (e anota que tirou)',
    valores.get('OBJECT_STORAGE_ACCESS_KEY_ID') === 'entre-aspas' &&
      comAspas.has('OBJECT_STORAGE_ACCESS_KEY_ID'),
  );
  caso(
    'o .env tira apostrofos das pontas',
    valores.get('OBJECT_STORAGE_SECRET_ACCESS_KEY') === 'entre-apostrofos',
  );
  caso(
    '`#` no MEIO do valor NAO abre comentario (senao o portao inventa divergencia)',
    valores.get('COM_CERQUILHA') === 'senha#nao-e-comentario',
  );
  caso('a ultima ocorrencia vence, como no env_file', valores.get('REPETIDA') === 'segunda');
  caso(
    'linha sem `=` e nome invalido nao entram',
    !valores.has('SEM_IGUAL') && !valores.has('NAO E CHAVE'),
  );

  // -- A ANCORA NA FONTE: as tres leituras, cada uma nos dois sentidos -----
  const fonteDaLista = join(RAIZ, FONTE_DA_LISTA);
  const fonteDoAdaptador = join(RAIZ, FONTE_DO_ADAPTADOR);
  const textoDaLista = existsSync(fonteDaLista) ? readFileSync(fonteDaLista, 'utf8') : undefined;
  const textoDoAdaptador = existsSync(fonteDoAdaptador)
    ? readFileSync(fonteDoAdaptador, 'utf8')
    : undefined;

  if (textoDaLista === undefined || textoDoAdaptador === undefined) {
    caso(`as duas fontes de src/ existem (${FONTE_DA_LISTA}, ${FONTE_DO_ADAPTADOR})`, false);
  } else {
    const lista = extrairListaDeRuntime(textoDaLista);
    caso(
      `a lista REAL e lida da fonte: ${String(lista.length)} nomes`,
      lista.length >= 2 && lista.every((n) => /^[A-Z][A-Z0-9_]*$/.test(n)),
      lista.join(', '),
    );
    caso(
      'as DUAS credenciais de armazenamento estao na lista real (o motivo deste portao)',
      AS_DUAS_DO_ARMAZENAMENTO.every((n) => lista.includes(n)),
    );
    const condicional = extrairCondicionalDaFonte(textoDaLista);
    caso(
      `a regra condicional e lida da fonte, nao copiada: ${condicional}`,
      lista.includes(condicional),
    );
    caso(
      'sem `postmark`, a lista desta subida perde o condicional, e so ele',
      listaDesteBoot(lista, condicional, TRANSPORTE_PADRAO).length === lista.length - 1 &&
        !listaDesteBoot(lista, condicional, TRANSPORTE_PADRAO).includes(condicional),
    );
    caso(
      'com `postmark`, a lista desta subida e a lista inteira',
      listaDesteBoot(lista, condicional, TRANSPORTE_COM_TOKEN).length === lista.length,
    );

    const { raiz, canonico } = extrairEnderecoDoAdaptador(textoDoAdaptador);
    caso(
      'a raiz do gerenciador deste portao e a MESMA do adaptador',
      raiz === GERENCIADOR,
      `fonte "${raiz}" vs portao "${GERENCIADOR}"`,
    );
    caso(
      'o ENDERECO deste portao e o MESMO que o adaptador monta',
      canonico === enderecoCanonicoDoPortao(),
      `fonte "${canonico}" vs portao "${enderecoCanonicoDoPortao()}"`,
    );
  }

  // Iscas de fonte ESTRAGADA: cada leitura precisa REPROVAR, nao seguir calada.
  const lancou = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  caso(
    'ISCA: constante renomeada em segredos.ts REPROVA a leitura da lista',
    lancou(() => extrairListaDeRuntime("export const OUTRA_COISA = ['A_B'];")),
  );
  caso(
    'ISCA: lista VAZIA em segredos.ts REPROVA',
    lancou(() => extrairListaDeRuntime('export const SEGREDOS_DE_RUNTIME = [];')),
  );
  caso(
    'ISCA: comentario com texto em CAIXA ALTA entre aspas nao virou nome',
    extrairListaDeRuntime(
      "export const SEGREDOS_DE_RUNTIME = [\n /** assina 'GOOG4' */\n 'DATABASE_URL',\n];",
    ).join(',') === 'DATABASE_URL',
  );
  caso(
    'ISCA: `segredosDeRuntime` sem o filtro por transporte REPROVA',
    lancou(() =>
      extrairCondicionalDaFonte(
        'export function segredosDeRuntime(a, b) {\n  return declarados;\n}',
      ),
    ),
  );
  caso(
    'ISCA: `GERENCIADOR` fora do adaptador REPROVA',
    lancou(() => extrairEnderecoDoAdaptador('const alvo = `${GERENCIADOR}/x`;')),
  );
  caso(
    'ISCA: adaptador sem `const alvo` REPROVA',
    lancou(() => extrairEnderecoDoAdaptador("const GERENCIADOR = 'https://x';")),
  );
  caso(
    'ISCA: adaptador lendo OUTRO caminho e detectado (o portao mediria outro lugar)',
    extrairEnderecoDoAdaptador(
      "const GERENCIADOR = 'https://x';\nconst alvo = `${GERENCIADOR}/projects/${config.projeto}/secrets/${nome}:access`;",
    ).canonico !== enderecoCanonicoDoPortao(),
  );

  // -- A TROCA ESTA LIGADA? ------------------------------------------------
  caso(
    '`NODE_ENV=production` liga a troca',
    trocaEstaLigada(new Map([['NODE_ENV', 'production']])),
  );
  caso('`ENVIRONMENT=prod` liga a troca', trocaEstaLigada(new Map([['ENVIRONMENT', 'prod']])));
  caso(
    '`ENVIRONMENT=preprod` liga a troca',
    trocaEstaLigada(new Map([['ENVIRONMENT', 'preprod']])),
  );
  caso(
    '`ENVIRONMENT=dev` NAO liga a troca (nao ha o que conferir)',
    !trocaEstaLigada(new Map([['ENVIRONMENT', 'dev']])),
  );
  caso('`.env` vazio NAO liga a troca', !trocaEstaLigada(new Map()));

  // -- A LEITURA HTTP, sem rede -------------------------------------------
  const respostaFalsa = (status, corpo) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corpo),
  });
  const comoBase64 = (v) => ({ payload: { data: Buffer.from(v, 'utf8').toString('base64') } });

  const lido = await lerDoGerenciador(['UM'], {
    raiz: GERENCIADOR,
    projeto: 'p',
    versao: 'latest',
    token: 't',
    buscar: (alvo) => {
      if (alvo !== enderecoDoSegredo(GERENCIADOR, 'p', 'latest', 'UM')) {
        return Promise.resolve(respostaFalsa(404, {}));
      }
      return Promise.resolve(respostaFalsa(200, comoBase64('valor-do-gerenciador')));
    },
  });
  caso(
    'a leitura decodifica base64 e bate o endereco exato',
    lido.get('UM')?.valor === 'valor-do-gerenciador',
  );
  for (const [nome, status] of [
    ['403 (nao existe, ou IAM) vira erro POR NOME', 403],
    ['404 (versao ausente ou desabilitada) vira erro POR NOME', 404],
    ['401 (token recusado) vira erro POR NOME', 401],
  ]) {
    const r = await lerDoGerenciador(['UM'], {
      raiz: GERENCIADOR,
      projeto: 'p',
      versao: 'latest',
      token: 't',
      buscar: () => Promise.resolve(respostaFalsa(status, {})),
    });
    caso(nome, r.get('UM')?.erro?.includes(String(status)) === true);
  }
  const vazio = await lerDoGerenciador(['UM'], {
    raiz: GERENCIADOR,
    projeto: 'p',
    versao: 'latest',
    token: 't',
    buscar: () => Promise.resolve(respostaFalsa(200, comoBase64(''))),
  });
  caso(
    'versao VAZIA nao passa por valor: vira erro, nao string vazia',
    vazio.get('UM')?.valor === undefined && vazio.get('UM')?.erro?.includes('VAZIA') === true,
  );
  const semPayload = await lerDoGerenciador(['UM'], {
    raiz: GERENCIADOR,
    projeto: 'p',
    versao: 'latest',
    token: 't',
    buscar: () => Promise.resolve(respostaFalsa(200, { outra: 'coisa' })),
  });
  caso('200 sem `payload.data` vira erro', semPayload.get('UM')?.erro !== undefined);
  const explodiu = await lerDoGerenciador(['UM'], {
    raiz: GERENCIADOR,
    projeto: 'p',
    versao: 'latest',
    token: 't',
    buscar: () => Promise.reject(new Error('rede caiu')),
  });
  caso(
    'rede caida vira erro POR NOME, e nao excecao que apaga a tabela',
    explodiu.get('UM')?.erro?.includes('rede caiu') === true,
  );
  const doisNomes = await lerDoGerenciador(['UM', 'DOIS'], {
    raiz: GERENCIADOR,
    projeto: 'p',
    versao: 'latest',
    token: 't',
    buscar: (alvo) =>
      Promise.resolve(
        alvo.includes('/UM/')
          ? respostaFalsa(403, {})
          : respostaFalsa(200, comoBase64('o-dois-veio')),
      ),
  });
  caso(
    'um nome recusado nao impede os outros de serem lidos',
    doisNomes.get('UM')?.erro !== undefined && doisNomes.get('DOIS')?.valor === 'o-dois-veio',
  );

  // -- DE PONTA A PONTA, com o script RODANDO de verdade -------------------
  //
  // Tudo acima exercita as funcoes. Isto exercita o PROGRAMA: argumento,
  // leitura do `.env`, ancoragem em src/, impressao e CODIGO DE SAIDA. O exit e
  // lido do resultado do processo filho, e nao de um pipe -- `| tail` devolve o
  // `$?` do tail, e execucao morta vira exit 0.
  //
  // As iscas sao GERADAS, e nao versionadas em `iscas/`: `.env` e `.env.*` estao
  // no `.gitignore` sem excecao, e um arquivo de isca com nome de `.env`
  // simplesmente nao entraria no commit.
  const esteArquivo = fileURLToPath(import.meta.url);
  const pasta = mkdtempSync(join(tmpdir(), 'isca-segredos-'));
  const listaReal =
    textoDaLista === undefined
      ? []
      : listaDesteBoot(
          extrairListaDeRuntime(textoDaLista),
          extrairCondicionalDaFonte(textoDaLista),
          TRANSPORTE_PADRAO,
        );

  /** Um valor distinto por nome, para que trocar um nome mude uma digital so. */
  const valorDeIsca = (nome) => `valor-de-isca-${nome.toLowerCase()}`;

  const escrever = (arquivo, conteudo) => {
    const caminho = join(pasta, arquivo);
    writeFileSync(caminho, conteudo, 'utf8');
    return caminho;
  };

  const rodar = (args) => {
    const r = spawnSync(process.execPath, [esteArquivo, ...args], { encoding: 'utf8' });
    return { codigo: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };

  const envDeProd = [
    'ENVIRONMENT=prod',
    'SECRET_STORE_PROJECT=projeto-de-isca',
    `MAIL_TRANSPORT=${TRANSPORTE_PADRAO}`,
    ...listaReal.map((n) => `${n}=${valorDeIsca(n)}`),
  ].join('\n');

  try {
    const envIgual = escrever('env-igual', envDeProd);
    const iscaIgual = escrever(
      'gerenciador-igual.json',
      JSON.stringify(Object.fromEntries(listaReal.map((n) => [n, valorDeIsca(n)]))),
    );

    const aprovou = rodar(['--env', envIgual, '--isca-do-gerenciador', iscaIgual]);
    caso(
      `E2E ISCA POSITIVA: os ${String(listaReal.length)} valores iguais -> exit 0 e APROVADO`,
      aprovou.codigo === SAIDA.APROVADO && aprovou.saida.includes('APROVADO:'),
      `exit ${String(aprovou.codigo)}; saida: ${aprovou.saida.trim().split('\n').slice(-2).join(' / ')}`,
    );
    caso(
      '  e nenhum dos valores de isca apareceu na saida do aprovado',
      listaReal.every((n) => !aprovou.saida.includes(valorDeIsca(n))),
    );

    // A DIVERGENCIA PLANTADA: a chave do MinIO no gerenciador, como em 29/09.
    const trocado = Object.fromEntries(listaReal.map((n) => [n, valorDeIsca(n)]));
    trocado['OBJECT_STORAGE_ACCESS_KEY_ID'] = 'chave-do-minio-de-29-09';
    const iscaTrocada = escrever('gerenciador-trocado.json', JSON.stringify(trocado));

    const reprovou = rodar(['--env', envIgual, '--isca-do-gerenciador', iscaTrocada]);
    caso(
      'E2E ISCA NEGATIVA: divergencia plantada -> exit 1',
      reprovou.codigo === SAIDA.REPROVADO,
      `exit ${String(reprovou.codigo)}`,
    );
    // O bloco por nome, com a forma exata que `imprimirResultado` imprime: ele
    // e o controle POSITIVO do zero da linha seguinte -- sem ele, "nao nomeia o
    // outro" passaria tambem num portao que nao nomeia ninguem.
    const bloco = (nome) => reprovou.saida.includes(`    ${nome}\n      no `);
    caso(
      '  e a saida NOMEIA OBJECT_STORAGE_ACCESS_KEY_ID como divergente',
      bloco('OBJECT_STORAGE_ACCESS_KEY_ID'),
    );
    caso(
      '  e NAO nomeia nenhum outro (a isca e cirurgica, e o zero tem controle acima)',
      listaReal.filter((n) => bloco(n)).join(',') === 'OBJECT_STORAGE_ACCESS_KEY_ID' &&
        reprovou.saida.includes('1 segredo(s) divergem'),
      `nomeados: ${listaReal.filter((n) => bloco(n)).join(',') || '(nenhum)'}`,
    );
    caso(
      '  e nenhum valor -- nem o do .env, nem o do "gerenciador" -- foi impresso',
      !reprovou.saida.includes('chave-do-minio-de-29-09') &&
        listaReal.every((n) => !reprovou.saida.includes(valorDeIsca(n))),
    );
    caso(
      '  e a saida diz COMO consertar (versao nova, nao editar o .env)',
      reprovou.saida.includes('VERSAO NOVA'),
    );

    // A ISCA NAO PODE APROVAR SUBIDA: recusada junto com `--exigir`.
    const comExigir = rodar([
      '--env',
      envIgual,
      '--isca-do-gerenciador',
      iscaIgual,
      '--exigir',
    ]);
    caso(
      'E2E: `--isca-do-gerenciador` com `--exigir` REPROVA (a isca nao aprova subida)',
      comExigir.codigo === SAIDA.REPROVADO && comExigir.saida.includes('nao existe'),
      `exit ${String(comExigir.codigo)}`,
    );

    // SEM NUVEM: inconclusivo sem `--exigir`, reprovado com ele. Nenhum dos
    // dois usa rede: o `.env` apontado nao existe, e isso decide antes.
    const envAusente = join(pasta, 'nao-existe');
    const semEnv = rodar(['--env', envAusente]);
    caso(
      'E2E: fonte ausente SEM `--exigir` -> exit 2 INCONCLUSIVO, nunca 0',
      semEnv.codigo === SAIDA.INCONCLUSIVO && semEnv.saida.includes('NAO CONFERIDO'),
      `exit ${String(semEnv.codigo)}`,
    );
    caso(
      '  e o inconclusivo NOMEIA cada variavel que ficou sem conferir',
      listaReal.every((n) => semEnv.saida.includes(n)),
    );
    const semEnvExigindo = rodar(['--env', envAusente, '--exigir']);
    caso(
      'E2E: a MESMA ausencia COM `--exigir` -> exit 1 REPROVA',
      semEnvExigindo.codigo === SAIDA.REPROVADO && semEnvExigindo.saida.includes('REPROVA'),
      `exit ${String(semEnvExigindo.codigo)}`,
    );

    // Subida que nao liga a troca: nao ha o que conferir, e nao e aprovacao.
    const envDeDev = escrever('env-dev', 'ENVIRONMENT=dev\nDATABASE_URL=qualquer\n');
    const dev = rodar(['--env', envDeDev]);
    caso(
      'E2E: `.env` que nao liga a troca -> exit 2, e nao 0',
      dev.codigo === SAIDA.INCONCLUSIVO && dev.saida.includes('nao liga a troca'),
      `exit ${String(dev.codigo)}`,
    );

    // Um `.env` de prod sem o projeto: nao sabe ONDE conferir.
    const envSemProjeto = escrever(
      'env-sem-projeto',
      envDeProd.replace('SECRET_STORE_PROJECT=projeto-de-isca', 'SECRET_STORE_PROJECT='),
    );
    const semProjeto = rodar(['--env', envSemProjeto]);
    caso(
      'E2E: prod sem SECRET_STORE_PROJECT -> exit 2 nomeando o que faltou conferir',
      semProjeto.codigo === SAIDA.INCONCLUSIVO && semProjeto.saida.includes('SECRET_STORE_PROJECT'),
      `exit ${String(semProjeto.codigo)}`,
    );
    const semProjetoExigindo = rodar(['--env', envSemProjeto, '--exigir']);
    caso(
      '  e COM `--exigir` isso REPROVA: e o .env que perdeu a chave',
      semProjetoExigindo.codigo === SAIDA.REPROVADO,
      `exit ${String(semProjetoExigindo.codigo)}`,
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }

  if (ruim > 0) {
    console.error(
      `\nautoteste REPROVADO: ${String(ruim)} caso(s) nao se comportaram como a regra manda`,
    );
    process.exit(1);
  }
  console.log(
    '\nautoteste APROVADO: igual aprova, divergencia plantada reprova NOMEANDO a variavel, ' +
      'nenhum valor e impresso, comparar zero nao aprova, e as tres leituras de src/ reprovam ' +
      'quando a fonte muda de forma.',
  );
}

// ---------------------------------------------------------------------------
// PRINCIPAL
// ---------------------------------------------------------------------------

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : padrao;
}

async function principal() {
  const exigir = process.argv.includes('--exigir');
  const caminhoDoEnv = argumento('--env', join(RAIZ, '.env'));

  // 1. As fontes de `src/`. Portao que nao consegue ler a regra nao aprova.
  let lista;
  let condicional;
  let endereco;
  try {
    const textoDaLista = readFileSync(join(RAIZ, FONTE_DA_LISTA), 'utf8');
    const textoDoAdaptador = readFileSync(join(RAIZ, FONTE_DO_ADAPTADOR), 'utf8');
    lista = extrairListaDeRuntime(textoDaLista);
    condicional = extrairCondicionalDaFonte(textoDaLista);
    endereco = extrairEnderecoDoAdaptador(textoDoAdaptador);
  } catch (erro) {
    console.error(`REPROVA: ${erro.message}.`);
    console.error('  Este portao deriva a regra de src/ de proposito, para nao aprovar depois');
    console.error('  de a regra mudar de lugar. Sem conseguir ler, ele nao confere nada.');
    process.exit(SAIDA.REPROVADO);
  }

  // 2. Os dois controles positivos do endereco.
  if (endereco.raiz !== GERENCIADOR || endereco.canonico !== enderecoCanonicoDoPortao()) {
    console.error('REPROVA: este portao e o adaptador do boot NAO leem o mesmo lugar.');
    console.error(`  raiz no adaptador: ${endereco.raiz}`);
    console.error(`  raiz neste portao: ${GERENCIADOR}`);
    console.error(`  endereco no adaptador: ${endereco.canonico}`);
    console.error(`  endereco neste portao: ${enderecoCanonicoDoPortao()}`);
    console.error('  Sem isto, o portao compararia o .env com um lugar que o boot nao le, e');
    console.error('  aprovaria para sempre. Atualize este arquivo junto com o adaptador.');
    process.exit(SAIDA.REPROVADO);
  }

  // 3. A unica coisa que ele afirma por conta propria.
  const ausentes = AS_DUAS_DO_ARMAZENAMENTO.filter((n) => !lista.includes(n));
  if (ausentes.length > 0) {
    console.error(
      `REPROVA: ${ausentes.join(' e ')} nao esta mais em SEGREDOS_DE_RUNTIME (${FONTE_DA_LISTA}).`,
    );
    console.error('  Sao as duas credenciais que custaram seis rodadas de diagnostico, e este');
    console.error('  portao existe por causa delas. Se sairam da lista DE PROPOSITO, este');
    console.error('  arquivo precisa ser reescrito -- nao basta remover a conferencia.');
    process.exit(SAIDA.REPROVADO);
  }

  // 4. O `.env`.
  if (!existsSync(caminhoDoEnv)) {
    imprimirInconclusivo(
      `nao existe ${caminhoDoEnv}, que e a metade declarada da comparacao`,
      lista,
      exigir,
      [
        'Worktree novo nao tem `.env` (o `rodar.mjs` gera o dele com valores falsos).',
        'Para conferir uma subida: --env <caminho do .env que o env_file entrega>.',
      ],
    );
  }
  const { valores, comAspas } = parsearEnv(readFileSync(caminhoDoEnv, 'utf8'));

  // 5. A troca esta ligada nesta subida?
  if (!exigir && !trocaEstaLigada(valores)) {
    imprimirInconclusivo(
      `${caminhoDoEnv} nao liga a troca de segredos (sem NODE_ENV=production e sem ENVIRONMENT em prod/preprod)`,
      [],
      false,
      [
        'Nesta configuracao `resolverSegredos` nunca consulta o gerenciador: nao ha',
        'divergencia possivel, e tambem nao ha nada conferido. A subida hospedada passa',
        '`--exigir`, e ai esta mesma ausencia REPROVA -- e o .env que perdeu a chave.',
      ],
    );
  }

  const projeto = argumento(
    '--projeto',
    valores.get('SECRET_STORE_PROJECT') ?? process.env['SECRET_STORE_PROJECT'] ?? '',
  );
  const versao = argumento(
    '--versao',
    valores.get('SECRET_STORE_VERSION') || process.env['SECRET_STORE_VERSION'] || VERSAO_PADRAO,
  );
  if (projeto === '') {
    imprimirInconclusivo(
      `nao sei QUAL projeto conferir: ${caminhoDoEnv} nao declara SECRET_STORE_PROJECT`,
      lista,
      exigir,
      ['Passe --projeto <projeto>, ou declare SECRET_STORE_PROJECT no .env conferido.'],
    );
  }

  // 6. A lista DESTA subida, pela mesma regra de `segredosDeRuntime`.
  const transporte = valores.get('MAIL_TRANSPORT')?.trim() || TRANSPORTE_PADRAO;
  const nomes = listaDesteBoot(lista, condicional, transporte);

  // 6.5. A ISCA INJETAVEL, e por que ela nao e uma porta dos fundos.
  //
  // Sem ela, a UNICA prova de ponta a ponta deste portao exigiria o Secret
  // Manager de verdade, e uma regra provada so por dentro e meia regra: o que
  // ninguem mede e justamente a fiacao -- argumento, leitura do `.env`, codigo
  // de saida, e se algum valor escapou para a saida.
  //
  // O risco obvio e alguem usar isto para fazer uma subida ficar verde. E por
  // isso que ela e RECUSADA junto com `--exigir`, que e exatamente o modo da
  // subida: nos dois modos em que o resultado vale, a isca nao entra. E ela
  // grita na saida, para que nenhum log de isca seja lido como conferencia.
  const caminhoDaIsca = argumento('--isca-do-gerenciador', undefined);
  if (caminhoDaIsca !== undefined && exigir) {
    console.error('REPROVA: `--isca-do-gerenciador` com `--exigir` nao existe.');
    console.error('  `--exigir` e o modo da subida, e nele a medicao tem de ser do gerenciador');
    console.error('  de verdade. Isca serve para provar o portao, nunca para aprovar uma subida.');
    process.exit(SAIDA.REPROVADO);
  }

  if (caminhoDaIsca !== undefined) {
    console.log('ATENCAO: MEDICAO DE ISCA. O gerenciador NAO foi consultado.');
    console.log(`  as respostas vieram de ${caminhoDaIsca}, e este resultado nao confere subida nenhuma.`);
    const bruto = JSON.parse(readFileSync(caminhoDaIsca, 'utf8'));
    const daIsca = new Map(
      Object.entries(bruto).map(([nome, v]) =>
        typeof v === 'string' ? [nome, { valor: v }] : [nome, v],
      ),
    );
    const resultadoDaIsca = comparar(nomes, valores, daIsca);
    const digitaisDaIsca = new Map();
    for (const nome of resultadoDaIsca.iguais) digitaisDaIsca.set(nome, digital(valores.get(nome)));
    process.exit(
      imprimirResultado(resultadoDaIsca, {
        env: caminhoDoEnv,
        projeto: 'isca',
        versao: 'isca',
        digitais: digitaisDaIsca,
      }),
    );
  }

  // 7. A credencial. Metadados da VM primeiro; depois a de quem roda a mao.
  const token = (await tokenDoMetadados(fetch)) ?? tokenDoGcloud();
  if (token === undefined) {
    imprimirInconclusivo(
      'nenhuma credencial do GCP ao alcance (sem servidor de metadados e sem `gcloud auth print-access-token`)',
      nomes,
      exigir,
      [
        'Na VM a credencial e a conta de servico da instancia, e o boot usa a MESMA.',
        'Fora dela: `gcloud config configurations activate bichu` e',
        '`gcloud auth login --no-launch-browser` (o Docker rouba a porta 8085).',
        'Nao ter acesso a nuvem NAO e defeito de quem rodou -- e por isso isto sai 2,',
        'e nao 1. O que nao pode e sair 0.',
      ],
    );
  }

  // 8. A medicao.
  const doGerenciador = await lerDoGerenciador(nomes, {
    raiz: GERENCIADOR,
    projeto,
    versao,
    token,
    buscar: fetch,
  });
  const resultado = comparar(nomes, valores, doGerenciador);

  const digitais = new Map();
  for (const nome of resultado.iguais) digitais.set(nome, digital(valores.get(nome)));

  console.log(
    `conferindo ${String(nomes.length)} segredo(s) de runtime: ${caminhoDoEnv} vs projeto ` +
      `${projeto}, versao ${versao} (transporte de e-mail: ${transporte}).`,
  );
  if (comAspas.size > 0) {
    const relevantes = [...comAspas].filter((n) => nomes.includes(n));
    if (relevantes.length > 0) {
      console.log(
        `  nota: aspas das pontas removidas de ${relevantes.join(', ')}, como o env_file faz.`,
      );
    }
  }

  process.exit(imprimirResultado(resultado, { env: caminhoDoEnv, projeto, versao, digitais }));
}

if (process.argv.includes('--autoteste')) await autoteste();
else await principal();
