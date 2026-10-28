/**
 * O ENDERECO DE ENTREGA GUARDADO NA CONTA NAO SAI EM SUPERFICIE PUBLICA, NAO
 * APARECE EM LISTA E NAO E LIDO POR OUTRA CONTA — medido no CONTRATO e na
 * CONSULTA.
 *
 * ## A decisao que este arquivo protege
 *
 * O cliente autorizou a tabela em **21/10/2026**: *"um endereco de entrega
 * salvo na conta, reusado em todo pedido e editavel num lugar so"*. O que ele
 * autorizou foi o endereco GUARDADO, e não uma superfície nova de dado pessoal.
 *
 * **Isto é a RESIDÊNCIA do usuário, e é a mais estreita das três posturas de
 * endereço deste produto:**
 *
 *   1. **profissional** — comercial e **público** (ADR-0011 seção 4);
 *   2. **encontro** — lugar público, mas o LOGRADOURO fica atrás de conta
 *      (ADR-0027 item 21.2: só em `getNetworkEventLocation`, com `bearerAuth`,
 *      e *"nunca na agenda, no detalhe público, no teaser nem nos detalhes do
 *      privado"*);
 *   3. **usuário** — este — **só o dono lê. Nunca projeção pública, nunca
 *      cálculo de distância, nunca lista.**
 *
 * ## Por que a regra é medida assim, e não exercitando a rota do dono
 *
 * A regra é de OMISSÃO, e omissão não se mede chamando a única superfície que
 * DEVE mostrar o campo: um caso que chamasse `getMyDeliveryAddress` e achasse a
 * rua passaria igual num mundo em que a rua também sai em `getPublicPetBySlug`.
 * O que se mede é o complemento — **as 32 operações alcançáveis sem conta** — e
 * prova-se que nenhuma delas projeta nenhum dos nove campos.
 *
 * Mesma forma e mesmo motivo de `foto-de-pessoa-nao-sai-em-publico.test.ts`,
 * que é o vizinho deste arquivo e o precedente dele.
 *
 * ## O CONTROLE POSITIVO É OBRIGATÓRIO, e ele é a metade que falta na maioria
 *
 * Uma varredura que não acha nada e uma varredura cega saem com a mesma cor.
 * Por isso o caminhador deste arquivo é apontado, no mesmo grupo, para
 * `getMyDeliveryAddress` — onde os nove campos TÊM de aparecer. **Se o controle
 * positivo não achar os nove, o arquivo reprova**, porque um caminhador que não
 * enxerga o campo onde ele está aprovaria qualquer coisa.
 *
 * É a regra do ADR-0027 item 12.12, que escreveu isso por extenso para o teaser
 * do encontro privado, e vale igual aqui.
 *
 * ## ONDE ESTE PORTÃO CORTA, dito por extenso porque já custou caro
 *
 * Hoje, 21/10/2026, um portão deste projeto cortou uma consulta SQL no lugar
 * errado e ficou **cego para tudo depois do corte**, aprovando coluna proibida.
 * Então os dois cortes deste arquivo são declarados, e **cada um tem um caso
 * que reprova quando o corte vira cego**:
 *
 * 1. **No contrato, o corte é por OPERAÇÃO**, e não por texto do YAML. O
 *    caminhador resolve `$ref` e desce em `allOf`/`oneOf`/`anyOf`/`items`/
 *    `properties`, com controle de ciclo. Ele não lê o arquivo como string e
 *    não tem "depois do corte" — a prova de que ele não é cego é o controle
 *    positivo, e a prova de que ele não é vazio é a contagem de operações
 *    públicas (`assert.ok(publicas.length >= 30)`).
 * 2. **Na consulta, o corte é por SENTENÇA `await this.db`**, e o caso
 *    `o corte da consulta é onde eu digo que é` CONTA as fatias e exige que
 *    cada uma mencione a tabela. Duas fatias, duas menções: se alguém
 *    acrescentar um terceiro acesso ao banco, a contagem muda e o portão
 *    reprova em vez de ignorar o acesso novo — que é exatamente o modo de
 *    falhar do corte cego.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';
const CAMINHO_DO_REPOSITORIO =
  'src/modules/tags/adapters/persistence/kysely-endereco-guardado.ts';
const CAMINHO_DA_PORTA = 'src/modules/tags/ports/endereco-guardado.ts';
const CAMINHO_DAS_ROTAS = 'src/modules/tags/adapters/http/endereco-guardado-routes.ts';

/** A tabela do endereço guardado. Uma constante porque o portão 2 a procura. */
const TABELA = 'user_delivery_addresses';

/**
 * Os NOVE campos do endereço, pelos nomes que o contrato usa. Lista FECHADA.
 *
 * Um décimo campo de endereço é superfície nova de dado pessoal e precisa de
 * decisão do cliente — e é aqui que ela aparece, porque o caso
 * `a lista dos nove campos é a de `DeliveryAddress`` compara esta lista com as
 * propriedades do schema e reprova quando elas divergem. Sem esse caso, um
 * campo novo em `DeliveryAddress` nasceria **fora** da varredura e vazaria sem
 * nada ficar vermelho.
 */
const CAMPOS_DO_ENDERECO = [
  'city',
  'complement',
  'neighborhood',
  'postal_code',
  'recipient_name',
  'recipient_phone',
  'state',
  'street',
  'street_number',
] as const;

interface Spec {
  readonly paths: Record<string, Record<string, OperacaoBruta>>;
  readonly components: {
    readonly schemas: Record<string, unknown>;
    readonly responses?: Record<string, unknown>;
    readonly requestBodies?: Record<string, unknown>;
    readonly parameters?: Record<string, unknown>;
    readonly headers?: Record<string, unknown>;
    readonly examples?: Record<string, unknown>;
  };
}

interface OperacaoBruta {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
  readonly responses?: Record<string, unknown>;
}

const textoDaSpec = readFileSync(CAMINHO_DA_SPEC, 'utf8');
const spec = parseYaml(textoDaSpec) as Spec;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Resolve um `$ref` interno pela SEÇÃO que ele nomeia.
 *
 * As quatro seções estão aqui porque o contrato usa as quatro, e a primeira
 * versão deste arquivo só sabia seguir `schemas` — o resultado foi o portão
 * reprovando em `#/components/responses/Unauthorized` na primeira execução.
 * **Essa reprovação é o comportamento certo**: um `$ref` que o caminhador não
 * sabe seguir é um ramo do contrato que ele não visita, e um ramo não visitado
 * é onde o endereço vaza em silêncio. Por isso a forma desconhecida continua
 * reprovando em vez de ser ignorada.
 */
function resolver(ref: string): unknown {
  const secoes: Record<string, Record<string, unknown> | undefined> = {
    schemas: spec.components.schemas,
    responses: spec.components.responses,
    requestBodies: spec.components.requestBodies,
    parameters: spec.components.parameters,
    // `headers` entrou depois, e foi a travessia da lista que o encontrou:
    // `#/components/headers/ETag` pende de uma resposta, e o caminhador chega
    // nele descendo por todos os valores do nó. Não carrega schema de endereço,
    // mas precisa ser RESOLVÍVEL -- seção desconhecida reprova de propósito, e
    // reprovar por um `ETag` esconderia o defeito que o caso procura.
    headers: spec.components.headers,
    examples: spec.components.examples,
  };
  const casado = /^#\/components\/([a-zA-Z]+)\/(.+)$/u.exec(ref);
  assert.ok(
    casado !== null,
    `\`$ref\` que este caminhador não sabe seguir: ${ref}. Enquanto ele não ` +
      `souber, há um ramo do contrato que ele não visita — e um ramo não ` +
      `visitado é onde o endereço vaza em silêncio.`,
  );
  const secao = secoes[casado[1] ?? ''];
  assert.ok(
    secao !== undefined,
    `\`$ref\` para a seção \`${casado[1]}\`, que este caminhador não conhece: ` +
      `${ref}. Ver acima: ramo não visitado é vazamento silencioso.`,
  );
  return secao[casado[2] ?? ''];
}

/**
 * Todo nome de propriedade alcançável a partir de um nó do contrato.
 *
 * Desce em `properties`, `items`, `allOf`, `oneOf`, `anyOf` e
 * `additionalProperties`. **Com controle de ciclo** (`vistos`), porque o
 * contrato tem schemas que se referenciam e um caminhador ingênuo estouraria a
 * pilha — e um caminhador que estoura é um caso que ninguém roda.
 */
function propriedadesAlcancaveis(no: unknown, vistos: Set<string> = new Set()): Set<string> {
  const achadas = new Set<string>();
  const descer = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      for (const item of valor) descer(item);
      return;
    }
    if (!ehObjeto(valor)) return;

    const ref = valor['$ref'];
    if (typeof ref === 'string') {
      if (vistos.has(ref)) return;
      vistos.add(ref);
      descer(resolver(ref));
      return;
    }

    const propriedades = valor['properties'];
    if (ehObjeto(propriedades)) {
      for (const [nome, sub] of Object.entries(propriedades)) {
        achadas.add(nome);
        descer(sub);
      }
    }
    for (const chave of ['items', 'additionalProperties', 'allOf', 'oneOf', 'anyOf'] as const) {
      if (valor[chave] !== undefined) descer(valor[chave]);
    }
    // `responses`, `requestBody` e `content` não são schema, mas é por dentro
    // deles que se chega ao schema de uma operação. **`requestBody` entrou
    // depois**: sem ele o caminhador não achava `requestCollarTag`, que alcança
    // o endereço pelo CORPO — e o caso dos hospedeiros reprovou dizendo isso.
    for (const chave of ['responses', 'requestBody', 'content', 'schema'] as const) {
      if (valor[chave] !== undefined) descer(valor[chave]);
    }
    for (const [chave, sub] of Object.entries(valor)) {
      if (/^\d{3}$/u.test(chave) || chave === 'application/json') descer(sub);
    }
  };
  descer(no);
  return achadas;
}

/**
 * OS DOIS CAMPOS QUE DISTINGUEM A RESIDÊNCIA DE UM ENDEREÇO PÚBLICO.
 *
 * `city`, `state` e `neighborhood` são conteúdo LEGÍTIMO de superfície pública
 * noutros contextos — o profissional aceitou aparecer para ser contratado
 * (ADR-0011 §4), o encontro é num lugar público, e a listagem de perdidos diz a
 * cidade. Procurar por eles daria falso positivo em meia dúzia de operações
 * corretas, e um portão que grita onde não há defeito é um portão que alguém
 * desliga.
 *
 * `recipient_name` e `street_number` existem **só** em `DeliveryAddress`. Quem
 * alcança os dois alcança o endereço de entrega, e mais nada do contrato os tem.
 */
const MARCADORES_DA_RESIDENCIA = ['recipient_name', 'street_number'] as const;

/**
 * O endereço é alcançável DE DENTRO de um array, a partir deste nó?
 *
 * ## ESTA FUNÇÃO EXISTE PORQUE A ISCA DERRUBOU A VERSÃO ANTERIOR
 *
 * A primeira versão do caso da lista media `/"items"/` sobre
 * `JSON.stringify(op.responses)`. A isca "`MyDeliveryAddress` vira um array de
 * endereços" **passou**: o JSON cru da resposta carrega só o
 * `$ref: '#/components/schemas/MyDeliveryAddress'`, e o array estava do outro
 * lado do `$ref` — o portão ficou cego exatamente onde devia enxergar.
 *
 * Então a travessia é que decide, e não o texto: desce resolvendo `$ref` e, ao
 * cruzar um `items` ou um `type: array`, pergunta se o endereço está lá dentro.
 */
function enderecoSobArray(no: unknown, vistos: Set<string> = new Set()): boolean {
  if (Array.isArray(no)) return no.some((item) => enderecoSobArray(item, vistos));
  if (!ehObjeto(no)) return false;

  const ref = no['$ref'];
  if (typeof ref === 'string') {
    if (vistos.has(ref)) return false;
    const adiante = new Set(vistos);
    adiante.add(ref);
    return enderecoSobArray(resolver(ref), adiante);
  }

  // ESTE É O NÓ DE ARRAY. Se o endereço mora debaixo dele, é endereço em lista.
  const ehArray = no['type'] === 'array' || no['items'] !== undefined;
  if (ehArray) {
    const dentro = propriedadesAlcancaveis(no, new Set(vistos));
    if (MARCADORES_DA_RESIDENCIA.every((campo) => dentro.has(campo))) return true;
  }

  for (const valor of Object.values(no)) {
    if (enderecoSobArray(valor, vistos)) return true;
  }
  return false;
}

interface Operacao {
  readonly id: string;
  readonly caminho: string;
  readonly metodo: string;
  readonly op: OperacaoBruta;
}

function todasAsOperacoes(): Operacao[] {
  const operacoes: Operacao[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const [metodo, op] of Object.entries(item)) {
      if (!ehObjeto(op) || op['responses'] === undefined) continue;
      const bruta = op as OperacaoBruta;
      operacoes.push({
        id: bruta.operationId ?? `${metodo.toUpperCase()} ${caminho}`,
        caminho,
        metodo,
        op: bruta,
      });
    }
  }
  return operacoes;
}

/**
 * Alcançável SEM conta: `security: []` (ninguém precisa de token) ou uma
 * alternativa vazia na lista (o token é opcional).
 *
 * A alternativa vazia conta como pública, e isso não é rigor decorativo:
 * `resolveTagCode` e `getNetworkEvent` são exatamente assim, e quem chega nelas
 * sem token recebe uma resposta — se o endereço entrasse ali, ele sairia para
 * o estranho que escaneou a plaquinha.
 */
/**
 * A operação alcança o endereço de entrega — pelo CORPO ou pela RESPOSTA?
 *
 * Resolve `$ref`, e é por isso que ela existe: a primeira versão deste arquivo
 * procurava a palavra `DeliveryAddress` no JSON cru da operação, e achou DUAS
 * das oito que o referenciam. As outras seis chegam ao endereço por dentro de
 * `AdminCollarTagRequest` e de `CollarTagRequestInput`, cujo JSON cru só
 * carrega o `$ref` — o nome `DeliveryAddress` não aparece nele. Um portão que
 * mede por texto cru nesta forma é cego para a maioria dos hospedeiros.
 */
function alcancaOEndereco(op: OperacaoBruta): boolean {
  const achadas = propriedadesAlcancaveis(op);
  return MARCADORES_DA_RESIDENCIA.every((campo) => achadas.has(campo));
}

function alcancavelSemConta(op: OperacaoBruta): boolean {
  const seguranca = op.security;
  if (seguranca === undefined) return false;
  return seguranca.length === 0 || seguranca.some((entrada) => Object.keys(entrada).length === 0);
}

void describe('o endereço guardado não sai em superfície pública (contrato)', () => {
  void it('a lista dos nove campos é a de `DeliveryAddress`, e ela é fechada', () => {
    // SEM ESTE CASO o resto do arquivo fica obsoleto em silêncio: um campo novo
    // em `DeliveryAddress` nasceria fora de `CAMPOS_DO_ENDERECO` e nenhuma das
    // varreduras abaixo o procuraria.
    const schema = spec.components.schemas['DeliveryAddress'];
    assert.ok(ehObjeto(schema), '`DeliveryAddress` não existe mais no contrato');
    const propriedades = Object.keys(schema['properties'] as Record<string, unknown>).sort();
    assert.deepEqual(
      propriedades,
      [...CAMPOS_DO_ENDERECO],
      'um campo a mais (ou a menos) em `DeliveryAddress` é superfície nova de ' +
        'dado pessoal, e precisa de decisão do cliente — este caso é onde ela aparece',
    );
  });

  void it('CONTROLE POSITIVO -- o caminhador acha os nove em `getMyDeliveryAddress`', () => {
    // A metade que falta na maioria das varreduras de omissão. Um caminhador
    // que não enxerga o campo onde ele ESTÁ aprovaria qualquer coisa, e sairia
    // verde para sempre.
    const dono = todasAsOperacoes().find((o) => o.id === 'getMyDeliveryAddress');
    assert.ok(dono !== undefined, '`getMyDeliveryAddress` não está no contrato');
    const achadas = propriedadesAlcancaveis(dono.op.responses);
    const faltando = CAMPOS_DO_ENDERECO.filter((campo) => !achadas.has(campo));
    assert.deepEqual(
      faltando,
      [],
      'o caminhador NÃO acha estes campos na resposta do próprio dono, onde eles ' +
        'têm de estar. Ele está cego, e a varredura de omissão abaixo não vale nada',
    );
  });

  void it('ISCA DE VAZAMENTO -- nenhuma operação alcançável SEM CONTA projeta o endereço', () => {
    const publicas = todasAsOperacoes().filter((o) => alcancavelSemConta(o.op));

    // VARREDURA VAZIA REPROVA. Se um dia a classificação de "pública" quebrar
    // (um `security` renomeado, um campo movido), esta lista viraria zero e o
    // caso passaria por não ter olhado para nada — que é indistinguível de
    // "conferi e está limpo".
    assert.ok(
      publicas.length >= 30,
      `só ${publicas.length} operações classificadas como alcançáveis sem conta. ` +
        `Eram 32 em 21/10/2026; uma queda desta ordem quer dizer que a ` +
        `classificação parou de funcionar, e a varredura abaixo está vazia`,
    );

    // **Só as RESPOSTAS**, e a precisão importa: uma operação pública que
    // ACEITASSE um endereço no corpo não estaria vazando endereço nenhum — ela
    // estaria recebendo. O que esta isca persegue é o endereço SAINDO.
    const vazamentos = publicas
      .filter((publica) => {
        const respostas = publica.op.responses;
        if (respostas === undefined) return false;
        const achadas = propriedadesAlcancaveis(respostas);
        return MARCADORES_DA_RESIDENCIA.every((campo) => achadas.has(campo));
      })
      .map((publica) => `${publica.id} (${publica.metodo.toUpperCase()} ${publica.caminho})`);

    assert.deepEqual(
      vazamentos,
      [],
      'uma operação alcançável SEM CONTA projeta o endereço de entrega. Este é ' +
        'o endereço RESIDENCIAL do usuário e ele não é público em nenhuma ' +
        'superfície, para ninguém — nem para o estranho que escaneou a plaquinha',
    );
  });

  void it('o endereço de entrega só é alcançável nas operações onde foi decidido', () => {
    // Lista FECHADA de hospedeiros, medida com `$ref` resolvido. Uma operação
    // nova que alcance o endereço é superfície nova, e ela aparece aqui antes
    // de aparecer em produção.
    const hospedeiros = todasAsOperacoes()
      .filter((operacao) => alcancaOEndereco(operacao.op))
      .map((operacao) => operacao.id)
      .sort();

    assert.deepEqual(
      hospedeiros,
      [
        // As três decisões do painel devolvem `AdminCollarTagRequest`.
        'declineAdminCollarTagRequest',
        'fulfillAdminCollarTagRequest',
        // A fila do painel: a administração precisa do endereço para cumprir.
        'getAdminCollarTagRequest',
        // O endereço guardado NA CONTA, as duas operações do DONO (21/10/2026).
        // **Superadas como fonte do pedido em 27/10/2026** e mantidas porque a
        // decisão dele de 26/10/2026 é *"não apague nada"*.
        'getMyDeliveryAddress',
        // O endereço do PET, as duas operações do TUTOR (27/10/2026).
        //
        // Ele pediu *"o endereço de entrega da plaquinha tem que estar dentro do
        // cadastro do pet"* e, com a frase de 21/10 posta na mesa, nomeada e
        // datada, decidiu **"endereço um por pet"** — então a de 21/10 caiu e
        // estas duas são a fonte do formulário do pedido.
        //
        // **Elas não afrouxam nada deste arquivo**: `security` é
        // `[bearerAuth]` sem alternativa vazia nas duas, a autorização mora num
        // `JOIN` com `pets` comparando `owner_user_id` com o portador do token
        // (404 e nunca 403, ADR-0021), e nenhuma delas aparece em lista — o
        // endereço NÃO está em `Pet`, que é a projeção de `listMyPets`,
        // exatamente por isso. O caso irmão
        // `src/tools/endereco-do-pet-nao-sai-em-publico.test.ts` cobra as duas
        // afirmações com isca.
        'getPetDeliveryAddress',
        // **A LISTA É `.sort()`ada**, e foi ela que reprovou a primeira versão
        // deste acréscimo: os dois nomes novos estavam juntos, no fim do bloco
        // comentado, e a ordem alfabética os separa — `getPetDeliveryAddress`
        // vem antes de `listAdminCollarTagRequests` e `putPetDeliveryAddress`
        // depois de `putMyDeliveryAddress`. O comentário acima fala dos dois.
        'listAdminCollarTagRequests',
        'putMyDeliveryAddress',
        'putPetDeliveryAddress',
        // O CORPO do pedido. A resposta `CollarTagRequest` não traz endereço, e
        // está escrito no schema dela.
        'requestCollarTag',
        'updateAdminCollarTagRequestDelivery',
      ],
      'uma operação nova alcança o endereço de entrega. Se ela for do app ou do ' +
        'site, é vazamento; se for do painel, é decisão de produto — e nos dois ' +
        'casos passa por aqui primeiro',
    );
  });

  void it('ISCA DE VAZAMENTO -- o endereço guardado não aparece em LISTA nenhuma', () => {
    // "Nunca lista" é metade da decisão, e tem um alvo concreto: um
    // `DeliveryAddressPage`, ou um array de endereços pendurado em `Me`, faria
    // a residência da pessoa sair em bloco. A FILA DO PAINEL é a exceção
    // decidida -- ela é uma lista e precisa ser, porque quem atende precisa ver
    // a fila --, e por isso o recorte é "fora de `/admin`".
    //
    // A medida é a TRAVESSIA e não o texto: ver `enderecoSobArray`, e ver por
    // que a versão anterior deste caso era cega.
    const emLista = todasAsOperacoes()
      .filter((operacao) => !operacao.caminho.startsWith('/admin'))
      .filter((operacao) => operacao.op.responses !== undefined)
      .filter((operacao) => enderecoSobArray(operacao.op.responses))
      .map((operacao) => operacao.id);

    assert.deepEqual(
      emLista,
      [],
      'o endereço guardado saiu numa LISTA fora do painel. Uma lista de ' +
        'residências é o pior formato possível deste dado',
    );
  });

  void it('CONTROLE POSITIVO -- a travessia de lista enxerga a lista do painel', () => {
    // Sem este caso, `enderecoSobArray` podendo devolver `false` sempre deixaria
    // o caso acima verde para sempre. A fila do painel É uma lista de endereços
    // -- a única decidida --, então a travessia TEM de achá-la.
    const fila = todasAsOperacoes().find((o) => o.id === 'listAdminCollarTagRequests');
    assert.ok(fila !== undefined, '`listAdminCollarTagRequests` não está no contrato');
    assert.ok(
      enderecoSobArray(fila.op.responses),
      'a travessia NÃO acha o endereço na fila do painel, que é uma lista de ' +
        'endereços por decisão. Ela está cega, e o caso da lista acima não vale nada',
    );
  });

  void it('`/me/delivery-address` não carrega identificador no caminho (ADR-0010 item 6)', () => {
    const item = spec.paths['/me/delivery-address'];
    assert.ok(item !== undefined && ehObjeto(item), 'o caminho do endereço guardado não existe');
    assert.ok(
      !/\{/u.test('/me/delivery-address'),
      'o caminho ganhou parâmetro. O recurso é singular de propósito: a tabela ' +
        'tem `user_id` como chave primária e não tem coluna `id`, e nenhum ' +
        'identificador interno vai para caminho de rota',
    );
    for (const metodo of ['get', 'put'] as const) {
      const op = item[metodo] as OperacaoBruta & { parameters?: unknown[] };
      assert.ok(op !== undefined, `falta o \`${metodo}\` de /me/delivery-address`);
      assert.equal(
        (op.parameters ?? []).length,
        0,
        `\`${metodo}\` ganhou parâmetro. Ver acima: não há identificador a passar`,
      );
    }
  });

  void it('as duas operações do endereço guardado exigem `bearerAuth`, sem alternativa vazia', () => {
    const item = spec.paths['/me/delivery-address'];
    assert.ok(item !== undefined, 'o caminho do endereço guardado não existe');
    for (const metodo of ['get', 'put'] as const) {
      const op: OperacaoBruta | undefined = item[metodo];
      assert.ok(op !== undefined, `falta o \`${metodo}\` de /me/delivery-address`);
      assert.deepEqual(
        op.security,
        [{ bearerAuth: [] }],
        `\`${metodo} /me/delivery-address\` não exige \`bearerAuth\` sem alternativa. ` +
          `Uma alternativa vazia aqui abriria a residência do usuário a quem não tem conta`,
      );
    }
  });

});

void describe('o endereço guardado é lido só pelo dono (consulta e porta)', () => {
  const repositorio = readFileSync(CAMINHO_DO_REPOSITORIO, 'utf8');

  /**
   * AS FATIAS, e é aqui que este portão declara ONDE ELE CORTA.
   *
   * O corte é na sentença `await this.db` — cada acesso ao banco é uma fatia. A
   * primeira posição é descartada (é o cabeçalho do arquivo, que não acessa
   * banco nenhum).
   */
  const fatias = repositorio.split('await this.db').slice(1);

  void it('o corte da consulta é onde eu digo que é, e nenhuma fatia é cega', () => {
    // SEM ESTE CASO o `split` seria o defeito que ele existe para pegar: um
    // corte no lugar errado produz uma fatia vazia, e um portão que varre fatia
    // vazia aprova tudo. Hoje, 21/10/2026, um portão deste projeto cortou uma
    // consulta no lugar errado e ficou cego para tudo depois do corte.
    assert.equal(
      fatias.length,
      2,
      `o portão esperava DUAS fatias (uma por acesso ao banco: \`doChamador\` e ` +
        `\`guardar\`) e achou ${fatias.length}. Um acesso novo ao banco não está ` +
        `sendo conferido por nenhum caso deste arquivo`,
    );
    for (const [indice, fatia] of fatias.entries()) {
      assert.ok(
        fatia.includes(TABELA),
        `a fatia ${indice} não menciona \`${TABELA}\`. O corte está no lugar ` +
          `errado, ou a tabela foi renomeada — e nos dois casos as conferências ` +
          `abaixo estão olhando para o lugar errado`,
      );
    }
  });

  void it('TODO acesso a `user_delivery_addresses` carrega o dono na cláusula `WHERE`', () => {
    for (const [indice, fatia] of fatias.entries()) {
      const temWhereDoDono = /\.where\('user_id', '=', chamador\)/u.test(fatia);
      const temValuesDoDono = /user_id:\s*chamador/u.test(fatia);
      assert.ok(
        temWhereDoDono || temValuesDoDono,
        `ISCA DE VAZAMENTO: a fatia ${indice} toca \`${TABELA}\` sem \`user_id\` ` +
          `do chamador. A autorização deste endereço mora na cláusula \`WHERE\` ` +
          `(ADR-0021), e um \`WHERE\` que falta devolve a residência de outra pessoa`,
      );
    }
  });

  void it('nenhum acesso lê a tabela inteira', () => {
    // **A PRIMEIRA VERSÃO DESTE CASO REPROVOU SOBRE O PRÓPRIO COMENTÁRIO DO
    // REPOSITÓRIO**, que explica por que não há `selectAll()` ali. Um portão
    // que lê código por texto e não descarta comentário mede a PROSA e não o
    // CÓDIGO — e o modo de falhar perigoso é o inverso deste: alguém escreve
    // `// selectAll` num comentário e o portão fica vermelho para sempre, ou
    // escreve o código dentro de um comentário e ele fica verde.
    //
    // Então o texto é limpo antes de medir, e o caso abaixo prova que a limpeza
    // não comeu o código junto.
    const semComentarios = repositorio
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    // CONTROLE POSITIVO DA LIMPEZA: se ela comesse o código, tudo abaixo
    // passaria por não ter sobrado nada para olhar.
    assert.match(
      semComentarios,
      /selectFrom\('user_delivery_addresses'\)/u,
      'a remoção de comentários comeu o código junto: o `selectFrom` da tabela ' +
        'não está mais no texto medido, e as conferências abaixo olham para o vazio',
    );
    assert.match(
      semComentarios,
      /insertInto\('user_delivery_addresses'\)/u,
      'a remoção de comentários comeu o `insertInto`. Ver acima',
    );

    assert.ok(
      !/selectAll\(\)/u.test(semComentarios),
      '`selectAll()` no repositório do endereço guardado: cada coluna futura ' +
        'passaria a atravessar a borda por omissão, e `updated_at` já seria uma delas',
    );
    assert.ok(
      !/\.limit\(|\.offset\(|orderBy/u.test(semComentarios),
      'paginação ou ordenação no repositório do endereço guardado. A leitura ' +
        'devolve no máximo UMA linha, porque `user_id` é a chave primária — ' +
        'paginar aqui só faria sentido para ler o endereço de mais de uma conta',
    );
  });

  void it('a porta não tem assinatura que aceite conta de terceiro', () => {
    const porta = readFileSync(CAMINHO_DA_PORTA, 'utf8');
    // Os dois métodos recebem `chamador`, e não um `UserId` qualquer com outro
    // nome. O nome importa: é ele que faz quem escrever a terceira rota não
    // conseguir passar o id de outra pessoa sem perceber.
    const assinaturas = [...porta.matchAll(/^\s{2}([a-zA-Z]+)\(([^)]*)/gmu)].map((m) => ({
      metodo: m[1] ?? '',
      parametros: (m[2] ?? '').trim(),
    }));
    assert.deepEqual(
      assinaturas.map((a) => a.metodo).sort(),
      ['doChamador', 'guardar'],
      'a porta do endereço guardado ganhou ou perdeu método. Qualquer leitura ' +
        'nova aqui é superfície nova da residência do usuário',
    );
    for (const assinatura of assinaturas) {
      assert.match(
        assinatura.parametros,
        /^chamador: UserId/u,
        `\`${assinatura.metodo}\` não começa por \`chamador: UserId\`. Uma ` +
          `assinatura que aceite a conta de outra pessoa é o caminho por onde ` +
          `a residência de terceiro passa a ser legível`,
      );
    }
  });

  void it('as rotas não leem identificador da requisição', () => {
    const rotas = readFileSync(CAMINHO_DAS_ROTAS, 'utf8');
    assert.ok(
      !/request\.params/u.test(rotas),
      'as rotas do endereço guardado leem `request.params`. O caminho é ' +
        'singular e não tem parâmetro: um id lido dali só poderia vir de outra conta',
    );
    assert.ok(
      !/request\.query/u.test(rotas),
      'as rotas do endereço guardado leem `request.query`. Mesma razão de ' +
        '`request.params` — e um `?user_id=` é a forma mais clássica deste vazamento',
    );
  });
});
