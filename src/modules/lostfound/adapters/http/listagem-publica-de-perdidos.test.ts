/**
 * `GET /v1/public/lost-pets` (`listPublicLostPets`), pela borda HTTP.
 *
 * Três coisas se provam aqui, e as três eram afirmação sem medida antes deste
 * arquivo — a operação estava no contrato e **não tinha rota**:
 *
 * 1. **A listagem mostra pet perdido de verdade**, com foto, bairro e quando
 *    foi visto, e o cartão carrega o `share_token` como chave. O contrapeso é a
 *    lista vazia: recorte sem resultado responde 200 com `total: 0` e `items:
 *    []`, nunca um erro.
 * 2. **Nenhum UUID interno sai.** O dublê da porta é HOSTIL, pela mesma receita
 *    de `leitura-publica-do-caso.test.ts`: ele devolve o e-mail, o telefone, o
 *    endereço e os UUIDs do tutor, do pet e do caso como propriedades a mais, e
 *    planta os mesmos dados dentro do texto livre. A resposta passa por
 *    `shared/http/vazamento-publico.ts`, que reprova por propriedade não
 *    declarada, nome proibido, valor plantado e **qualquer UUID**. É o cenário
 *    de alguém acrescentar `...linha` à projeção um dia.
 * 3. **A rota é alcançável SEM CONTA.** A operação declara `security: []`, e
 *    este arquivo pede sem cabeçalho `Authorization` nenhum. Um 401 aqui seria
 *    a porta pela qual a vizinhança acha o pet, fechada.
 *
 * O que este arquivo NÃO cobre: a consulta SQL. Com dublê no lugar da porta,
 * uma consulta que juntasse `users` ou que esquecesse `conta_habilitada`
 * passaria aqui. Quem cobre é
 * `adapters/persistence/listagem-publica-de-perdidos-sem-id-interno.test.ts`,
 * que lê o SQL compilado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  achadosDeVazamento,
  propriedadesDeclaradas,
  type ValorPlantado,
} from '../../../../shared/http/vazamento-publico.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import type { AbsoluteUrl, Instant } from '../../../../shared/types/brands.js';
import { ListagemPublicaDePerdidosService } from '../../application/listagem-publica-de-perdidos.js';
import type {
  ListagemPublicaDePerdidos,
  PaginaDePerdidos,
  PerdidoPublico,
  RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';
import { registrarRotaDaListagemDePerdidos } from './listagem-publica-de-perdidos-routes.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa';
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';
const CASO_ID = '018f3a2b-0000-7000-8000-0000000000dd';
const TOKEN = 'k3J9-share-token-opaco-0001';

const EMAIL_DO_TUTOR = 'tutor.privado@exemplo.com';
const TELEFONE_DO_TUTOR = '+55 11 98765-4321';
const ENDERECO_DO_TUTOR = 'Rua das Acácias, 120';

const AGORA = 1_792_000_000_000 as Instant;

const PLANTADOS: readonly ValorPlantado[] = [
  { rotulo: 'e-mail do tutor', valor: EMAIL_DO_TUTOR },
  { rotulo: 'telefone do tutor', valor: TELEFONE_DO_TUTOR, porDigitos: true },
  { rotulo: 'endereço do tutor', valor: 'Acácias' },
  { rotulo: 'UUID do tutor', valor: TUTOR },
  { rotulo: 'UUID do pet', valor: PET_ID },
  { rotulo: 'UUID do caso', valor: CASO_ID },
];

/**
 * O perdido legítimo, com os dados sensíveis plantados no texto livre e com as
 * propriedades a mais que uma porta descuidada carregaria. O `as` é o ponto: a
 * interface não admite esses campos, e o dublê os força para provar que a
 * projeção é lista branca e não cópia.
 */
function perdidoHostil(parcial: Partial<PerdidoPublico> = {}): PerdidoPublico {
  const legitimo: PerdidoPublico = {
    shareToken: TOKEN,
    petNome: `Mel ${TELEFONE_DO_TUTOR}`,
    especie: 'dog',
    porte: 'P',
    racaRotulo: `Poodle, fala com ${EMAIL_DO_TUTOR}`,
    corRotulo: 'Caramelo',
    vistoPorUltimoEm: new Date('2026-10-17T18:30:00.000Z'),
    // O selo entrou em 20/10/2026. `false` aqui porque este dublê é o item do
    // conjunto de casos ABERTOS, que é o que a rota devolve sem `case_state`.
    encontradoPelaComunidade: false,
    cidade: 'São Paulo',
    bairro: 'Vila Mariana',
    chaveDaFoto: 'pets/abc/thumb/f00d.webp',
    ...parcial,
  };
  return {
    ...legitimo,
    id: CASO_ID,
    petId: PET_ID,
    ownerUserId: TUTOR,
    owner_user_id: TUTOR,
    email: EMAIL_DO_TUTOR,
    phone: TELEFONE_DO_TUTOR,
    address: ENDERECO_DO_TUTOR,
    lat: -23.56,
    lon: -46.68,
  } as unknown as PerdidoPublico;
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly contrato: Contrato;
  readonly recortes: RecorteDePerdidos[];
  readonly conferirParametros: () => void;
}

function montar(pagina: PaginaDePerdidos): Bancada {
  const recortes: RecorteDePerdidos[] = [];
  const porta: ListagemPublicaDePerdidos = {
    listar: (recorte) => {
      recortes.push(recorte);
      return Promise.resolve(pagina);
    },
  };
  const contrato = carregarContrato('api/openapi.yaml');
  const app = criarServidor({
    problemBaseUrl: 'https://api.exemplo.invalid/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, '/v1');
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotaDaListagemDePerdidos(escopo, {
        listagem: new ListagemPublicaDePerdidosService(
          porta,
          {
            baseDaWeb: 'https://web.exemplo.invalid' as AbsoluteUrl,
            baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
          },
          { now: () => AGORA },
        ),
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, contrato, recortes, conferirParametros };
}

interface Resposta {
  readonly status: number;
  readonly cabecalhos: Record<string, unknown>;
  readonly corpo: Record<string, unknown>;
}

/** **Sem `Authorization`, de propósito**: a operação é pública e deslogada. */
async function pedirSemConta(bancada: Bancada, url: string): Promise<Resposta> {
  const resposta = await bancada.app.inject({ method: 'GET', url });
  return {
    status: resposta.statusCode,
    cabecalhos: resposta.headers,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
  };
}

function declaradas(contrato: Contrato): ReadonlySet<string> {
  const schema = contrato.responseSchema('listPublicLostPets', '200');
  if (schema === undefined) {
    throw new Error('O contrato não declara o corpo 200 de listPublicLostPets.');
  }
  return propriedadesDeclaradas(schema);
}

const URL_DA_LISTA = '/v1/public/lost-pets?city=S%C3%A3o%20Paulo';

void describe('a listagem pública de perdidos mostra pet perdido de verdade', () => {
  void it('devolve 200 SEM CONTA, com o pet, o bairro e quando ele foi visto', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 87 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 1);
    assert.equal(itens[0]?.['area_label'], 'Vila Mariana, São Paulo');
    assert.equal(itens[0]?.['lost_since'], '2026-10-17T18:30:00.000Z');
    assert.equal(itens[0]?.['share_token'], TOKEN);
    assert.equal(
      itens[0]?.['photo_url'],
      'https://midia.exemplo.invalid/pets/abc/thumb/f00d.webp',
    );
    assert.equal(itens[0]?.['share_url'], `https://web.exemplo.invalid/p/${TOKEN}`);
    // `total` alimenta "Mostrando 1 a 20 de 87", e os padrões do contrato
    // (`page: 1`, `limit: 20`) voltam na resposta para a tela não supor.
    assert.equal(resposta.corpo['total'], 87);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
  });

  void it('CONTRAPESO: lista vazia responde 200 com total 0, e não um erro', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(resposta.corpo['items'], []);
    assert.equal(resposta.corpo['total'], 0);
  });

  /**
   * ISCA do contrato: `period` perdeu o `default: 30d` em `api/openapi.yaml`
   * (cliente, 18/10/2026), e é por isso que a ausência chega INDEFINIDA à
   * porta.
   *
   * Este é o caso que mede o Ajv, e não o nosso `??`. O Fastify monta o Ajv com
   * `useDefaults: true`, então enquanto o contrato declarava o `default` era o
   * VALIDADOR quem escrevia `period: '30d'` na query de quem não mandou nada —
   * antes de o manipulador existir. Tirar o `?? JANELA_PADRAO` da aplicação
   * sozinho não teria mudado nada aqui.
   *
   * Reponha `default: 30d` no `period` de `listPublicLostPets` no contrato e
   * este caso reprova pelo nome, porque o esquema de `querystring` sai de lá.
   */
  void it('ISCA: `period` ausente chega INDEFINIDO à porta — janela aberta', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, URL_DA_LISTA);
    const recorte = bancada.recortes[0];
    assert.equal(
      recorte?.janela,
      undefined,
      `a janela deveria chegar indefinida, e chegou \`${String(recorte?.janela)}\`. ` +
        'Se for `30d`, o `default` voltou ao contrato e o Ajv o está injetando.',
    );
    assert.equal(recorte?.cidade, 'São Paulo');
    assert.equal(recorte?.pagina, 1);
    assert.equal(recorte?.limite, 20);
    // O relógio é injetado: a janela não lê `Date.now()`.
    assert.equal(recorte?.agora.getTime(), AGORA);
  });

  void it('ISCA: sem `period`, `applied_filters` NÃO cita `period`', async () => {
    // É por `applied_filters` que a tela escreve a linha do recorte e conta os
    // filtros ativos. Um `period` aqui faria a página de pets abrir dizendo
    // "1 filtro ativo" sem ninguém ter escolhido nada, que é o defeito literal
    // que o cliente reclamou.
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.deepEqual(resposta.corpo['applied_filters'], { city: 'São Paulo' });
  });

  void it('CONTRAPESO: `period=30d` PEDIDO continua valendo e aparece', async () => {
    // A janela não foi removida do produto: ela deixou de ser imposta. Sem este
    // caso, apagar `period` da consulta passaria pelas duas iscas acima.
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(
      bancada,
      '/v1/public/lost-pets?city=S%C3%A3o%20Paulo&period=30d',
    );
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.equal(bancada.recortes[0]?.janela, '30d');
    assert.deepEqual(resposta.corpo['applied_filters'], {
      city: 'São Paulo',
      period: '30d',
    });
  });

  void it('`applied_filters` devolve o recorte que de fato valeu', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(
      bancada,
      '/v1/public/lost-pets?city=Campinas&neighborhood=Cambu%C3%AD&species=cat&period=7d',
    );
    assert.deepEqual(resposta.corpo['applied_filters'], {
      city: 'Campinas',
      neighborhood: 'Cambuí',
      species: 'cat',
      period: '7d',
    });
  });

  /**
   * ISCA (a) do pedido do cliente de 19/10/2026: *"o campo cidade do filtro da
   * página pet não deve ser obrigatório"*.
   *
   * Este caso MEDIU 400 até hoje, e o 400 era o comportamento correto do
   * contrato anterior: `city` era `required` e o Ajv do Fastify recusava a
   * ausência antes do manipulador. O caso foi invertido junto com o contrato.
   *
   * DESLIGANDO: reponha `required: true` no parâmetro `city` de
   * `listPublicLostPets` em `api/openapi.yaml` e este caso reprova pelo nome —
   * o esquema de `querystring` sai de lá, não daqui.
   */
  void it('ISCA: a lista abre SEM `city` — 200, e com itens', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 87 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 1, 'a lista sem cidade tem de TRAZER item');
    assert.equal(resposta.corpo['total'], 87);
  });

  /**
   * ISCA do texto vazio: `city` ausente chega INDEFINIDA, e não como `''`.
   *
   * Importa porque `''` responderia 200 igual ao caso de cima e devolveria
   * página VAZIA: o adaptador compararia `texto_para_busca('')`, que não casa
   * com nada. Seria "não há perdidos" no lugar de "todos os perdidos".
   *
   * **DESLIGANDO — e o mecanismo não é o que eu supus.** A primeira versão
   * desta nota dizia para repor o `?? ''` na rota. MEDIDO em 19/10/2026: com o
   * `?? ''` de volta na rota, **este caso continua passando**, porque
   * `aparado(pedido.city)` na camada de aplicação transforma `''` em
   * `undefined` logo depois. O `?? ''` saiu da rota de qualquer forma — ele não
   * tem mais razão de existir —, mas quem sustenta esta isca é o `aparado`.
   *
   * Para desligar de verdade: troque `const cidade = aparado(pedido.city)` por
   * `pedido.city ?? ''` em `application/listagem-publica-de-perdidos.ts`. Este
   * caso e o de `applied_filters` reprovam pelo nome.
   */
  void it('ISCA: `city` ausente chega INDEFINIDA à porta, e não como texto vazio', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, '/v1/public/lost-pets');
    const recorte = bancada.recortes[0];
    assert.equal(bancada.recortes.length, 1, 'a porta tem de ser chamada');
    assert.equal(
      recorte?.cidade,
      undefined,
      `a cidade deveria chegar indefinida, e chegou \`${String(recorte?.cidade)}\`. ` +
        "Se for `''`, o `?? ''` voltou à rota.",
    );
  });

  void it('ISCA: sem `city`, `applied_filters` NÃO cita `city`', async () => {
    // Mesmo motivo do `period`: é por `applied_filters` que a tela escreve a
    // linha do recorte e conta os filtros ativos. Uma cidade aqui faria a
    // página abrir dizendo que filtrou por um lugar que ninguém escolheu.
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.deepEqual(resposta.corpo['applied_filters'], {});
  });

  /**
   * ISCA (f) do refinamento de 19/10: *"devemos filtrar pelos 20 últimos pets
   * cadastrados"*.
   *
   * **Prova pela PÁGINA e pelo LIMITE que chegam à porta**, e o `limite: 20`
   * não é escolha desta tela nem desta rota: é o `default: 20` que o contrato
   * declara em `limit`, com `maximum: 20`. Quem é "os 20 últimos" pela DATA se
   * prova um nível abaixo, no SQL compilado — ver
   * `adapters/persistence/listagem-publica-de-perdidos-sem-id-interno.test.ts`,
   * caso 'ISCA: a ordem é o mais recente primeiro'.
   *
   * DESLIGANDO: troque o `default: 20` de `limit` de `listPublicLostPets` em
   * `api/openapi.yaml` para outro número. Este caso reprova pelo nome (medido
   * em 19/10/2026 com `default: 10`: três casos deste arquivo reprovam).
   *
   * **E NÃO adianta trocar o `TAMANHO_PADRAO` da aplicação: MEDIDO, a suíte
   * fica VERDE.** Vale registrar porque é contraintuitivo e porque a nota
   * anterior desta isca oferecia os dois caminhos como equivalentes: o Ajv que
   * o Fastify monta tem `useDefaults: true`, então ele ESCREVE `limit: 20` na
   * query de quem não mandou nada, antes de o manipulador rodar. O
   * `pedido.limit ?? TAMANHO_PADRAO` da aplicação nunca vê a ausência por esta
   * borda — a constante só vale para quem chama o serviço direto. É o mesmo
   * mecanismo que fez o `default: 30d` de `period` recortar a lista em 30 dias
   * depois de o app parar de mandar `period`.
   */
  void it('ISCA: o recorte padrão pede a página 1 com limite 20', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.equal(bancada.recortes[0]?.pagina, 1);
    assert.equal(bancada.recortes[0]?.limite, 20);
  });

  void it('CONTRAPESO: `city` com UMA letra continua 400 — `minLength: 2` vale', async () => {
    // Sem este caso, apagar o `minLength: 2` do contrato passaria pelas iscas
    // acima: elas medem a AUSÊNCIA, e ausência continua sendo 200. Omitir é
    // geografia aberta; mandar um valor inválido é erro, e os dois não são a
    // mesma coisa.
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets?city=S');
    assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
    assert.equal(bancada.recortes.length, 0, 'nada chega à porta com 400');
  });

  void it('CONTRAPESO: `city` PEDIDA continua recortando e aparece', async () => {
    // A cidade não saiu do produto: ela deixou de ser imposta. Sem este caso,
    // IGNORAR `city` de quem a mandou passaria por todas as iscas acima.
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(bancada.recortes[0]?.cidade, 'São Paulo');
    assert.deepEqual(resposta.corpo['applied_filters'], { city: 'São Paulo' });
  });

  void it('a rota passa pelo guarda de parâmetros sem derrubar a subida', async () => {
    const bancada = montar({ itens: [], total: 0 });
    // O pedido vem PRIMEIRO de propósito: é ele que leva o Fastify a `ready()`
    // e registra as rotas. Conferir antes acusa "nenhuma rota recebeu
    // validação" sobre um servidor que ainda não tem rota nenhuma — e foi
    // exatamente assim que esta isca reprovou na primeira rodada.
    await pedirSemConta(bancada, URL_DA_LISTA);
    bancada.conferirParametros();
  });
});

void describe('não-vazamento: a listagem pública não carrega id interno nem dado do tutor', () => {
  void it('zero achados do detector, com a porta devolvendo tudo que não devia', async () => {
    const bancada = montar({ itens: [perdidoHostil(), perdidoHostil()], total: 2 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(
      achadosDeVazamento(resposta.corpo, {
        declaradas: declaradas(bancada.contrato),
        plantados: PLANTADOS,
      }),
      [],
    );
  });

  void it('ISCA: um UUID no lugar do `share_token` é PEGO pelo detector', async () => {
    // Sem esta isca o caso de cima provaria apenas que o detector foi chamado.
    const bancada = montar({
      itens: [perdidoHostil({ shareToken: CASO_ID })],
      total: 1,
    });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    const achados = achadosDeVazamento(resposta.corpo, {
      declaradas: declaradas(bancada.contrato),
      plantados: PLANTADOS,
    });
    assert.ok(achados.length > 0, 'o detector não pegou um UUID interno na chave da lista');
  });

  void it('`area_label` é NULO quando o caso só tem coordenada (BICHUS-21 critério 5)', async () => {
    const bancada = montar({
      itens: [perdidoHostil({ cidade: null, bairro: null })],
      total: 1,
    });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    // Nulo, e não "Região não informada": rótulo fixo dentro de um campo de
    // dado é indistinguível de um bairro com esse nome. O texto é do cliente.
    assert.equal(itens[0]?.['area_label'], null);
  });

  void it('`Cache-Control: no-store` e `X-Robots-Tag: noindex`', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 1 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(resposta.cabecalhos['cache-control'], 'no-store');
    assert.equal(resposta.cabecalhos['x-robots-tag'], 'noindex, nofollow');
  });
});

/**
 * O ADR-0006 PROÍBE COORDENADA NOS DOIS SENTIDOS NESTA ROTA, E SÓ UM DELES
 * TINHA PORTÃO.
 *
 * O documento é literal sobre a listagem pública de perdidos: *"a listagem
 * pública de perdidos filtra por cidade e bairro digitados, **jamais por
 * latitude e longitude**"*. São duas proibições, e elas têm coberturas
 * diferentes:
 *
 * 1. **Coordenada ou distância na RESPOSTA** — já tem portão.
 *    `src/tools/portao-contrato-publico.ts` reprova `lat`, `lon`, `point`,
 *    `distance_m`, `distance_km` e `radius_m` em qualquer operação alcançável
 *    sem conta. MEDIDO em 19/10/2026: acrescentar `distance_m` a
 *    `PublicLostPet` reprova o portão com **dois** achados (`listPublicLostPets`
 *    e `getPublicLostCase`, que reusa o esquema), com saída 1.
 * 2. **Coordenada no PEDIDO** — NÃO TINHA PORTÃO NENHUM, e este bloco é ele.
 *    MEDIDO na mesma data: acrescentar `lat`, `lon` e `radius_m` como
 *    parâmetros de `querystring` desta operação e rodar o portão de contrato
 *    público devolve **APROVADO, com saída 0**. O portão percorre a RESPOSTA
 *    declarada e não olha `parameters` — e está certo em não olhar, porque o
 *    SEC-001 que ele implementa é sobre o que SAI. O lado do pedido ficava
 *    protegido por uma frase num ADR, e frase não reprova ninguém.
 *
 * Por que a proibição vale para o pedido também, e não é zelo: ordenar ou
 * filtrar por um centro que quem chama escolhe transforma a rota pública num
 * oráculo de posição. Quem varia o centro e lê a ORDEM da página trilatera o
 * ponto de cada caso sem que um único número de coordenada apareça na
 * resposta — é o mesmo dano que o item 4 do ADR-0010 existe para impedir,
 * alcançado pelo caminho que o portão não cobre.
 *
 * E a proibição de GEOCODIFICAÇÃO fecha a volta: *"não há serviço de
 * geocodificação contratado"*, então coordenada não vira nome de cidade nem
 * cidade vira coordenada. É por isso que o recorte geográfico desta rota é
 * texto contra texto.
 *
 * ESTE CASO ESTÁ ANCORADO NO QUE O CONTRATO DECLARA, e não num comentário:
 * ele lê `parameters` da operação pelo próprio carregador de contrato.
 */
void describe('ADR-0006: a listagem pública não aceita coordenada NEM distância no pedido', () => {
  /**
   * A mesma família de nomes que `portao-contrato-publico.ts` reprova na
   * resposta. Copiada e não importada **de propósito**: a lista de lá é sobre o
   * que SAI e pode mudar por outra razão; esta é sobre o que ENTRA nesta rota.
   * Importá-la faria uma mudança lá alterar em silêncio o que este caso mede.
   */
  const NOMES_DE_COORDENADA = [
    'lat',
    'lon',
    'latitude',
    'longitude',
    'point',
    'reference_point',
    'geo',
    'geom',
    'geohash',
    'coordinate',
    'coordinates',
    'distance_m',
    'distance_km',
    'radius_m',
    'radius',
    'near',
    'bbox',
    'map_url',
  ];

  function operacao(): { readonly parameters: readonly Record<string, unknown>[] } {
    const op = carregarContrato('api/openapi.yaml').operacoes.get('listPublicLostPets');
    if (op === undefined) {
      // Não achar a operação é REPROVAÇÃO, e não aprovação por omissão: foi
      // assim que um portão desta casa passou verde porque a rota ausente fazia
      // tudo responder 404.
      throw new Error(
        'O contrato não declara `listPublicLostPets`: este caso não tem o que ' +
          'percorrer e reprova em vez de aprovar por omissão.',
      );
    }
    return op;
  }

  void it('a operação declara parâmetro, e há o que percorrer', () => {
    // Filtro que não filtra termina verde. Se `parameters` vier vazio, os dois
    // casos abaixo passariam sem medir nada.
    assert.ok(
      operacao().parameters.length > 0,
      'sem parâmetro declarado não há como afirmar que nenhum é coordenada',
    );
  });

  /**
   * DESLIGANDO: acrescente `- name: lat` / `in: query` aos `parameters` de
   * `listPublicLostPets` em `api/openapi.yaml`. Este caso reprova pelo nome, e
   * o portão de contrato público continua APROVANDO — que é exatamente a razão
   * de este caso existir.
   */
  void it('ISCA: nenhum parâmetro da rota é coordenada, distância ou raio', () => {
    // `typeof === 'string'` e nao `String(...)`: o `name` de um parametro e
    // texto no contrato, mas o tipo dele aqui e `unknown`, e `String(unknown)`
    // produz `[object Object]` para um objeto -- um nome que nunca casaria com
    // a lista e que faria este caso aprovar em silencio. `@typescript-eslint/
    // no-base-to-string` acusou isso, e com razao.
    const achados = operacao()
      .parameters.map((p) => p['name'])
      .filter((nome): nome is string => typeof nome === 'string')
      .filter((nome) => NOMES_DE_COORDENADA.includes(nome.toLowerCase()));
    assert.deepEqual(
      achados,
      [],
      `o ADR-0006 proíbe estes parâmetros em \`listPublicLostPets\`: ${achados.join(', ')}. ` +
        'Ordenar a lista pública por proximidade exige emenda DATADA do ADR-0006 e do ' +
        'ADR-0010 (itens 4 e 5), e não um parâmetro novo.',
    );
  });

  void it('ISCA: o recorte que a porta recebe não tem campo de coordenada', () => {
    // O contrato é um lado; o outro é o que a aplicação MONTA. Um parâmetro
    // fora do contrato ainda chegaria à porta se a rota o lesse de
    // `request.query` à mão.
    const bancada = montar({ itens: [], total: 0 });
    return pedirSemConta(
      bancada,
      '/v1/public/lost-pets?lat=-23.56&lon=-46.65&radius_m=5000',
    ).then(() => {
      const recorte = bancada.recortes[0] as unknown as Record<string, unknown>;
      assert.ok(recorte !== undefined, 'a porta tem de ser chamada');
      const vazados = NOMES_DE_COORDENADA.filter((nome) => recorte[nome] !== undefined);
      assert.deepEqual(
        vazados,
        [],
        `o recorte chegou com ${vazados.join(', ')}: a rota passou coordenada adiante`,
      );
    });
  });
});
