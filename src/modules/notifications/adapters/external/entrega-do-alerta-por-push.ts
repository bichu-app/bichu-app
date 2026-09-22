/**
 * O outro lado de `EntregaDoAlerta`: avisar um vizinho por push.
 *
 * Este arquivo é a junta entre os dois módulos, e é a única que existe.
 * `lostfound` decide **quem** e **quantos**; aqui está o **como** — o texto, o
 * endereço, o transporte e a higiene do token. Ele implementa uma porta
 * declarada por `lostfound` porque quem exige a porta é quem disparou o alerta
 * (§6), e é isso que mantém a consulta de raio fora deste módulo, como o
 * cabeçalho de `ports/registro-de-aparelhos.ts` pede por extenso.
 *
 * ## As três funções da BICHUS-91 que este arquivo liga
 *
 * Elas foram escritas com o chamador nomeado e ausente ("é a BICHUS-18", diz o
 * cabeçalho de `revogacao-por-token-recusado.test.ts`). O chamador é este:
 *
 * | função | onde, aqui |
 * |---|---|
 * | `enderecoDeEnvio` | primeira linha de `avisar`, **no instante do envio** |
 * | `revogarPorTokenRecusado` | quando o transporte devolve `aparelho-sumiu` |
 *
 * A terceira, `contasAlcancaveisPorPush`, **não é chamada daqui e não tem
 * chamador**, e isso precisa estar escrito em voz alta em vez de descoberto
 * depois. Ela responde os critérios 1 e 4 do ADR-0006 sobre uma lista de
 * candidatos; a consulta de alcance da BICHUS-20 responde os mesmos dois
 * critérios dentro do próprio `WHERE`, com um `EXISTS` sobre a mesma tabela e
 * o mesmo predicado. Usar as duas seria filtrar por push **depois** de já ter
 * cortado os 500 mais próximos, e o corte tem de ser o último passo: cortar
 * antes entregaria 430 destinatários dizendo 500, com 70 elegíveis de fora. A
 * alternativa — não cortar na consulta e filtrar a lista inteira aqui — tira o
 * teto do banco e traz uma região densa inteira para a memória do worker.
 *
 * ## `avisar` não estoura, e isso é o contrato dela
 *
 * Um aparelho que falha não pode derrubar o alerta dos outros 499. Todos os
 * desfechos viram valor de retorno, inclusive os dois erros que este caminho
 * conhece: `PushNaoEnviadoError`, que o transporte produz, e
 * `VazamentoNoPushError`, que a porteira do conteúdo produz quando o texto
 * carrega algo parecido com dado pessoal. O segundo é falha nossa e não do
 * caminho, e por isso sai no log com o campo e o padrão — **nunca com o
 * valor**, que é exatamente o dado que não pode ser copiado para lugar nenhum.
 */
import {
  montarMensagemDePush,
  VazamentoNoPushError,
} from '../../domain/conteudo-do-push.js';
import { PushNaoEnviadoError, type PushSender, type TokenDeAparelho } from '../../ports/push-sender.js';
import type { RegistroDeAparelhos } from '../../ports/registro-de-aparelhos.js';
import type {
  AvisoDeVizinhanca,
  EntregaDoAlerta,
  ResultadoDaEntrega,
} from '../../../lostfound/ports/entrega-do-alerta.js';

/**
 * Código da espécie em palavra, para "Um **cão** sumiu perto de você".
 *
 * A tradução mora aqui e não em `lostfound` porque é texto de produto, e texto
 * de produto tem uma fonte só. A espécie desconhecida cai em `pet`, que é o
 * mesmo padrão que `conteudo-do-push.ts` já usa quando ela não vem: dizer
 * "Um other sumiu perto de você" seria vazar vocabulário de banco para a tela
 * de bloqueio de alguém.
 */
const ESPECIE_POR_EXTENSO: Readonly<Record<string, string>> = {
  dog: 'cão',
  cat: 'gato',
};

export interface DependenciasDaEntregaDoAlerta {
  /** Só `enderecoDeEnvio`: este caminho não lista, não registra e não remove. */
  readonly aparelhos: Pick<RegistroDeAparelhos, 'enderecoDeEnvio'>;
  readonly push: PushSender;
  /**
   * A revogação **pelo serviço**, e não pelo repositório.
   *
   * O repositório apaga a linha; o serviço apaga e grava `device.revoked` na
   * trilha com o motivo. Como a linha some, a trilha é a única memória de por
   * que aquele aparelho parou de receber — e "por que a Marina parou de
   * receber?" é a pergunta que ninguém consegue responder depois de uma
   * revogação silenciosa.
   */
  readonly revogarPorTokenRecusado: (token: TokenDeAparelho) => Promise<boolean>;
}

export function criarEntregaDoAlertaPorPush(
  deps: DependenciasDaEntregaDoAlerta,
): EntregaDoAlerta {
  return {
    async avisar(aviso: AvisoDeVizinhanca): Promise<ResultadoDaEntrega> {
      // **No instante do envio**, e não carregado junto da lista. O disparo
      // levou minutos para chegar até aqui, e nesse intervalo a pessoa pode ter
      // saído da conta ou removido o aparelho pelo Perfil. `null` é "não mande",
      // e quem chama segue para o aparelho seguinte.
      const token = await deps.aparelhos.enderecoDeEnvio(aviso.aparelhoId);
      if (token === null) return 'semEndereco';

      let mensagem;
      try {
        const conteudo = montarMensagemDePush({
          tipo: 'alertaDeVizinhanca',
          token,
          nomeDoPet: aviso.nomeDoPet,
          tokenPublico: aviso.tokenPublico,
          ...(aviso.bairro === null ? {} : { bairro: aviso.bairro }),
          ...(aviso.especieCodigo === null
            ? {}
            : { especie: ESPECIE_POR_EXTENSO[aviso.especieCodigo] ?? 'pet' }),
          ...(aviso.imagemUrl === undefined ? {} : { imagemUrl: aviso.imagemUrl }),
        });
        mensagem = {
          token,
          ...conteudo,
          ...(aviso.imagemUrl === undefined ? {} : { imagemUrl: aviso.imagemUrl }),
        };
      } catch (erro: unknown) {
        if (erro instanceof VazamentoNoPushError) {
          // O campo e o padrão, nunca o valor. Ver o cabeçalho de
          // `VazamentoNoPushError`: um log que diga só "vazamento" manda alguém
          // procurar em quatro strings, e um que copie o valor põe no log
          // exatamente o dado que a porteira acabou de impedir de sair.
          console.error(
            JSON.stringify({
              evento: 'alert.push_bloqueado',
              campo: erro.campo,
              padrao: erro.padrao,
            }),
          );
          return 'falhou';
        }
        throw erro;
      }

      try {
        const resultado = await deps.push.enviar(mensagem);
        if (resultado === 'aparelho-sumiu') {
          // Higiene de token do ADR-0008, no momento exato em que o transporte
          // diz que o endereço morreu. Adiar isto para uma varredura deixaria o
          // aparelho na conta rendendo tentativas até alguém rodar a varredura.
          await deps.revogarPorTokenRecusado(token);
          return 'aparelhoSumiu';
        }
        return 'aceito';
      } catch (erro: unknown) {
        if (erro instanceof PushNaoEnviadoError) {
          // `retentavel` sai no log porque quem lê é quem investiga: cota
          // estourada e transporte fora do ar contam uma história, mensagem
          // malformada conta outra. O token não entra — ele identifica uma
          // instalação e é o endereço para onde mandar qualquer coisa.
          console.error(
            JSON.stringify({
              evento: 'alert.push_nao_enviado',
              motivo: erro.motivo,
              retentavel: erro.retentavel,
            }),
          );
          return 'falhou';
        }
        throw erro;
      }
    },
  };
}
