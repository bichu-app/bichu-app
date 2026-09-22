/**
 * Regras de sessão. Puras: nada aqui conhece banco, HTTP nem relógio do sistema.
 *
 * Os quatro números estão em `docs/04-seguranca.md` 7.5 e chegam pela
 * configuração. O que este arquivo carrega é a **regra**, e ela tem um ponto
 * contraintuitivo: como a rotação renova o prazo, 30 e 180 dias são janela de
 * **inatividade**, não teto. Um refresh roubado e usado a cada 6 dias viveria
 * para sempre. O teto absoluto desde a autenticação com senha é o número que
 * fecha essa porta, e ele é constante ao longo da família inteira — renová-lo na
 * rotação seria não ter teto nenhum.
 *
 * Tudo aqui fala em `Instant`, que é milissegundo desde a época, e nunca em
 * `Date`: construir data é trabalho do adaptador de persistência. O domínio não
 * pode nem chamar `new Date()`, e a proibição é imposta por lint
 * (src/architecture.rules.mjs) porque sem ela não há como testar, sem esperar, o
 * que o produto depende de tempo.
 */
import type { Instant } from '../../../shared/types/brands.js';

export interface JanelasDeSessao {
  readonly idleTtlSeconds: number;
  readonly staySignedInIdleTtlSeconds: number;
  readonly absoluteTtlSeconds: number;
}

export interface PrazosDoRefresh {
  /** Vence por inatividade; a rotação empurra este. */
  readonly expiresAt: Instant;
  /** Teto desde a autenticação com senha; a rotação **não** empurra este. */
  readonly absoluteExpiresAt: Instant;
}

function janelaDeInatividade(janelas: JanelasDeSessao, continuarConectado: boolean): number {
  return continuarConectado ? janelas.staySignedInIdleTtlSeconds : janelas.idleTtlSeconds;
}

export function prazosDeNovaFamilia(
  agora: Instant,
  janelas: JanelasDeSessao,
  continuarConectado: boolean,
): PrazosDoRefresh {
  const inatividade = janelaDeInatividade(janelas, continuarConectado);
  return {
    expiresAt: (agora + inatividade * 1000) as Instant,
    absoluteExpiresAt: (agora + janelas.absoluteTtlSeconds * 1000) as Instant,
  };
}

/**
 * Prazos do token que substitui outro na rotação. O teto absoluto é **herdado**,
 * e a inatividade nunca ultrapassa o teto: sem esse mínimo, o token novo diria
 * valer mais do que a família inteira.
 */
export function prazosDeRotacao(
  agora: Instant,
  janelas: JanelasDeSessao,
  absolutoHerdado: Instant,
  continuarConectado: boolean,
): PrazosDoRefresh {
  const porInatividade = agora + janelaDeInatividade(janelas, continuarConectado) * 1000;
  return {
    expiresAt: Math.min(porInatividade, absolutoHerdado) as Instant,
    absoluteExpiresAt: absolutoHerdado,
  };
}

export function segundosRestantes(agora: Instant, ate: Instant): number {
  return Math.max(0, Math.floor((ate - agora) / 1000));
}

/**
 * SEC-006. O token de acesso é verificado offline pela assinatura e continuaria
 * valendo até o `exp`; comparar o `iat` com `sessions_invalid_before` é o que faz
 * logout total, troca de senha, redefinição, "Não fui eu" e exclusão de conta
 * terem efeito em **menos de um segundo** em vez de em até 15 minutos.
 *
 * A comparação arredonda a revogação para cima, ao segundo inteiro, porque `iat`
 * tem granularidade de segundo: um token emitido no mesmo segundo da revogação
 * precisa cair do lado revogado. Se o empate passasse, sobraria uma janela de um
 * segundo — que é exatamente a que quem tomou a conta usa, porque ele está
 * renovando em laço no momento em que a vítima troca a senha.
 */
export function tokenFoiRevogado(iatEmSegundos: number, sessionsInvalidBefore: Instant): boolean {
  return iatEmSegundos * 1000 < Math.ceil(sessionsInvalidBefore / 1000) * 1000;
}

/**
 * SEC-006 do lado do **refresh**, que é a metade que faltava.
 *
 * `tokenFoiRevogado` protege o token de acesso, e sozinha ela não expulsa
 * ninguém: quem tem o refresh copiado chama `POST /v1/auth/refresh`, recebe um
 * token de acesso novo com `iat = agora`, e esse token passa pela barreira sem
 * esforço. A vítima trocou a senha — que é exatamente o gesto que o produto
 * oferece para expulsar o invasor — e o invasor continuou dentro, renovando
 * indefinidamente. A troca de senha prometia uma coisa e entregava outra.
 *
 * O refresh que **nasceu antes** da barreira morre com ela. Isso vale para
 * todos os gatilhos do SEC-006 e não só para a redefinição de senha, porque o
 * que se lê é a coluna, e não o motivo que a empurrou.
 *
 * **A comparação é estrita, e a diferença para `tokenFoiRevogado` é o ponto
 * mais fácil de errar deste arquivo.** Lá a barreira é arredondada **para
 * cima** ao segundo, e o arredondamento não é margem de segurança: ele existe
 * para compensar o `iat` do JWT, que tem granularidade de segundo e é
 * `floor(instante / 1000)`. Um token emitido em 20,734 s declara `iat = 20`, e
 * sem o arredondamento ele pareceria anterior a uma barreira de 20,734 s que na
 * verdade veio depois dele.
 *
 * Aqui não há truncamento nenhum a compensar: `issued_at` e
 * `sessions_invalid_before` são os dois `timestamptz` em milissegundo, gravados
 * pelo **mesmo relógio da aplicação**. Copiar o `Math.ceil` de lá recusaria todo
 * refresh emitido no mesmo segundo da revogação — e quem emite um refresh logo
 * depois de uma redefinição é a pessoa que acabou de retomar a conta. Seria o
 * defeito de BICHUS-132 renascido na outra ponta: ela entraria, e cairia na
 * primeira renovação.
 *
 * O empate (`issuedAt === sessionsInvalidBefore`) fica do lado que **sobrevive**,
 * e isso não devolve nada a quem tomou a conta: a linha dele foi gravada
 * estritamente antes da redefinição, porque a redefinição é o que veio depois.
 */
export function refreshFoiRevogado(issuedAt: Instant, sessionsInvalidBefore: Instant): boolean {
  return issuedAt < sessionsInvalidBefore;
}

/**
 * A barreira do SEC-006 para uma conta **recém-criada**, truncada ao segundo.
 *
 * Criar conta não é revogar sessão, e tratar as duas do mesmo jeito produzia um
 * defeito de 100% de reprodução na PRIMEIRA TELA DO PRODUTO: `POST
 * /v1/auth/register` devolvia um `access_token` que **nunca funcionava**.
 *
 * A aritmética, com números reais medidos em 18/09:
 *
 * ```
 * conta criada em          1789734320,734 s
 * sessions_invalid_before  1789734320734 ms  -> arredonda para 1789734321000
 * iat do token emitido     1789734320   s    -> vira        1789734320000
 * 1789734320000 < 1789734321000  ->  REVOGADO
 * ```
 *
 * O arredondamento para cima em `tokenFoiRevogado` está **certo** e continua:
 * ele fecha a janela de um segundo que quem tomou a conta usaria, renovando em
 * laço no momento em que a vítima troca a senha. O erro era a conta nascer com
 * uma marca de revogação de precisão de milissegundo, quando o `iat` que ela vai
 * comparar tem precisão de segundo. Truncar para baixo iguala as duas escalas.
 *
 * A garantia original não se perde: continua impossível existir token anterior
 * à criação da conta, porque antes daquele segundo a conta não existia — e
 * revogação de verdade (`invalidarTodasAsSessoes`) mantém a precisão cheia, com
 * o empate caindo do lado revogado, como o SEC-006 exige.
 */
export function barreiraDeContaNova(agora: Instant): Instant {
  return (Math.floor(agora / 1000) * 1000) as Instant;
}

/**
 * O instante com que o token de acesso deve ser EMITIDO para que ele não nasça
 * recusado pela própria barreira do SEC-006 (BICHUS-132).
 *
 * Quem sofria é a pessoa que está recuperando uma conta tomada: ela redefine a
 * senha, entra no mesmo segundo, e leva "sua sessão terminou" na primeira tela.
 * Tenta de novo e funciona — mas já levou o susto no pior momento possível, e
 * algumas concluem que a conta continua nas mãos de outra pessoa.
 *
 * A aritmética, com a redefinição caindo em 20,734 s:
 *
 * ```
 * sessions_invalid_before  1789734320734 ms -> arredonda para 1789734321000
 * iat do token emitido     1789734320    s  -> vira          1789734320000
 * 1789734320000 < 1789734321000  ->  REVOGADO, recém-emitido
 * ```
 *
 * Esta função é a **inversa exata** de {@link tokenFoiRevogado}: devolve o menor
 * instante cujo `iat` (que é `floor(instante / 1000)`) sobrevive à barreira. Na
 * prática, a emissão espera a virada do segundo — sem segurar a requisição, que
 * é o que um `sleep` faria justamente na tela de recuperação de conta.
 *
 * O token sai, então, com `iat` até um segundo à frente do relógio. Isso só é
 * possível porque a verificação tolera relógio adiantado (`clockToleranceSeconds`,
 * hoje 60 s em `shared/config/app-config.ts`): com tolerância zero, o próprio
 * emissor recusaria o token como `emitido_no_futuro` e o defeito voltaria com
 * outro nome. Quem for mexer naquele número precisa passar por aqui.
 *
 * **O arredondamento para cima de `tokenFoiRevogado` continua intocado.** Ele é
 * quem fecha a janela de um segundo que quem tomou a conta usaria, renovando em
 * laço no momento em que a vítima troca a senha. Quem se move é a emissão, e só
 * ela: o lado revogado não afrouxa em nada.
 *
 * **Não é o caso de `barreiraDeContaNova`, e copiar de lá seria um defeito.**
 * Truncar para baixo é seguro na criação de conta porque antes daquele segundo
 * a conta não existia, então não pode haver token anterior. Na redefinição pode
 * haver: truncar devolveria ao invasor exatamente a janela que o arredondamento
 * existe para tirar. Aqui nada é truncado — o que muda é de que lado da barreira
 * o token NOVO nasce.
 *
 * Só deve ser usada onde a **senha acabou de ser verificada** (cadastro e
 * login). Aplicar isto na rotação de refresh daria o empurrão a quem só
 * apresentou um refresh, e não a senha nova — ver `abrirSessao`.
 */
export function instanteDeEmissaoDoAcesso(
  agora: Instant,
  sessionsInvalidBefore: Instant,
): Instant {
  return Math.max(agora, Math.ceil(sessionsInvalidBefore / 1000) * 1000) as Instant;
}

/**
 * O instante que a revogação deve GRAVAR em `sessions_invalid_before` para que
 * ela alcance **todo** token de acesso já emitido — inclusive o que
 * {@link instanteDeEmissaoDoAcesso} datou à frente do relógio.
 *
 * ## O defeito que esta função existe para fechar
 *
 * `instanteDeEmissaoDoAcesso` faz o token nascer com `iat` na virada do segundo
 * seguinte à barreira. Um token assim é **imune a qualquer revogação que caia
 * antes daquela virada**, porque `tokenFoiRevogado` compara segundo com segundo:
 *
 * ```
 * revogação 1 em            1790046155288 ms -> barreira 1790046156000
 * login no mesmo segundo    iat = 1790046156  (empurrado pela emissão)
 * revogação 2 em            1790046155900 ms -> barreira 1790046156000
 * 1790046156000 < 1790046156000  ->  FALSO: o token sobreviveu à revogação 2
 * ```
 *
 * Quem paga é a pessoa cuja conta foi tomada. Ela clica em "não fui eu", o
 * invasor entra de novo no mesmo segundo com a senha que ele já tinha, e a
 * troca de senha que vem logo em seguida — o gesto que o produto oferece para
 * expulsá-lo — **não o expulsa**. O token dele vale mais quinze minutos, que é
 * tempo de sobra para transferir o pet e trocar o e-mail de contato.
 *
 * ## A conta
 *
 * O maior instante com que um token pôde ser emitido desde a última revogação é
 * exatamente `instanteDeEmissaoDoAcesso(agora, barreiraAtual)`. Gravar **um
 * milissegundo além dele** garante que a barreira arredondada para cima passe do
 * `iat` daquele token, e a garantia vale para qualquer token emitido antes, que
 * é mais velho ainda.
 *
 * ## Por que não é simplesmente `agora + 1`
 *
 * Porque no caso de todo dia não pode mudar nada. Quando a última revogação é
 * antiga — a esmagadora maioria das contas nunca teve nenhuma — o empurrão fica
 * abaixo de `agora`, e o que se grava é `agora`, ao milissegundo, exatamente
 * como antes. Isso preserva duas coisas que não são desta correção:
 *
 * - **BICHUS-132.** A barreira da redefinição continua caindo no mesmo lugar, e
 *   quem entra no mesmo segundo continua entrando.
 * - **O empate do lado do refresh** (`refreshFoiRevogado`, BICHUS-77). Lá a
 *   comparação é em milissegundo e estrita, e o refresh nascido no mesmo
 *   milissegundo da barreira sobrevive. Gravar `agora + 1` por padrão mataria
 *   esse empate sem que ninguém tivesse decidido isso.
 *
 * ## O que ela custa
 *
 * Cada revogação que cai **dentro do segundo já coberto** por outra empurra a
 * barreira um segundo à frente do relógio. O custo é do mesmo tipo que o de
 * `instanteDeEmissaoDoAcesso`, e tem o mesmo teto: `clockToleranceSeconds`
 * (hoje 60 s). Passar dele exigiria sessenta revogações dentro de um segundo na
 * MESMA conta — cada uma precisa de um link de redefinição enviado por e-mail —
 * e o desfecho seria o emissor recusar os próprios tokens como
 * `emitido_no_futuro`: **fecha, não abre**. Quem mexer naquele número passa
 * aqui e em {@link instanteDeEmissaoDoAcesso}.
 */
export function instanteDeRevogacao(agora: Instant, barreiraAtual: Instant): Instant {
  return Math.max(agora, Math.ceil(barreiraAtual / 1000) * 1000 + 1) as Instant;
}
