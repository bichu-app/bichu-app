/**
 * O caso de uso da duvida de ajuda: **aparar, conferir de novo, gravar**.
 *
 * ## POR QUE EXISTE UMA SEGUNDA CONFERENCIA, se o contrato ja validou
 *
 * O contrato cobra `minLength: 2` em `subject` e em `body`, e o Ajv recusa
 * antes do handler. Mas **o contrato conta caracteres do que chegou, e o que e
 * gravado e o que foi APARADO** -- e os dois numeros podem discordar.
 *
 * Isto nao e hipotese. `{"subject":" a ","body":"ola"}` tem assunto de TRES
 * caracteres e passa pelo `minLength: 2` do contrato; aparado, ele vira `"a"`,
 * de UM, e o `CHECK help_requests_assunto_tamanho` do banco recusa. Sem esta
 * conferencia, o desfecho seria **500** -- erro de servidor por um corpo que o
 * usuario podia consertar. Com ela, e `400` com o campo nomeado, que e a
 * verdade: o que falta e conteudo, nao e o servidor que quebrou.
 *
 * O aparo em si nao e opcional: sem ele, um assunto de cem espacos entraria na
 * fila do painel como uma linha em branco, e ninguem saberia dizer se a duvida
 * veio vazia ou se a tela perdeu o texto.
 *
 * ## NAO HA AVISO AQUI, E NEM PODERIA HAVER
 *
 * Este servico conhece UMA porta, a da propria fila. Ele nao recebe
 * notificador, nem fila de e-mail, nem relogio de disparo -- entao **nao existe
 * dentro deste arquivo nada que possa avisar alguem, nem por engano**. A
 * decisao do cliente de 29/10/2026 (grava e nao notifica) esta imposta pela
 * forma da dependencia, e nao so por um comentario.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/time/clock.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { DuvidasDeAjuda } from '../ports/duvidas-de-ajuda.js';

/**
 * Os mesmos numeros de `HelpRequestInput` e dos dois `CHECK` da migracao.
 *
 * Os tres lugares precisam concordar, e o que os mantem em acordo e o caso de
 * integracao, que manda o teto exato e o teto mais um.
 */
export const TETO_DO_ASSUNTO = 120;
export const TETO_DO_TEXTO = 4000;
const PISO = 2;

export interface ChamadorDaAjuda {
  readonly userId: UserId;
}

export interface DuvidaDeAjudaService {
  registrar(chamador: ChamadorDaAjuda, assunto: string, texto: string): Promise<void>;
}

/**
 * Apara e cobra o piso **sobre o aparado**. Devolve a mensagem do campo, ou
 * `undefined` quando esta bom.
 */
function aparado(
  valor: string,
  campo: string,
  teto: number,
): { readonly texto: string } | { readonly erro: { field: string; code: string; message: string } } {
  const limpo = valor.trim();
  if (limpo.length < PISO) {
    return {
      erro: {
        field: campo,
        code: 'too_short',
        message: 'Escreva um pouco mais: tem de sobrar texto depois dos espaços.',
      },
    };
  }
  // O teto tambem e conferido sobre o APARADO, pela simetria: um texto de
  // `teto + 2` cujos dois ultimos caracteres sao espaco cabe depois do aparo, e
  // recusa-lo seria contar espaco como conteudo numa ponta e nao na outra.
  if (limpo.length > teto) {
    return {
      erro: {
        field: campo,
        code: 'too_long',
        message: `Encurte para no máximo ${String(teto)} caracteres.`,
      },
    };
  }
  return { texto: limpo };
}

export function criarDuvidaDeAjudaService(
  duvidas: DuvidasDeAjuda,
  relogio: Clock,
): DuvidaDeAjudaService {
  return {
    async registrar(chamador: ChamadorDaAjuda, assunto: string, texto: string): Promise<void> {
      const a = aparado(assunto, 'subject', TETO_DO_ASSUNTO);
      const t = aparado(texto, 'body', TETO_DO_TEXTO);

      // OS DOIS ERROS DE UMA VEZ, e nao o primeiro que aparecer: a tela mostra
      // a mensagem embaixo de cada campo, e devolver um de cada vez faria o
      // tutor corrigir, reenviar e descobrir o segundo.
      //
      // O `if` e escrito sobre os DOIS resultados e nao sobre o tamanho de uma
      // lista de erros, porque e ele que estreita os tipos: com a contagem, o
      // compilador continuaria achando que `a.texto` pode nao existir depois do
      // `throw`, e a saida seria um segundo `if` morto em execucao so para
      // calar o compilador.
      if ('erro' in a || 'erro' in t) {
        throw problemas.validacao([
          ...('erro' in a ? [a.erro] : []),
          ...('erro' in t ? [t.erro] : []),
        ]);
      }

      await duvidas.registrar(
        { autor: chamador.userId, assunto: a.texto, texto: t.texto },
        relogio.now(),
      );
    },
  };
}
