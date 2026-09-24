/**
 * `additionalProperties: false` no contrato **não fecha o corpo em tempo de
 * execução**, e este arquivo é a correção.
 *
 * ## O defeito, medido
 *
 * O Fastify monta o Ajv com `removeAdditional: true` por padrão. Com isso, um
 * schema que declara `additionalProperties: false` não recusa o campo
 * desconhecido: ele o **apaga em silêncio**, e o manipulador recebe um corpo que
 * não é o que o cliente mandou. Medido em 23/09/2026, com o Fastify desta base:
 *
 * ```
 * POST /x  {"a":"ok","desconhecido":"passou"}   ->  200  {"viu":{"a":"ok"}}
 * ```
 *
 * Duzentos, e o campo sumiu. Nenhum log, nenhum aviso.
 *
 * ## Por que isso é mais grave numa escrita administrativa
 *
 * Porque ali o campo desconhecido tem nome: `verification_level`. O corpo da
 * edição do diretório é fechado justamente para que o painel **não** consiga
 * escrever o nível de verificação, que é derivado (ADR-0026 §5). Com o campo
 * apagado em silêncio, o operador manda `document_verified`, recebe **200**, e
 * acredita ter marcado o selo. A resposta ainda traz o nível verdadeiro, mas
 * quem leu "200" já foi embora.
 *
 * Aceitar e ignorar é pior que aceitar: o primeiro mente sobre o que aconteceu.
 *
 * ## O que este guarda faz, e por que ele é um `preValidation`
 *
 * `preValidation` roda **antes** do Ajv, então o corpo ainda é o que chegou.
 * Depois da validação já não há o que conferir — o campo não existe mais.
 *
 * A lista de nomes aceitos sai do **próprio schema do contrato**, e não de uma
 * cópia escrita à mão: uma segunda lista é a que diverge.
 *
 * ## Verificação que não consegue verificar reprova
 *
 * Instalar este guarda sobre um schema que **não** declara
 * `additionalProperties: false` derruba a subida. Um guarda de corpo fechado
 * montado sobre um corpo aberto passaria a aprovar tudo, e passaria calado — que
 * é a forma exata do defeito que ele existe para consertar.
 *
 * ## O escopo desta correção, dito em voz alta
 *
 * Ela vale onde é instalada, e **não** conserta o produto inteiro. Toda outra
 * rota que declare `additionalProperties: false` continua tendo o campo apagado
 * em silêncio. A correção de fundo é passar `ajv: { removeAdditional: false }`
 * em `criarServidor`, e ela muda o comportamento de **toda** rota de uma vez —
 * inclusive das que hoje dependem do descarte sem saber. Fica registrada como
 * pendência com a medição junto, em vez de virar uma mudança global no fim de
 * uma entrega que não a tinha no escopo.
 */
import type { FastifyRequest, preValidationHookHandler } from 'fastify';

import { problemas } from './errors.js';
import type { ProblemFieldError } from './problem.js';

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Monta o guarda a partir do schema do contrato.
 *
 * `operationId` entra só para a mensagem de subida: quem for consertar precisa
 * saber qual operação, e o schema sozinho não diz.
 */
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
  const aceitos = new Set(Object.keys(propriedades));

  return (request: FastifyRequest, _reply, pronto): void => {
    const corpo = request.body;
    if (!ehObjeto(corpo)) {
      pronto();
      return;
    }

    const desconhecidos: ProblemFieldError[] = Object.keys(corpo)
      .filter((nome) => !aceitos.has(nome))
      .map((nome) => ({
        field: nome,
        code: 'unknown_field',
        message: 'Este campo não existe nesta operação, e não pode ser gravado.',
      }));

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
