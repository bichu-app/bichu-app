/**
 * Validação de parâmetro de caminho e de query string, vinda do contrato.
 *
 * ## O defeito
 *
 * Até aqui **nenhuma rota declarava `schema.params` nem `schema.querystring`**.
 * Os nove pontos que liam `request.params` conferiam "string não vazia" e
 * seguiam: `petIdDoCaminho` fazia `petId as PetId` sem conferir que era UUID,
 * enquanto `api/openapi.yaml` declara `format: uuid` nesses parâmetros havia
 * meses. Um `petId` torto atravessava a borda, atravessava o domínio e chegava
 * ao Postgres, que respondia `invalid input syntax for type uuid` — ou seja,
 * **500**, um erro nosso, para uma requisição que era do cliente.
 *
 * É a mesma classe do corpo sem `schema`, um nível acima: o contrato declara
 * uma exigência e o runtime não a aplica. E é a mesma correção: não escrever a
 * conferência à mão, e sim fazer o Fastify usar o schema que **já está** na
 * especificação. Validação escrita em paralelo ao contrato é a segunda
 * definição, e o dia em que as duas divergirem ninguém vai saber qual vale
 * (ADR-0001).
 *
 * ## 400 ou 404? A decisão, e o argumento
 *
 * Ligar a validação muda a resposta de várias rotas, e isso interage com a
 * **ADR-0021 (autorização na cláusula WHERE, 404 nunca 403)**. A objeção é
 * real e vale enunciá-la inteira: se identificador malformado passa a responder
 * 400 e identificador bem formado que não é seu responde 404, quem chama
 * consegue distinguir os dois casos. Isso é um oráculo.
 *
 * **A escolha é 400 para malformado e 404 para bem formado inexistente**, e o
 * motivo é que esse oráculo não transporta informação nenhuma.
 *
 * O que a ADR-0021 fecha é um oráculo sobre o **estado do servidor**: um 403
 * afirma "este recurso existe e é de outra pessoa", que é um fato do banco e
 * que quem pergunta não tinha como saber. O 400 aqui afirma "o texto que você
 * mandou não tem a forma de um identificador" — um fato sobre a **requisição**,
 * que quem a montou consegue calcular sozinho, offline, sem nos perguntar
 * nada. Resposta que o cliente pode computar sem falar com o servidor não é
 * oráculo; é eco.
 *
 * O contrato já decidiu assim, e por escrito, na rota mais pública e mais
 * sensível do produto. A descrição do 404 de `resolveTagCode` em
 * `api/openapi.yaml` diz, sobre o código da tag, que é uma credencial ao
 * portador e adivinhável por força bruta:
 *
 *   > "Para quem esta na rua, a diferenca entre 400 e 404 e util e nao vaza
 *   > nada: um diz 'confira o que voce digitou', o outro diz 'nao encontramos
 *   > este codigo'. Os dois contam igualmente para o limite de tentativas
 *   > invalidas."
 *
 * Então isto não é decisão nova: é a decisão que já estava escrita, aplicada
 * ao resto das rotas, que simplesmente não a aplicavam.
 *
 * As duas alternativas, e por que não:
 *
 * - **404 para os dois** fecharia o oráculo por completo e custaria caro em
 *   troca de nada: esconderia erro de programação de quem integra, e — pior —
 *   esconderia os **nossos**. Um cliente que monta a URL com `undefined` no
 *   lugar do id receberia "pet não encontrado" e mandaria alguém caçar um
 *   problema de dado que não existe. Contraria também a regra de falha ruidosa
 *   deste projeto.
 * - **400 só onde o identificador é público e adivinhável** parte a regra por
 *   rota. Regra que depende de classificar cada rota é regra que deriva na
 *   primeira rota nova, e o custo de errar a classificação é assimétrico.
 *
 * A decisão é trocável **num lugar só**: `problemaDeParametroMalformado`,
 * abaixo. Trocar o corpo daquela função troca a resposta de todas as rotas de
 * uma vez, e nenhum outro arquivo participa dela.
 *
 * ## O `type` continua sendo o do contrato
 *
 * Um parâmetro pode declarar `x-problem-type` na especificação. O código da tag
 * declara `tag-code-malformed`, porque é isso que o contrato promete no 400
 * dele — e é por `type`, não por status, que o app decide a tela e que o teto
 * de tentativas inválidas decide se conta. Sem esse caminho, ligar a validação
 * de borda teria trocado `tag-code-malformed` por `validation-failed` na rota
 * pública, com o mesmo 400 e a tela errada.
 *
 * ## Por que um gancho `onRoute`, e não `schema:` em cada rota
 *
 * Declarar `schema: { params }` em cada registro é um passo a lembrar, e passo
 * a lembrar é passo a esquecer — foi exatamente assim que as trinta e três
 * rotas chegaram até aqui sem nenhum. Aqui a validação é **consequência de
 * registrar a rota**: ela vem do contrato, pelo `operationId`, sem que o autor
 * da rota faça nada.
 *
 * E a conferência devolvida reprova a **subida**, não a primeira requisição:
 *
 * 1. rota registrada sem operação correspondente no contrato;
 * 2. rota que declara `params`/`querystring` por conta própria, criando a
 *    segunda definição que o contrato existe para não ter;
 * 3. operação que **pode responder 400 e não o declara** — erro é contrato
 *    também, e responder um status que a especificação não promete é a mesma
 *    divergência, na direção oposta;
 * 4. nenhuma rota coberta. Verificação que não consegue verificar precisa
 *    reprovar: silêncio aqui seria confiança falsa.
 *
 * ## O item 3 era cego para corpo, e essa cegueira era a causa raiz
 *
 * Até 22/09/2026 o item 3 só olhava **esquema de parâmetro**. A checagem inteira
 * ficava atrás de um `continue`:
 *
 * ```ts
 * if (esquemas.params === undefined && esquemas.querystring === undefined) continue;
 * ```
 *
 * Operação sem parâmetro nenhum saía do laço antes de ser conferida, mesmo
 * registrando `schema: { body }` vindo do contrato — que é de onde o 400 mais
 * comum da API sai, porque é ali que estão os `enum`, os `required` e os
 * `format`. `createPetPhotoUploadIntent` e `createFoundReportPhotoUploadIntent`
 * são as duas: nenhuma tem parâmetro, as duas validam corpo, e o `enum` de
 * `content_type` recusa com 400 desde sempre. O portão passou verde sobre as
 * duas porque nunca chegou a olhá-las.
 *
 * Corrigir as duas declarações à mão deixaria o padrão pronto para divergir na
 * terceira. Por isso a correção é no portão: ele passou a perguntar, para cada
 * rota registrada, **se ela instalou um esquema de corpo**. Instalou, então 400
 * é alcançável e a especificação precisa prometê-lo — e aí as duas operações são
 * acusadas por ele, e não por quem lembrou de olhar.
 *
 * A pergunta é sobre a rota REGISTRADA (`rota.schema.body`), e não sobre o que
 * o contrato declara, de propósito: o que produz 400 é o validador instalado, e
 * cobrar `400` de uma operação cujo corpo ninguém valida seria ruído. Ruído é
 * como portão perde credibilidade, e portão sem credibilidade é desligado.
 */
import type { FastifySchema } from 'fastify';
import type { RegistradorDeRotas } from './registrar-rota.js';
import type { Contrato, EsquemasDeParametros } from './contract.js';
import { AppError, problemas } from './errors.js';
import { caminhoDoContrato } from './idempotency.js';
import { campoDoSchema, type ErroDeSchema } from './erros-de-schema.js';



/**
 * **A decisão de status, e o único lugar que a contém.**
 *
 * Trocar o corpo desta função troca a resposta de todo parâmetro malformado da
 * API de uma vez. O argumento está no cabeçalho do arquivo; se ele for
 * revertido, é aqui que a reversão cabe — e em nenhum outro lugar.
 *
 * O valor recebido **nunca** entra na resposta. Dois motivos: parâmetro de
 * caminho pode ser o código da tag, que é credencial ao portador (a mesma razão
 * de `redacao-de-url.ts` existir), e id interno em saída pública é proibido
 * pelo ADR-0010. O que sai é o nome do campo e a regra que ele violou.
 */
function problemaDeParametroMalformado(
  erros: readonly ErroDeSchema[],
  tiposDeProblema: ReadonlyMap<string, string>,
): AppError {
  // O MESMO mapeamento do corpo (`erros-de-schema.ts`). Enquanto eram dois, o de
  // parâmetro lia só `instancePath` e o de corpo não lia nada — e `required`, que
  // é o achado mais comum, não aparece em `instancePath` nenhum dos dois casos.
  const campos = erros.map(campoDoSchema);

  for (const campo of campos) {
    const tipo = tiposDeProblema.get(campo.field);
    // O parâmetro declara um `type` próprio no contrato. Ele manda, porque é
    // por `type` que o app decide a tela.
    if (tipo === 'tag-code-malformed') return problemas.tagCodeMalformado();
    if (tipo !== undefined) {
      throw new Error(
        `O contrato declara \`x-problem-type: ${tipo}\` no parâmetro '${campo.field}' e ` +
          'esta borda não sabe produzir esse problema. Acrescente o caso em ' +
          'problemaDeParametroMalformado, em src/shared/http/validacao-de-parametros.ts. ' +
          'Cair no `validation-failed` genérico responderia um `type` que o contrato ' +
          'não promete, e o app decide a tela por `type`.',
      );
    }
  }

  return problemas.validacao(campos, 'Confira os valores do endereço da requisição.');
}

/**
 * Um schema de parâmetro que **não consegue recusar nada**.
 *
 * `{ type: 'string' }` num parâmetro de caminho é isso: o Fastify só chega aqui
 * com texto, então nenhum valor reprova. Distinguir importa para o item 3 da
 * conferência de subida — cobrar 400 declarado de uma operação que nunca vai
 * responder 400 seria ruído, e ruído é como portão perde credibilidade.
 */
function podeRecusar(schemaDoParametro: unknown): boolean {
  if (typeof schemaDoParametro !== 'object' || schemaDoParametro === null) return false;
  const chaves = Object.keys(schemaDoParametro);
  return chaves.some((chave) => chave !== 'type' && chave !== 'description' && chave !== 'default');
}

function algumParametroPodeRecusar(esquemas: EsquemasDeParametros): boolean {
  for (const grupo of [esquemas.params, esquemas.querystring]) {
    if (grupo === undefined) continue;
    const propriedades = grupo['properties'];
    if (typeof propriedades !== 'object' || propriedades === null) continue;
    if (Object.values(propriedades).some(podeRecusar)) return true;
  }
  return false;
}

function declaraStatus(raw: Record<string, unknown>, status: string): boolean {
  const respostas = raw['responses'];
  if (typeof respostas !== 'object' || respostas === null) return false;
  return status in (respostas as Record<string, unknown>);
}

/**
 * Instala a validação de parâmetros em toda rota registrada DEPOIS desta
 * chamada, e devolve a conferência de subida para ser chamada DEPOIS do
 * registro de todas elas.
 *
 * É o mesmo par de `vigiarIdempotenciaDasRotas`, e pela mesma razão: o gancho
 * `onRoute` só enxerga o que vem depois dele, e a conferência só faz sentido
 * quando todas as rotas já existem.
 */
export function vigiarParametrosDasRotas(
  app: RegistradorDeRotas,
  contrato: Contrato,
  prefixoDaApi: string,
): () => void {
  const porRota = new Map<string, string>();
  for (const operacao of contrato.operacoes.values()) {
    porRota.set(`${operacao.method} ${operacao.path}`, operacao.operationId);
  }

  const semContrato: string[] = [];
  const comSchemaProprio: string[] = [];
  const semQuatrocentos: string[] = [];
  let cobertas = 0;
  /** Quantas rotas registradas instalaram esquema de corpo. Vai para o log. */
  let corposConferidos = 0;

  app.addHook('onRoute', (rota) => {
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    const caminho = caminhoDoContrato(rota.url, prefixoDaApi);

    for (const metodoBruto of metodos) {
      const metodo = metodoBruto.toLowerCase();
      // O Fastify registra um HEAD espelhando cada GET. Ele não existe no
      // contrato e não precisa existir: ele reusa o schema do GET irmão.
      if (metodo === 'head' || metodo === 'options') continue;

      const operationId = porRota.get(`${metodo} ${caminho}`);
      if (operationId === undefined) {
        semContrato.push(`${metodo.toUpperCase()} ${caminho}`);
        continue;
      }

      const esquemas = contrato.parameterSchemas(operationId);
      const schema: FastifySchema = rota.schema ?? {};
      const operacao = contrato.operacoes.get(operationId);

      // O CORPO. Esta é a metade que faltava: a rota que instala `schema.body`
      // responde 400 a corpo fora do esquema, tenha ela parâmetro ou não.
      if (schema.body !== undefined) {
        corposConferidos += 1;
        if (operacao !== undefined && !declaraStatus(operacao.raw, '400')) {
          semQuatrocentos.push(
            `${operationId} (${metodo.toUpperCase()} ${caminho}) — valida corpo`,
          );
        }
      }

      if (esquemas.params === undefined && esquemas.querystring === undefined) continue;

      if (schema.params !== undefined || schema.querystring !== undefined) {
        comSchemaProprio.push(operationId);
        continue;
      }

      if (
        operacao !== undefined &&
        algumParametroPodeRecusar(esquemas) &&
        !declaraStatus(operacao.raw, '400')
      ) {
        // Já acusada pelo corpo? Uma linha basta: o conserto é o mesmo, e duas
        // linhas sobre a mesma operação fazem a lista parecer maior do que o
        // trabalho que ela representa.
        if (!semQuatrocentos.some((linha) => linha.startsWith(`${operationId} (`))) {
          semQuatrocentos.push(
            `${operationId} (${metodo.toUpperCase()} ${caminho}) — valida parâmetro`,
          );
        }
        continue;
      }

      rota.schema = {
        ...schema,
        ...(esquemas.params === undefined ? {} : { params: esquemas.params }),
        ...(esquemas.querystring === undefined ? {} : { querystring: esquemas.querystring }),
      };
      rota.schemaErrorFormatter = (erros, dataVar): Error => {
        if (dataVar !== 'params' && dataVar !== 'querystring') {
          // Corpo e cabeçalho não são deste arquivo. O formatador é por rota, e
          // não por lugar, então ele PRECISA devolver o erro do framework para
          // os outros lugares — senão instalar a validação de parâmetro mudaria,
          // de lado, o corpo de erro de toda rota que valida corpo.
          return Object.assign(new Error('validation failed'), {
            code: 'FST_ERR_VALIDATION',
            statusCode: 400,
          });
        }
        return problemaDeParametroMalformado(erros, esquemas.tiposDeProblema);
      };
      cobertas += 1;
    }
  });

  return () => {
    const queixas: string[] = [];
    if (semContrato.length > 0) {
      queixas.push(
        'Rotas registradas sem operação correspondente no contrato, que por isso ' +
          `ficam sem validação de parâmetro nenhuma: ${semContrato.join(', ')}`,
      );
    }
    if (comSchemaProprio.length > 0) {
      queixas.push(
        'Rotas que declaram `params` ou `querystring` por conta própria, criando a ' +
          'segunda definição que diverge do contrato na primeira mudança: ' +
          `${comSchemaProprio.join(', ')}. Tire a declaração da rota; o contrato já a tem.`,
      );
    }
    if (semQuatrocentos.length > 0) {
      queixas.push(
        'Operações que podem responder 400 e não o declaram em ' +
          `api/openapi.yaml: ${semQuatrocentos.join(', ')}. ` +
          'Erro é contrato também: responder um status que a especificação não ' +
          'promete é a mesma divergência que não validar, na direção oposta. ' +
          'Acrescente `400: { $ref: "#/components/responses/ValidationFailed" }`.',
      );
    }
    if (queixas.length > 0) throw new Error(queixas.join(' | '));

    if (cobertas === 0) {
      // Nenhuma rota coberta não é aprovação: é o portão dizendo que não teve o
      // que conferir. Silêncio aqui seria a confiança falsa que ele existe para
      // impedir.
      throw new Error(
        'Nenhuma rota recebeu validação de parâmetro. Ou o gancho foi instalado ' +
          'depois do registro das rotas, ou o casamento entre rota e contrato ' +
          'parou de funcionar. Nos dois casos a API está sem a validação e o ' +
          'portão estava prestes a terminar calado.',
      );
    }
    app.log.info(
      { rotasComParametrosValidados: cobertas, rotasComCorpoConferido: corposConferidos },
      'parâmetros e corpos conferidos contra o contrato',
    );
  };
}

/** Exportado só para os testes: a decisão de status mora aqui e é conferível. */
export const _decisaoDeStatus = {
  problemaDeParametroMalformado,
  podeRecusar,
};

