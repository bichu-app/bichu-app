/**
 * **O DENUNCIADO NÃO É AVISADO. ESTÁ ESCRITO NO CÓDIGO, E NÃO SÓ NA PROSA.**
 *
 * O desenho da fatia E manda escrever isto no código, e este arquivo é onde ele
 * está escrito. A regra, inteira:
 *
 * > A pessoa denunciada vê **NADA**. Nenhum aviso, nenhum selo, nenhuma mudança
 * > no perfil dela e nenhuma mudança no que ela consegue fazer.
 *
 * **Avisar o denunciado é retaliação**, e o silêncio é mecanismo, não omissão.
 * Quem denuncia um assediador e vê o assediador receber "você foi denunciado"
 * acaba de entregar a ele a informação de que ela reagiu — e é exatamente nesse
 * momento que a retaliação acontece.
 *
 * ## Como isto é cobrado, e por que não é por disciplina
 *
 * Uma frase de cabeçalho não é mecanismo: foi o que a avaliação do `Perto`
 * provou neste repositório, onde o cabeçalho de `moderacao.ts` afirmava cobrir
 * a avaliação e a função não era chamada. Então a regra é cobrada por três
 * ausências estruturais, e cada uma reprova sozinha:
 *
 * 1. **Nenhum caso de uso desta fatia recebe uma porta de aviso.**
 *    `DependenciasDaDenuncia` não tem campo de notificação, de push, de e-mail
 *    nem de caixa de avisos. Avisar o denunciado não é uma coisa que alguém aqui
 *    esqueceu de não fazer: é uma coisa que **não é exprimível** sem acrescentar
 *    uma dependência nova — e quem a acrescentar vai ter de apagar este arquivo.
 * 2. **Nenhuma coluna das três tabelas é de aviso.** Não há `notified_at`, não
 *    há gatilho que escreva em `notification_deliveries`, e o `COMMENT ON TABLE`
 *    das três diz isto por extenso.
 * 3. **A resposta não muda para o denunciado.** `AVISOS_PROIBIDOS` abaixo é a
 *    lista literal do que não pode nascer, e o caso de teste
 *    `o-denunciado-nao-e-avisado.test.ts` varre a resposta e as dependências
 *    por estes nomes.
 *
 * ## O que o DENUNCIANTE vê, que é o outro lado da mesma decisão
 *
 * Confirmação na hora, a frase de que a outra pessoa não é avisada — que é o
 * que faz denunciar parecer seguro —, e depois *Denúncia enviada* desabilitado.
 * **Nenhum prazo é prometido, porque não temos um.** Ver `PRAZOS_PROIBIDOS`.
 */

/**
 * O que NUNCA pode chegar ao denunciado, por nenhum caminho.
 *
 * Lista literal e não prosa: é por estes nomes que a isca varre.
 */
export const AVISOS_PROIBIDOS = [
  'aviso ao denunciado',
  'notificar o denunciado',
  'notify_reported',
  'reported_user_notified',
  'notified_at',
] as const;

/**
 * O que NUNCA pode ser prometido a quem denuncia.
 *
 * **Não existe prazo.** Não há equipe de moderação de plantão, e um campo de
 * prazo no contrato seria uma promessa que o produto não tem como cumprir — a
 * ocultação imediata existe justamente para que a denúncia valha SEM prazo.
 */
export const PRAZOS_PROIBIDOS = [
  'sla',
  'prazo de resposta',
  'responderemos em',
  'review_deadline',
  'expected_resolution_at',
] as const;

/**
 * O que o denunciante vê, e é tudo o que ele vê.
 *
 * `202` com `status: accepted`, e nada mais: nem identificador de denúncia, nem
 * estado, nem posição na fila. Identificador de denúncia convidaria a uma rota
 * de consulta, e uma rota de consulta é onde o prazo prometido nasceria.
 */
export const O_QUE_O_DENUNCIANTE_RECEBE = { status: 'accepted' } as const;
