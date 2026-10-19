/**
 * Porta de persistência do caso de perdido.
 *
 * Mesma decisão do ADR-0021 que vale nas tags, no cadastro e na mídia: **todo
 * método que toca um caso recebe o dono como argumento obrigatório**, e a busca
 * é vinculada. A consulta que devolveria o caso de outro tutor não existe aqui.
 *
 * Consequência intencional: caso de outro tutor responde **404, nunca 403**.
 * E há uma razão a mais neste módulo — um 403 confirmaria que aquele pet está
 * perdido, para quem não deveria saber.
 *
 * Nenhum método devolve coordenada para fora da visão do dono. A projeção
 * pública tem porta própria e carrega `share_token`, nunca `case_id`.
 */
import type {
  CaseId,
  FoundReportId,
  Instant,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

export type StatusDoCaso = 'open' | 'closed_reunited' | 'closed_not_found' | 'closed_false_alarm';
export type DesfechoDoCaso = 'reunited' | 'not_found' | 'false_alarm';
export type CanalDoReencontro = 'tag_scan' | 'bichu_alert' | 'poster_or_link' | 'on_my_own' | 'other';

/** O que o serviço precisa saber ANTES de deixar abrir. Uma consulta só. */
export interface EstadoDoPetParaAbertura {
  readonly existeEhDoTutor: boolean;
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
  readonly temCanalVerificado: boolean;
}

/**
 * O que a prévia precisa, e que a abertura não precisava.
 *
 * A área de referência do tutor é **texto**, e é a única área que o servidor
 * consegue nomear: não há geocodificação no MVP (ADR-0006), então uma coordenada
 * recebida na consulta não vira nome de bairro.
 */
export interface EstadoDoPetParaPrevia extends EstadoDoPetParaAbertura {
  readonly areaDeReferenciaDoTutor: {
    readonly city: string | undefined;
    readonly neighborhood: string | undefined;
  };
}

export interface NovoCaso {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly ownerUserId: UserId;
  readonly lastSeenAt: Instant;
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
  readonly state: string | undefined;
  readonly description: string | undefined;
  readonly shareToPublicList: boolean;
  /** Token opaco. A única chave do caso em superfície pública. */
  readonly shareToken: string;
}

export interface CasoGravado {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly status: StatusDoCaso;
  readonly lastSeenAt: Date;
  /** Falso quando o caso nasceu só com área: a tela usa para explicar a ausência de alerta. */
  readonly hasLocation: boolean;
  readonly areaLabel: string | null;
  readonly description: string | null;
  readonly shareToken: string;
  readonly shareToPublicList: boolean;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  /**
   * O prazo de REABERTURA do encerramento vigente, ou `null` em caso aberto.
   *
   * A coluna existe desde a `20260918000003` e `encerrar` a grava (agora + 7
   * dias), mas **nada a lia**: ela nao estava em `COLUNAS`, nao estava neste
   * tipo e nao saia em resposta nenhuma. O contrato declara
   * `LostCase.reopen_deadline` e promete, em `closeLostCase`, que *"encerrar e
   * reversivel por 7 dias"* -- e sem este campo o aplicativo nao tinha como
   * saber se a janela ainda esta aberta. Quem decide se da para reabrir e este
   * valor, e nao uma conta de 7 dias refeita no cliente: numero de produto
   * recalculado no app envelhece no bolso de quem nao atualiza.
   */
  readonly reopenDeadline: Date | null;
  readonly closureOutcome: DesfechoDoCaso | null;
  readonly closureChannel: CanalDoReencontro | null;
  readonly closureNote: string | null;
}

/**
 * O que o tutor corrige depois de abrir o caso: **onde** e **quando** o pet foi
 * visto pela última vez (`PATCH /v1/lost-cases/{caseId}`).
 *
 * O contrato reusa `LostCaseInput` no corpo do `PATCH`, e com isso `last_seen_at`
 * é obrigatório e o `anyOf` exige ponto **ou** área. Então o *onde* e o *quando*
 * são sempre SUBSTITUÍDOS por inteiro, e não mesclados: quem corrige de um ponto
 * no mapa para "só o bairro" está dizendo que o ponto anterior estava errado, e
 * mantê-lo gravado faria o alerta continuar centrado onde o pet não estava.
 *
 * `descricao` e `listaPublica` são `undefined` quando o corpo não os traz, e aí
 * a coluna **não é tocada**. O contrato não detalha a semântica do `PATCH` para
 * os dois campos opcionais; apagar um texto que o tutor escreveu porque ele
 * mandou só a data nova é perda silenciosa, e a escolha oposta (zerar) não tem
 * nada no documento que a sustente.
 */
export interface AtualizacaoDoCaso {
  readonly caso: CaseId;
  readonly dono: UserId;
  readonly lastSeenAt: Instant;
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
  readonly state: string | undefined;
  /** Ausente, a coluna não é tocada. */
  readonly description: string | undefined;
  /** Ausente, a coluna não é tocada. */
  readonly shareToPublicList: boolean | undefined;
}

export interface LostCaseRepository extends DecisorDeCandidatos {
  /**
   * Tudo que decide a abertura, numa consulta só.
   *
   * Junto e não separado porque as quatro perguntas são feitas sempre, no mesmo
   * instante, e quatro idas ao banco no caminho de alguém em pânico com 11% de
   * bateria é latência que dá para não gastar.
   */
  estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura>;

  /**
   * O mesmo estado, mais a área de referência do tutor. Uma consulta só.
   *
   * **`dono` é obrigatório aqui pelo mesmo motivo de todo o resto deste
   * arquivo**, e não por simetria: `existeEhDoTutor` sai de um `EXISTS` com
   * `owner_user_id = :dono` dentro. A consulta que responderia sobre o pet de
   * outra pessoa não existe, então a prévia de pet alheio é indistinguível da
   * prévia de pet inexistente — que é o 404 do ADR-0021, e aqui ele vale duas
   * vezes: um 403 confirmaria a existência daquele pet a quem não é dono dele.
   */
  estadoParaPrevia(pet: PetId, dono: UserId): Promise<EstadoDoPetParaPrevia>;

  /**
   * Abre o caso.
   *
   * **Pode recusar por corrida**, e é isso que o retorno `null` significa: o
   * índice único parcial do banco garante um caso aberto por pet, e duas
   * requisições simultâneas do mesmo tutor — que é exatamente o que a fila
   * offline produz quando o sinal volta — passariam as duas pela conferência
   * antes de qualquer uma gravar. Quem perde a corrida recebe `null` e vira
   * `pet-already-lost`, que é a verdade.
   */
  abrir(novo: NovoCaso): Promise<CasoGravado | null>;

  /** `null` quando não existe **ou** não é do chamador. São a mesma resposta. */
  buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null>;

  /**
   * Corrige onde e quando o pet foi visto. `null` com o MESMO significado de
   * `encerrar`: o caso não existe, não é do chamador, **ou não está aberto**.
   *
   * `status = 'open'` entra no `WHERE` e não num `if` antes, pela razão de
   * sempre — e aqui ele tem um motivo de produto próprio: corrigir o "visto
   * pela última vez" de um caso encerrado mexeria no dado que a métrica de
   * reencontro já contabilizou, e no cartaz que ninguém mais vai imprimir.
   */
  atualizarOndeEQuando(entrada: AtualizacaoDoCaso): Promise<CasoGravado | null>;

  /** `null` com o mesmo significado. Só encerra caso **aberto**. */
  encerrar(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly desfecho: DesfechoDoCaso;
    readonly canal: CanalDoReencontro | undefined;
    readonly nota: string | undefined;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;

  /**
   * Reabre o caso encerrado por engano (`reopenLostCase`).
   *
   * **`null` NÃO é uma resposta só, e é por isso que `reopenDeadline` passou a
   * sair de `buscarDoTutor`.** Ele cobre quatro coisas com desfechos HTTP
   * diferentes, e quem as separa é o serviço, relendo o caso:
   *
   * 1. não existe, ou não é do chamador → **404** (ADR-0021, e aqui vale duas
   *    vezes: um 403 confirmaria que aquele pet esteve perdido);
   * 2. já está aberto → **200** com o caso aberto, e não erro: é o reenvio da
   *    fila offline, pela mesma razão escrita em `decidirCandidato`;
   * 3. encerrado e **fora** da janela de 7 dias → **410**, que é o que o
   *    contrato declara (*"Passou dos 7 dias"*);
   * 4. encerrado, dentro da janela, mas o pet já tem OUTRO caso aberto →
   *    **409 `pet-already-lost`**. Este é o único dos quatro que o contrato não
   *    declara, e ele não é hipotético: encerrar, abrir de novo e tentar
   *    reabrir o primeiro é uma sequência de dois toques.
   *
   * Os quatro predicados ficam no `WHERE`, e não num `if` antes: a autorização
   * pela mesma regra de todo este arquivo, e os outros três porque reabrir é
   * escrita e a fila offline reenvia em rajada quando o sinal volta.
   */
  reabrir(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;
}

/**
 * A decisão humana sobre um candidato. Os dois valores do contrato, e só eles.
 *
 * `suggested` **não** está aqui de propósito: sair de `suggested` é o que esta
 * operação faz, e voltar para lá é o que `match_candidates_decisao_tem_autor`
 * recusa. Um terceiro valor neste tipo seria a porta para desfazer uma rejeição,
 * e a seção 4.10 de `docs/03-arquitetura.md` fecha isso em uma frase:
 * *"Rejeitado não volta"*.
 */
export type DecisaoDoCandidato = 'confirmed' | 'rejected';

/** O achado, como ele sai junto da decisão. Mesmas colunas de `FoundReport`. */
export interface AchadoDoCandidato {
  readonly id: FoundReportId;
  readonly origin: 'tag_scan' | 'stray_report';
  readonly status: 'open' | 'matched' | 'closed';
  readonly especie: string | null;
  readonly porte: string | null;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly achadoEm: Date;
  readonly observacao: string | null;
  readonly criadoEm: Date;
}

/**
 * `MatchCandidate.status` do contrato: os três, e não os dois da decisão.
 *
 * `suggested` existe aqui e **não** existe em `DecisaoDoCandidato` de propósito.
 * São perguntas diferentes: a listagem precisa dizer em que estado a linha está,
 * e a decisão precisa impedir que alguém volte para `suggested` — *"rejeitado
 * não volta"*, seção 4.10 de `docs/03-arquitetura.md`. Um tipo só para as duas
 * teria aberto a porta de desfazer uma rejeição.
 */
export type StatusDoCandidato = DecisaoDoCandidato | 'suggested';

/**
 * O candidato como a listagem e a decisão o leem.
 *
 * `petId` e `relatorUserId` não vão para a resposta: eles existem porque
 * **confirmar abre a conversa mediada** com quem registrou o achado, e a
 * abertura precisa dos dois. O pet vem do CASO que casou, porque o aviso avulso
 * não tem `pet_id`; o relator vem de `found_reports.reporter_user_id`.
 *
 * `caseId` também não sai: ver `comoRespostaDoCandidato` na rota, e o item 7 do
 * ADR-0010.
 */
export interface CandidatoDoCaso {
  readonly id: string;
  readonly caseId: CaseId;
  readonly foundReportId: FoundReportId;
  readonly petId: PetId;
  readonly nomeDoPet: string;
  readonly relatorUserId: UserId | null;
  readonly score: number;
  readonly atributosQuePontuaram: readonly string[];
  readonly distanciaEmMetros: number | null;
  readonly linkOrigin: 'attribute_match' | 'share_token';
  readonly versaoDaEstrategia: string;
  readonly status: StatusDoCandidato;
  readonly criadoEm: Date;
  readonly achado: AchadoDoCandidato;
}

/**
 * O MESMO candidato, depois de decidido, com o estado estreitado.
 *
 * O estreitamento não é enfeite de tipo: o `WHERE` da escrita da decisão exige
 * `status = 'suggested'` e grava `confirmed` ou `rejected`, então a linha que
 * volta dali nunca está em `suggested`. Quem lê este tipo pode decidir sobre a
 * conversa sem um terceiro caminho que não acontece.
 */
export interface CandidatoDecidido extends Omit<CandidatoDoCaso, 'status'> {
  readonly status: DecisaoDoCandidato;
}

/**
 * A janela da listagem de candidatos.
 *
 * `depoisDe` é o par (score, id) da última linha entregue, e o `id` não é
 * enfeite: o `score` repete muito — dois achados que bateram nos mesmos
 * atributos têm o mesmo número —, e um cursor só de `score` faria a página
 * seguinte repetir ou pular candidatos. Num caso de pet perdido, o candidato
 * pulado é o que era o pet.
 */
export interface PaginaDeCandidatos {
  readonly limit: number;
  readonly depoisDe: { readonly score: number; readonly id: string } | undefined;
}

export interface DecisaoSobreCandidato {
  readonly caso: CaseId;
  readonly candidato: string;
  readonly dono: UserId;
  readonly decisao: DecisaoDoCandidato;
  readonly agora: Instant;
}

/**
 * Registra a decisão humana do tutor sobre um candidato.
 *
 * **`null` cobre quatro coisas, e cobre de propósito:** o candidato não existe,
 * ele não é de um caso deste tutor, o caso não está aberto, ou ele já foi
 * decidido. As quatro viram 404, nunca 403 (ADR-0021) — e aqui isso vale duas
 * vezes, porque um 403 confirmaria a existência de uma correspondência entre o
 * pet de outra pessoa e um achado, que é exatamente o que a decisão humana
 * existe para não afirmar sozinha.
 *
 * Quem decide é **o tutor do caso**, e esse predicado mora na cláusula `WHERE`
 * da própria escrita. O banco não o exige: `match_candidates_decisao_tem_autor`
 * cobra *uma pessoa e um instante*, e qualquer `users.id` satisfaz o CHECK.
 * `autorizacao-do-decisor-na-clausula-where.test.ts` compila este SQL e confere
 * a posição `$n` do predicado do dono.
 */
export interface DecisorDeCandidatos {
  decidirCandidato(entrada: DecisaoSobreCandidato): Promise<CandidatoDecidido | null>;

  /**
   * As correspondências JÁ CALCULADAS deste caso, para o tutor ver.
   *
   * **Esta operação não cruza nada.** O cruzamento é um job na fila, disparado
   * quando um achado é criado e quando um caso é aberto, e grava em
   * `match_candidates` (seção 4.10 de `docs/03-arquitetura.md`). Aqui só se lê e
   * se ordena — e é por isso que a rota declara `x-effects: []`.
   *
   * `dono` é obrigatório pelo mesmo motivo de todo o arquivo: `match_candidates`
   * não tem coluna de dono, e o dono do candidato é o dono do CASO. O predicado
   * `lost_cases.owner_user_id = :dono` entra na junção da própria consulta, com
   * a correlação `lost_cases.id = match_candidates.case_id` — sem a correlação o
   * mesmo SQL passaria a perguntar "esta conta tem algum caso?", que é a
   * armadilha do produto cartesiano.
   *
   * Lista vazia é um estado legítimo e frequente, e não erro: a maior parte dos
   * casos não tem correspondência nenhuma no primeiro dia.
   */
  candidatosDoCaso(
    caso: CaseId,
    dono: UserId,
    pagina: PaginaDeCandidatos,
  ): Promise<readonly CandidatoDoCaso[]>;

  /**
   * O candidato JÁ DECIDIDO deste tutor, para o reenvio da fila offline.
   *
   * O critério 7 da BICHUS-86 põe a confirmação numa fila quando falta conexão,
   * e fila reenvia. Sem esta leitura, o reenvio de uma confirmação que já deu
   * certo responderia 404 e a tela diria que o achado sumiu.
   */
  candidatoDecididoDoTutor(
    caso: CaseId,
    candidato: string,
    dono: UserId,
  ): Promise<CandidatoDecidido | null>;
}
