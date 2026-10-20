/**
 * A conversa mediada, como regra — sem servidor, sem banco e sem rede.
 *
 * ## O que o título da história decide, e este arquivo cumpre
 *
 * "Sem telefone e sem endereço." A conversa existe justamente para que o tutor
 * não precise publicar o número dele e o achador não precise dizer onde mora.
 * A consequência de desenho é a que está escrita aqui: **a projeção de cada
 * lado é montada campo a campo**, e cada campo que existe nela foi uma decisão.
 * Não existe neste arquivo, e não pode passar a existir, um caminho por onde
 * telefone, e-mail, endereço ou **identificador interno de conta** atravesse de
 * um lado para o outro. Se a mediação dependesse de alguém lembrar de não
 * incluir o campo, ela seria uma convenção; aqui ela é a única forma
 * exprimível.
 *
 * **Eram dois campos (papel e nome) até 19/10/2026, e agora são quatro.** A
 * emenda 3 do ADR-0010 é decisão do cliente e tem escopo fechado: *"a foto
 * aparece SÓ quando as duas pessoas já aceitaram conexão"*. Entraram o
 * **apelido** e a **chave da foto** do OUTRO lado, e as duas chegam aqui JÁ
 * recortadas pela cláusula `WHERE` da consulta: fora da conexão aceita elas são
 * nulas, e este arquivo não tem como pedi-las de novo.
 *
 * **O apelido não é o identificador que a frase acima proíbe.** Ele é alias
 * público, escolhido pela pessoa e mutável (*"slug não tem relação com
 * informações pessoais, e é um id que o usuário escolhe"*, cliente 18/10/2026);
 * o que continua sem campo aqui é `users.id`, `users.public_ref` e qualquer
 * UUID. E ele não reabre o item 7 do ADR-0010 (agrupar os pets de um mesmo
 * tutor) no caminho que aquele item protege: o estranho que escaneou a
 * plaquinha **não** é conexão aceita, e para ele o apelido é nulo — duas
 * plaquinhas escaneadas por duas pessoas diferentes continuam sem nada que as
 * ligue ao mesmo dono.
 *
 * ## Por que o nome de exibição é cortado no primeiro termo
 *
 * `users.display_name` guarda o que a pessoa escreveu no cadastro, e a maioria
 * escreve o nome inteiro. O contrato promete, no schema de `participants`:
 * *"Primeiro nome ou apelido. **Nunca** sobrenome completo"*. Sobrenome é
 * identificação por outro caminho — com o bairro do escaneamento na mesma tela,
 * "Leandro Panegassi" e "Leandro" não são a mesma exposição. O corte acontece
 * aqui, no domínio, e não na consulta: a consulta muda quando alguém precisa de
 * outra coluna, e a promessa não pode mudar junto.
 */

/** Os dois lados humanos, mais o Bichu falando. */
export type Papel = 'tutor' | 'finder' | 'system';

/** Os três valores que o contrato declara em `Conversation.status`. */
export type EstadoDaConversa = 'open' | 'blocked' | 'closed';

export interface SinaisDeEstado {
  /** Encerramento próprio da conversa. */
  readonly encerradaEm: Date | null;
  /** Bloqueio, escrito pela BICHUS-40. */
  readonly bloqueadaEm: Date | null;
  /** O caso ligado deixou de estar aberto. Falso quando não há caso. */
  readonly casoEncerrado: boolean;
  /**
   * Um dos dois lados desabilitou a conta (17/10).
   *
   * Vem de `users.deleted_at` das duas pontas da conversa, lido pela consulta.
   * É `true` para QUALQUER dos dois lados, e a simetria é a decisão do cliente
   * lida por extenso: *"bloquear o chat para não enviar ou receber mais nenhuma
   * nova mensagem"*. "Não receber" só é alcançável travando quem ESCREVE, e
   * quem escreve é o outro participante -- um chat em que o lado ativo ainda
   * manda entrega mensagem a alguém que não está mais na plataforma.
   */
  readonly participanteDesabilitado: boolean;
}

/**
 * O estado, derivado. Não existe coluna `status`, e a ausência é deliberada:
 * duas fontes para "esta conversa acabou" divergem no primeiro caminho que
 * esquecer de atualizar uma delas.
 *
 * **`closed` ganha de `blocked` quando os dois valem**, e a ordem não é
 * arbitrária: o encerramento carrega a explicação que a pessoa precisa ler
 * (critério 8, "modo leitura com a explicação do encerramento"), e o bloqueio
 * já obteve o que ele existe para obter — ninguém mais escreve ali — por
 * qualquer um dos dois caminhos.
 */
export function estadoDaConversa(sinais: SinaisDeEstado): EstadoDaConversa {
  // PRIMEIRO DE TODOS, e por isso a conversa fica em modo leitura: conta
  // desabilitada é `closed` e não `blocked`, pelo mesmo critério 8 que a ordem
  // original já aplica -- `closed` é o estado que carrega explicação na tela, e
  // é exatamente isso que o outro lado precisa ler. `blocked` diria "alguém te
  // bloqueou", que é falso e é a informação que a política de
  // `problemas.conversaEncerrada()` existe para NÃO dar.
  //
  // Nada é escrito no banco para isto. `conversations.closed_at` continua nulo,
  // e o estado é DERIVADO de `users.deleted_at` a cada leitura: reativar a conta
  // devolve a conversa ao ar sem desfazer gravação nenhuma. Escrever `closed_at`
  // aqui exigiria um `closure_reason` novo (o CHECK da `20260922000012` só aceita
  // três) e seria uma marca a desfazer depois.
  if (sinais.participanteDesabilitado) return 'closed';
  if (sinais.encerradaEm !== null || sinais.casoEncerrado) return 'closed';
  if (sinais.bloqueadaEm !== null) return 'blocked';
  return 'open';
}

/** Só `open` aceita mensagem nova. Os outros dois são modo leitura. */
export function aceitaMensagem(estado: EstadoDaConversa): boolean {
  return estado === 'open';
}

/**
 * Primeiro termo do nome, ou o rótulo neutro quando não há nome.
 *
 * Corta em espaço e devolve no máximo 40 caracteres. Quem preencheu só o
 * apelido continua sendo chamado pelo apelido; quem preencheu o nome inteiro é
 * apresentado pelo primeiro nome, que é o que o contrato promete.
 */
export function primeiroNomeOuApelido(nome: string | null, padrao: string): string {
  const limpo = (nome ?? '').trim();
  if (limpo === '') return padrao;
  const primeiro = limpo.split(/\s+/u)[0] ?? '';
  if (primeiro === '') return padrao;
  return primeiro.slice(0, 40);
}

/**
 * Como o contrato declara cada item de `participants`.
 *
 * **Eram dois campos até 19/10/2026, e agora são quatro** — pela emenda 3 do
 * ADR-0010, que é decisão do cliente e tem escopo fechado: *"a foto aparece SÓ
 * quando as duas pessoas já aceitaram conexão"*.
 *
 * Os dois novos são **nulos em todo estado que não seja conexão aceita**, e
 * nulos SEMPRE no lado de quem chama: ninguém precisa do próprio apelido nem da
 * própria foto para ler a conversa, e mandá-los seria uma terceira superfície
 * da foto do dono sem nenhum consumidor — cada superfície nova de foto de
 * pessoa é uma a mais para alguém esquecer de proteger.
 */
export interface ParticipanteVisivel {
  readonly role: Exclude<Papel, 'system'>;
  readonly displayName: string;
  /**
   * O apelido deste participante, **só quando ele é o OUTRO lado E é conexão
   * aceita de quem chama**. Nulo em todo o resto.
   *
   * É ele que dá ENDEREÇO ao toque no ícone: o perfil de outra pessoa é
   * `getPersonProfile`, endereçado pelo apelido. Nunca `public_ref`, nunca UUID
   * (ADR-0010 item 6).
   */
  readonly handle: string | null;
  /**
   * A CHAVE da derivada `thumb` da foto deste participante, pela mesma regra.
   *
   * Chave e não URL: a URL é montada na borda, com o domínio de mídia do
   * ambiente. É a mesma divisão de `FotoDoPerfilDeOutraPessoa`.
   */
  readonly photoKey: string | null;
}

export interface NomesDaConversa {
  /** `users.display_name` do tutor, como ele cadastrou. */
  readonly nomeDoTutor: string | null;
  /** `found_reports.finder_display_name`, opcional por desenho do produto. */
  readonly nomeDoAchador: string | null;
  /** `users.deleted_at` do tutor não é nulo (17/10). */
  readonly tutorDesabilitado: boolean;
  /** `users.deleted_at` do achador COM CONTA não é nulo (17/10). */
  readonly achadorDesabilitado: boolean;
  /**
   * **De que lado está quem chama.** Sai da consulta (`papel_do_chamador`), e
   * não de um `if`.
   *
   * Ele entrou aqui com a emenda 3: o apelido e a foto são do **outro** lado, e
   * sem saber qual é o lado de quem chama não há como dizer em qual dos dois
   * itens eles entram. Obrigatório e não opcional de propósito — um default
   * silencioso poria a foto do lado errado, que é afirmar que uma pessoa é
   * outra.
   */
  readonly papelDoChamador: Exclude<Papel, 'system'>;
  /**
   * O apelido do OUTRO lado, **já recortado pela cláusula `WHERE` da consulta**
   * (conexão aceita, par não bloqueado, as duas contas habilitadas).
   *
   * Nulo é o valor de todo o resto, e esta função **não repete o recorte**: dois
   * lugares decidindo a mesma coisa divergem no primeiro que alguém ajustar, e
   * o que o segundo lugar faria aqui é esconder o que o primeiro deixou passar
   * — isto é, transformar um defeito de autorização num defeito invisível.
   */
  readonly apelidoDoOutro: string | null;
  /** A chave da derivada `thumb` da foto do OUTRO lado, pela mesma regra. */
  readonly chaveDaFotoDoOutro: string | null;
}

/**
 * Os participantes, montados campo a campo.
 *
 * O objeto devolvido **não tem id**, e isso é a regra e não um esquecimento. O
 * item 7 do ADR-0010 proíbe qualquer coisa que permita agrupar os pets de um
 * mesmo tutor, e um identificador estável do tutor aqui faria exatamente isso:
 * duas plaquinhas escaneadas por duas pessoas diferentes passariam a ser
 * reconhecíveis como do mesmo dono. O primeiro nome não fecha essa porta
 * sozinho, e é por isso que ele é o teto e não o piso do que sai.
 */
export function participantesVisiveis(nomes: NomesDaConversa): readonly ParticipanteVisivel[] {
  // A DESPERSONALIZAÇÃO É AQUI, e ela não inventa nada: o lado desabilitado
  // entra como se nunca tivesse preenchido nome, e `primeiroNomeOuApelido` já
  // devolve o rótulo neutro que o produto usa desde sempre -- `Tutor` e
  // `Quem achou`. O cliente pediu o nome "que não identifique" junto do avatar
  // cinza, e este é o rótulo que o próprio sistema já escolheu para "sem nome".
  //
  // O NOME NÃO SAI DO BANCO ESCONDIDO POR UM `if` DE TELA: ele é substituído no
  // domínio, que é o único ponto por onde as DUAS vistas passam -- a do chamador
  // com conta (`conversation-service.ts`) e a do achador por token
  // (`conversa-do-achador.ts`). Despersonalizar em cada montagem de resposta
  // seria perder um dos dois caminhos, e o caminho do achador é justamente o que
  // não pede login.
  //
  // SOBRE O AVATAR, e esta nota mudou em 19/10/2026: a foto EXISTE agora, e
  // existe num estado só -- conexão aceita (emenda 3 do ADR-0010). O que não
  // mudou é o lado desabilitado: ele perde o nome aqui, e perde a foto na
  // CONSULTA, porque `conta_habilitada` das duas pontas está dentro do próprio
  // predicado de conexão aceita. Então o lado que saiu continua
  // despersonalizado nos dois campos, sem um único `if` a mais aqui.
  //
  // E continua não havendo foto para o resto: conversa de achado com um
  // estranho, pedido pendente, recusa, par bloqueado e achador sem conta
  // recebem `photoKey` nulo, e a tela desenha a inicial -- que é o que está lá
  // hoje.
  const tutor = nomes.tutorDesabilitado ? null : nomes.nomeDoTutor;
  const achador = nomes.achadorDesabilitado ? null : nomes.nomeDoAchador;
  // O APELIDO E A FOTO SÃO DO OUTRO LADO, E DE MAIS NENHUM (emenda 3 do
  // ADR-0010, 19/10/2026). O lado de quem chama recebe os dois nulos, e isso
  // não é economia: a própria foto do dono já sai em `getMe`, e repeti-la aqui
  // seria uma terceira superfície dela sem nenhum consumidor.
  //
  // O RECORTE NÃO ESTÁ AQUI, e a ausência é deliberada: `apelidoDoOutro` e
  // `chaveDaFotoDoOutro` chegam JÁ recortados pela cláusula `WHERE` da consulta
  // (ADR-0021) — conexão aceita, par não bloqueado, as duas contas habilitadas,
  // foto `ready`. Um `if` de conexão aqui seria o segundo lugar onde a regra
  // mora, e o segundo é o que alguém esquece de repetir no terceiro caminho.
  const doOutro = (papel: Exclude<Papel, 'system'>) =>
    papel === nomes.papelDoChamador
      ? { handle: null, photoKey: null }
      : { handle: nomes.apelidoDoOutro, photoKey: nomes.chaveDaFotoDoOutro };
  return [
    {
      role: 'tutor',
      displayName: primeiroNomeOuApelido(tutor, 'Tutor'),
      ...doOutro('tutor'),
    },
    {
      role: 'finder',
      displayName: primeiroNomeOuApelido(achador, 'Quem achou'),
      ...doOutro('finder'),
    },
  ];
}

/**
 * O teto da prévia da última mensagem, em caracteres.
 *
 * 140 e não 1000: a linha da lista mostra UMA linha, e mandar o corpo inteiro
 * de cada uma das vinte conversas da página seria trafegar 20 KB para pintar
 * 20 linhas de texto cortado na tela.
 */
export const TETO_DA_PREVIA = 140;

/**
 * A prévia da última mensagem, para a linha da lista.
 *
 * ## A PRÉVIA NÃO DESFAZ A REDAÇÃO, e a garantia é estrutural
 *
 * O argumento desta função é `conversation_messages.body`, que **já está
 * redigido no banco** — telefone, e-mail, endereço e link saíram do texto antes
 * de ele ser gravado, e a migração da conversa mediada diz isso por extenso: *"O
 * TEXTO JÁ REDIGIDO. Nunca o que a pessoa digitou"*. O texto cru **não existe em
 * coluna nenhuma**.
 *
 * Então a prévia não pode vazar o que a redação esconde, e não por disciplina de
 * quem escreveu a consulta: não há, no banco, de onde desfazer. É a mesma razão
 * pela qual esta função recebe uma string e não um id — ela não tem como ir
 * buscar outra versão do texto.
 *
 * **O que seria o erro, e está nomeado para não ser cometido:** o recado que o
 * achador digita no formulário do aviso vive em `found_reports.notes`, **em
 * claro** — a coluna nasceu antes da redação, e é o serviço que redige aquele
 * texto ao montar a mensagem de abertura. Uma prévia montada a partir de
 * `found_reports.notes` publicaria na LISTA exatamente o telefone que a conversa
 * existe para não deixar passar, e passaria por todos os testes que olhassem
 * apenas a conversa aberta. A prévia sai de `conversation_messages.body`, e só.
 *
 * Corta no limite de caracteres sem tentar fechar palavra: cortar na palavra
 * faria o fim da prévia variar com o conteúdo, e um "…" depois de um espaço é
 * mais confuso que depois de uma letra.
 */
export function previaDaMensagem(corpo: string): string | null {
  // Espaço em branco colapsado: a mensagem de abertura tem quebra de linha, e
  // sem isto a prévia sairia com `\n` no meio e a linha da lista cresceria.
  const limpo = corpo.replace(/\s+/gu, ' ').trim();
  if (limpo === '') return null;
  if (limpo.length <= TETO_DA_PREVIA) return limpo;
  return `${limpo.slice(0, TETO_DA_PREVIA - 1).trimEnd()}…`;
}

/**
 * O que a barra de topo pinta no sino. **Apresentação, e nada mais.**
 *
 * O contador na resposta é o número REAL, sem teto, porque um teto no corpo
 * impediria qualquer outra superfície de dizer a verdade. O corte em `9+` é
 * daqui: três dígitos comem o espaço do título na barra.
 *
 * Zero devolve nulo e não `'0'`: o sino sem nada não desenha distintivo. Um
 * `0` pintado é pior que nada — ele chama o olho para dizer que não há motivo.
 */
export function selarContador(naoLidas: number): string | null {
  if (naoLidas <= 0) return null;
  return naoLidas > 9 ? '9+' : String(naoLidas);
}
