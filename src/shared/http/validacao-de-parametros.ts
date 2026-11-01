import type { FastifySchema } from 'fastify';
import type { RegistradorDeRotas } from './registrar-rota.js';
import type { Contrato, EsquemasDeParametros } from './contract.js';
import { AppError, problemas } from './errors.js';
import { caminhoDoContrato } from './idempotency.js';
import { campoDoSchema, type ErroDeSchema } from './erros-de-schema.js';

function problemaDeParametroMalformado(
  erros: readonly ErroDeSchema[],
  tiposDeProblema: ReadonlyMap<string, string>,
): AppError {
  const campos = erros.map(campoDoSchema);

  for (const campo of campos) {
    const tipo = tiposDeProblema.get(campo.field);
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
 * Instala a validação de parâmetros em toda rota registrada DEPOIS desta chamada,
 * e devolve a conferência de subida para ser chamada DEPOIS do registro de todas
 * elas.
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
  let corposConferidos = 0;

  app.addHook('onRoute', (rota) => {
    if ((rota.config as { metodoNaoPermitido?: boolean } | undefined)?.metodoNaoPermitido === true) return;
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    const caminho = caminhoDoContrato(rota.url, prefixoDaApi);

    for (const metodoBruto of metodos) {
      const metodo = metodoBruto.toLowerCase();
      if (metodo === 'head' || metodo === 'options') continue;

      const operationId = porRota.get(`${metodo} ${caminho}`);
      if (operationId === undefined) {
        semContrato.push(`${metodo.toUpperCase()} ${caminho}`);
        continue;
      }

      const esquemas = contrato.parameterSchemas(operationId);
      const schema: FastifySchema = rota.schema ?? {};
      const operacao = contrato.operacoes.get(operationId);

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

