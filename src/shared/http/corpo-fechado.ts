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
 * ## ELE DESCE NO CORPO INTEIRO, E ANTES NÃO DESCIA
 *
 * Até 18/10/2026 o guarda lia só o NÍVEL DE CIMA: montava os nomes aceitos com
 * `Object.keys(schema.properties)` e varria `Object.keys(corpo)`. Objeto
 * aninhado passava inteiro, mesmo declarando `additionalProperties: false` no
 * contrato. Medido em duas rotas que instalam este guarda e no corpo real
 * delas:
 *
 * - `suggestDirectoryEntry` com `public_contact: { kind: 'phone', value,
 *   label: 'comercial' }` respondia **201**. `DirectorySuggestionContact`
 *   declara `additionalProperties: false` (`api/openapi.yaml`), e `label` era
 *   apagado em silêncio pelo `removeAdditional` do Ajv;
 * - `requestCollarTag` com `delivery_address: { …, cpf: '…' }` respondia
 *   **200**, pela mesma razão. Um CPF que ninguém guardou, com recibo de
 *   sucesso — e é dado pessoal, exatamente o que não pode chegar calado.
 *
 * Responder 2xx a um campo que não foi gravado é o defeito que este arquivo
 * existe para fechar, e ele continuava aberto um nível abaixo. Agora a varredura
 * acompanha o schema: desce em objeto e em item de lista, e o `field` do 400 sai
 * com o caminho inteiro (`public_contact.label`), que é o que a tela marca.
 *
 * ## ONDE ELE DESCE, E POR QUE NÃO EM TUDO
 *
 * Só onde o contrato FECHA o objeto. Objeto aninhado sem
 * `additionalProperties: false` é aberto de propósito, e recusar campo nele
 * seria o guarda inventando regra que o contrato não tem. A decisão é lida do
 * schema, nunca de uma lista escrita aqui.
 *
 * ## O ESCOPO DESTA CORREÇÃO, DITO EM VOZ ALTA
 *
 * Ela vale onde o guarda é instalado, e **não** conserta o produto inteiro.
 * Toda rota que declare `additionalProperties: false` e **não** instale o
 * guarda continua tendo o campo apagado em silêncio. A correção de fundo é
 * passar `ajv: { removeAdditional: false }` em `criarServidor`, e ela muda o
 * comportamento de **toda** rota de uma vez — inclusive das que hoje dependem
 * do descarte sem saber. Fica registrada como pendência com a medição junto,
 * em vez de virar uma mudança global no fim de uma rodada de QA.
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
/**
 * Os campos desconhecidos de `corpo` contra `schema`, em qualquer profundidade.
 *
 * `prefixo` é o caminho já percorrido, e é ele que faz o `field` do 400 sair
 * como `public_contact.label` em vez de `label` — dois campos de nomes iguais
 * em objetos diferentes não podem produzir o mesmo achado.
 */
function desconhecidosDe(
  schema: Record<string, unknown>,
  corpo: unknown,
  prefixo: string,
): ProblemFieldError[] {
  // Lista: cada item é conferido contra o schema de `items`, com o índice no
  // caminho. Sem isto, objeto fechado dentro de lista voltaria a passar.
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

  // O nível de cima, só quando o contrato FECHA este objeto. Aberto de
  // propósito não vira recusa.
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

  // E os níveis de baixo, pelo schema de cada propriedade conhecida.
  for (const [nome, subSchema] of Object.entries(propriedades)) {
    if (!ehObjeto(subSchema)) continue;
    if (!(nome in corpo)) continue;
    achados.push(...desconhecidosDe(subSchema, corpo[nome], `${prefixo}${nome}.`));
  }

  return achados;
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
