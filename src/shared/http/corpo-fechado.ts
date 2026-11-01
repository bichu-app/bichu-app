import type { FastifyRequest, preValidationHookHandler } from 'fastify';

import { problemas } from './errors.js';
import type { ProblemFieldError } from './problem.js';

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function desconhecidosDe(
  schema: Record<string, unknown>,
  corpo: unknown,
  prefixo: string,
): ProblemFieldError[] {
  if (Array.isArray(corpo)) {
    const itens = schema['items'];
    if (!ehObjeto(itens)) return [];
    return corpo.flatMap((item, indice) =>
      desconhecidosDe(itens, item, `${prefixo}${String(indice)}.`),
    );
  }

  if (!ehObjeto(corpo)) return [];

  const propriedades = ehObjeto(schema['properties']) ? schema['properties'] : {};
  const achados: ProblemFieldError[] = [];

  if (schema['additionalProperties'] === false) {
    const aceitos = new Set(Object.keys(propriedades));
    for (const nome of Object.keys(corpo)) {
      if (!aceitos.has(nome)) {
        achados.push({
          field: `${prefixo}${nome}`,
          code: 'unknown_field',
          message: 'Este campo não existe nesta operação, e não pode ser gravado.',
        });
      }
    }
  }

  for (const [nome, subSchema] of Object.entries(propriedades)) {
    if (!ehObjeto(subSchema)) continue;
    if (!(nome in corpo)) continue;
    achados.push(...desconhecidosDe(subSchema, corpo[nome], `${prefixo}${nome}.`));
  }

  return achados;
}

/** Monta o guarda a partir do schema do contrato. */
export function recusarCampoDesconhecido(
  schema: Record<string, unknown>,
  operationId: string,
): preValidationHookHandler {
  if (schema['additionalProperties'] !== false) {
    throw new Error(
      `A operação ${operationId} instala o guarda de corpo fechado e o schema dela não ` +
        'declara `additionalProperties: false`. O guarda aceitaria qualquer campo e ficaria ' +
        'calado, que é o defeito que ele existe para consertar. Feche o corpo no contrato ' +
        'ou não instale o guarda.',
    );
  }

  const propriedades = schema['properties'];
  if (!ehObjeto(propriedades) || Object.keys(propriedades).length === 0) {
    throw new Error(
      `A operação ${operationId} instala o guarda de corpo fechado e o schema dela não tem ` +
        '`properties`. Sem nomes aceitos, o guarda recusaria todo corpo, para sempre.',
    );
  }

  return (request: FastifyRequest, _reply, pronto): void => {
    const desconhecidos = desconhecidosDe(schema, request.body, '');
    if (desconhecidos.length > 0) {
      pronto(
        problemas.validacao(
          desconhecidos,
          'A requisição trouxe campo que esta operação não aceita. Ele não foi gravado.',
        ),
      );
      return;
    }
    pronto();
  };
}
