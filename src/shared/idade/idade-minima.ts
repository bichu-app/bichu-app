/**
 * A regra da **idade mínima**, num lugar só.
 *
 * Existe por uma decisão do cliente de 18/10/2026, verbatim: *"coloque maiores
 * de 16 anos"*. Antes dela **não havia freio de idade em nenhuma camada** —
 * sem coluna em `users`, sem campo no contrato, sem campo na tela — e a nossa
 * própria política de privacidade afirmava isso por escrito no item 10
 * (*"Hoje o cadastro não confere a idade."*).
 *
 * **A autoridade é este arquivo, e não a tela.** `POST /v1/auth/register` é
 * rota pública (`security: []`): a tela é conveniência, e quem chama a API
 * direto não passa por ela. Validar só no app seria trocar a exigência por uma
 * sugestão — o mesmo raciocínio que `nomeDeExibicaoAparado` já carrega em
 * `auth-service.ts`.
 *
 * ## A IDADE É CALCULADA AQUI, E NUNCA LIDA DO CLIENTE
 *
 * Não existe campo de idade no contrato, e a ausência é deliberada: idade que
 * o cliente informa é idade que o cliente escolhe. O que chega é a **data**, e
 * a conta é feita contra o relógio do servidor.
 *
 * ## O FUSO É `America/Sao_Paulo`, E O MOTIVO É UM DIA
 *
 * O relógio do servidor é UTC. São Paulo está em UTC-3, então entre 21:00 e
 * 00:00 de São Paulo o UTC já está no dia seguinte. Calcular a idade com o dia
 * UTC adiantaria o aniversário de todo mundo em algumas horas e, pior, numa
 * data de corte adiantaria o dia inteiro: quem completa 16 anos amanhã
 * passaria hoje às 21:05.
 *
 * O erro simétrico é o que realmente dói: se o corte fosse calculado para
 * trás, **a pessoa seria recusada no dia do próprio aniversário**. Um dia de
 * erro aqui não é arredondamento, é uma recusa que a pessoa não tem como
 * entender nem contornar.
 *
 * Então a conta é **civil** — ano, mês e dia lidos no fuso do produto — e não
 * uma subtração de instantes. `America/Sao_Paulo` é o fuso que o resto do
 * repositório já trata como o fuso de leitura do produto (`FUSOS_DA_REDE` em
 * `src/bin/massa-da-rede.ts` o traz primeiro, e é o `timeZone` de toda
 * formatação de lá).
 *
 * **O que isto NÃO tenta ser:** o fuso de quem está cadastrando. Alguém
 * cadastrando de Manaus (UTC-4) no dia do aniversário, às 23:30 locais, já é
 * 00:30 em São Paulo e a data de corte virou — o que o favorece, nunca o
 * contrário. Um fuso por conta exigiria campo novo no contrato e não foi
 * pedido; o viés escolhido é o que **aceita** em caso de dúvida.
 *
 * ## OS CÓDIGOS DE RECUSA
 *
 * Três dos quatro são códigos que este repositório já usa: `required` (12
 * chamadas), `in_future` (`lost-case-routes.ts` e `registro-de-achado.ts`) e
 * `out_of_range` (4 chamadas). `too_young` **é novo**, e é novo de propósito:
 * ele é a única recusa desta lista que a tela precisa distinguir das outras
 * para dizer a coisa certa, e empacotá-lo em `out_of_range` faria "você digitou
 * o ano errado" e "você não tem idade para usar o Bichu" chegarem com o mesmo
 * rótulo. O contrato o declara na descrição de `RegisterRequest.birth_date`.
 */
import { problemas } from '../http/errors.js';
import type { Instant } from '../types/brands.js';

/**
 * O fuso em que a conta de aniversário é feita.
 *
 * Trocar esta linha move a data de corte de todo mundo em até um dia. Ela não é
 * configuração: é a definição de "hoje" para o produto.
 */
export const FUSO_DO_PRODUTO = 'America/Sao_Paulo';

/** A idade mínima, em anos completos (cliente, 18/10/2026). */
export const IDADE_MINIMA_EM_ANOS = 16;

/**
 * O piso de plausibilidade, **igual ao `CHECK` da migração**
 * `20261018000005_data-de-nascimento-do-tutor.sql`.
 *
 * Deliberadamente largo: ele não é a regra de idade, é a recusa do que não é
 * data de nascimento de ninguém (`0001-05-03`, o ano digitado com um dígito a
 * mais). A pessoa mais velha de que se tem registro nasceu em 1875, e um piso
 * apertado aqui recusaria gente viva por causa de uma estimativa nossa.
 */
export const ANO_MAIS_ANTIGO_ACEITO = 1900;

/** O campo, como o contrato o nomeia. Uma string só, para as recusas não divergirem. */
const CAMPO = 'birth_date';

/** `YYYY-MM-DD`, e nada mais — a forma que `format: date` promete. */
const FORMA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Ano, mês e dia de um calendário civil. Mês é 1-12, como se lê. */
interface DataCivil {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
}

/**
 * O dia de **hoje** no fuso do produto, lido do instante do relógio.
 *
 * `Intl.DateTimeFormat` com `timeZone` é o que faz a conversão sem tabela de
 * fuso nossa e sem dependência nova: ele carrega o histórico de horário de
 * verão do ICU, que é exatamente o que uma subtração de três horas erraria nos
 * anos em que o Brasil ainda o adotava.
 *
 * `formatToParts` em vez de `format` porque o formato textual varia com a
 * locale e com a versão do ICU; as **partes** são nomeadas e não variam.
 */
export function diaCivilNoFuso(instante: Instant, fuso: string = FUSO_DO_PRODUTO): DataCivil {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instante));

  const valor = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo);
    // Nunca acontece com as três opções pedidas acima. Se acontecer, é o ICU
    // tendo mudado de forma, e **parar é a resposta certa**: seguir com zero
    // calcularia uma idade errada em silêncio, que é o defeito que este
    // arquivo inteiro existe para não ter.
    if (parte === undefined) {
      throw new Error(
        `Intl nao devolveu "${tipo}" para o fuso ${fuso}: sem o dia civil nao da para conferir idade`,
      );
    }
    return Number(parte.value);
  };

  return { ano: valor('year'), mes: valor('month'), dia: valor('day') };
}

/**
 * A idade em **anos completos** de quem nasceu em `nascimento`, no dia `hoje`.
 *
 * A conta é a civil de sempre, e ela é imune a ano bissexto por construção:
 * subtrai os anos e desconta um se o aniversário ainda não chegou neste ano.
 * Nascido em 29/02 completa anos em 28/02 nos anos comuns — que é o que a
 * comparação `(mês, dia)` faz sozinha, sem caso especial.
 */
export function idadeEmAnosCompletos(nascimento: DataCivil, hoje: DataCivil): number {
  const anos = hoje.ano - nascimento.ano;
  const aniversarioJaPassou =
    hoje.mes > nascimento.mes || (hoje.mes === nascimento.mes && hoje.dia >= nascimento.dia);
  return aniversarioJaPassou ? anos : anos - 1;
}

/**
 * Confere a data de nascimento recebida no cadastro e devolve `YYYY-MM-DD`.
 *
 * Lança `problemas.validacao` em cada recusa. A ordem das conferências é a
 * ordem em que elas ajudam: forma, plausibilidade, futuro e só então idade —
 * dizer "você não tem 16 anos" para quem digitou `30/13/2010` manda a pessoa
 * procurar o problema no lugar errado.
 */
export function verificarDataDeNascimento(bruto: unknown, agora: Instant): string {
  if (typeof bruto !== 'string' || bruto.trim().length === 0) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'required',
        message: 'Informe a sua data de nascimento.',
      },
    ]);
  }

  const texto = bruto.trim();
  const casado = FORMA_ISO.exec(texto);
  if (casado === null) {
    throw problemas.validacao([
      { field: CAMPO, code: 'invalid', message: 'Use o formato dia/mês/ano.' },
    ]);
  }

  const ano = Number(casado[1]);
  const mes = Number(casado[2]);
  const dia = Number(casado[3]);

  // A FORMA PASSA E A DATA PODE NÃO EXISTIR: `2010-02-30` casa com a expressão
  // acima. `Date.UTC` normaliza em silêncio (vira 02/03) em vez de recusar,
  // então quem decide é a volta: se o dia que saiu não é o dia que entrou, a
  // data não existe no calendário.
  //
  // `Date.UTC` e não `new Date(texto)`: o construtor de string aplica fuso em
  // algumas formas e não em outras, e aqui não se quer fuso nenhum — isto é
  // aritmética de calendário, não um instante.
  const normalizada = new Date(Date.UTC(ano, mes - 1, dia));
  const existe =
    normalizada.getUTCFullYear() === ano &&
    normalizada.getUTCMonth() === mes - 1 &&
    normalizada.getUTCDate() === dia;
  if (!existe) {
    throw problemas.validacao([
      { field: CAMPO, code: 'invalid', message: 'Confira o dia e o mês: essa data não existe.' },
    ]);
  }

  const nascimento: DataCivil = { ano, mes, dia };
  const hoje = diaCivilNoFuso(agora);

  // O ABSURDO ANTES DO FUTURO, porque `0001-05-03` é as duas coisas erradas e
  // "essa data ainda não chegou" seria uma resposta sem sentido para ela.
  if (ano < ANO_MAIS_ANTIGO_ACEITO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'out_of_range',
        message: 'Confira o ano de nascimento.',
      },
    ]);
  }

  const depoisDeHoje =
    nascimento.ano > hoje.ano ||
    (nascimento.ano === hoje.ano && nascimento.mes > hoje.mes) ||
    (nascimento.ano === hoje.ano && nascimento.mes === hoje.mes && nascimento.dia > hoje.dia);
  if (depoisDeHoje) {
    // Mesmo `code` e mesmo espírito de frase do `last_seen_at` em
    // `lost-case-routes.ts`: *"Essa data ainda não chegou."*
    throw problemas.validacao([
      { field: CAMPO, code: 'in_future', message: 'Essa data ainda não chegou.' },
    ]);
  }

  if (idadeEmAnosCompletos(nascimento, hoje) < IDADE_MINIMA_EM_ANOS) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_young',
        // DIZ A REGRA, e não que o dado é "inválido": a pessoa não errou de
        // digitação, e a saída dela não é corrigir o campo. Esconder o número
        // faria a tela repetir "confira a data" para quem conferiu.
        message: `O Bichu é para quem tem ${IDADE_MINIMA_EM_ANOS} anos ou mais.`,
      },
    ]);
  }

  // Devolve a forma canônica, montada dos números conferidos e não do texto
  // recebido: `2010-1-5` nunca chega aqui (a expressão exige dois dígitos), mas
  // remontar é o que garante que o que vai para o banco é o que foi conferido.
  const doisDigitos = (n: number): string => String(n).padStart(2, '0');
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}
