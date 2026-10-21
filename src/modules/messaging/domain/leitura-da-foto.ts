/**
 * A URL ASSINADA da foto da conversa: a validade, e o motivo do numero.
 *
 * ## Por que a foto do achado nao sai como derivada publica
 *
 * O criterio 9 da BICHUS-35 e literal: a foto do achador "e vista pelo tutor
 * dentro da conversa mediada, e so". As derivadas de foto de PET moram em
 * balde publico, com 128 bits na chave e cache de um ano, e isso e correto
 * para elas -- o cartaz de pet perdido existe para ser compartilhado. A foto do
 * achado e o contrario: ela so faz sentido para duas pessoas, e uma delas e um
 * estranho. Entao ela fica em balde PRIVADO e sai por URL assinada curta.
 *
 * **Nunca em rota publica e nunca com cache longo.**
 *
 * ## O NUMERO, e por que ele e este
 *
 * Dez minutos. O que a validade precisa cobrir e uma coisa so: o intervalo
 * entre a resposta da conversa ser montada e a imagem ser efetivamente baixada
 * pelo aparelho. Isso inclui rede de celular ruim -- que e a rede de quem esta
 * na rua com um animal na mao -- e a pessoa rolando a conversa para tras dentro
 * da MESMA pagina de mensagens, sem nova chamada.
 *
 * Dez minutos cobre isso com folga e deixa uma URL que escape (impressao de
 * tela do endereco, linha de log, link repassado) morta antes de alguem
 * conseguir usa-la. Encurtar para um minuto quebraria a foto de quem abriu a
 * conversa e voltou ao aplicativo pouco depois sem recarregar; alongar para uma
 * hora nao compra nada, porque a proxima leitura da conversa assina de novo de
 * graca.
 *
 * E o mesmo numero que a bancada do assinador (`s3-object-storage.verbos.test.ts`)
 * ja usava como exemplo de leitura privada, e preferir o numero que o
 * repositorio ja exercita a inventar um terceiro e deliberado.
 *
 * ## RETENCAO: quanto tempo a foto da conversa existe
 *
 * **O prazo NAO e um relogio, e isso e decisao do cliente, nao lacuna.**
 *
 * Decisao de 17/10/2026, nas palavras dele: *"voce so deve apagar as
 * informacoes, caso o usuario remova o pet ou delete a conta"*. Os dois
 * caminhos legitimos sao **acao explicita de pessoa**. O cabecalho de
 * `media/application/varrer-envios-vencidos.ts` carrega a regra por extenso,
 * mais a secao "Por que nao um prazo proprio para o achado", cuja resposta e
 * uma frase: *"porque prazo e apagamento automatico, e e exatamente o que a
 * decisao proibe"*. A mesma regra esta repetida em
 * `media/ports/media-repository.ts` e tem portao proprio
 * (`varredura-nao-apaga-a-vitrine.test.ts`).
 *
 * Esta frente NAO constroi varredura por tempo, e a recusa e deliberada. O
 * historico pesa: a ultima vez que um prazo encostou na foto do achado, ela foi
 * apagada dez minutos depois de subir, duas vezes, com hora medida (01:18:44 ->
 * 01:29:10 e 01:33:35 -> 01:44:10). A causa nao foi o filtro; foi julgar por um
 * criterio que nao era o ciclo de vida daquela foto.
 *
 * ### O que REALMENTE apaga a foto da conversa, hoje
 *
 * - **exclusao de conta**: `apagar-objetos-da-conta.ts`, pelo
 *   `kysely-media-repository.ts`, ja varre
 *   `conversation_messages.photo_object_key` por `sender_user_id` e enfileira a
 *   chave no balde privado. Vale para o tutor e para o achador COM conta, e
 *   passa a alcancar as fotos que esta frente grava **sem uma linha nova**;
 * - **remocao do pet**: a cascata de `conversations` (`ON DELETE CASCADE` a
 *   partir de `pets`) leva as mensagens junto;
 * - **o higienizador**, que apaga o ORIGINAL com a coordenada de GPS. E a unica
 *   exclusao automatica autorizada, por uma segunda fala do cliente no mesmo
 *   dia (*"pode apagar o original e guardar so o arquivo 2"*), e ela nao perde
 *   informacao: sai uma de duas copias da MESMA imagem.
 *
 * ### O que fica, e e o que o cliente precisa decidir se quer mudar
 *
 * A foto do achador **SEM conta** nao tem titular: `sender_user_id` e nulo, e o
 * comentario de `apagar-objetos-da-conta.ts` diz por que ("nao ha titular cuja
 * exclusao estejamos cumprindo"). Ela sai quando o pet e removido, e **nao sai
 * por prazo**.
 *
 * O crescimento e limitado e esta declarado: no maximo 3 fotos por aviso
 * (`TETO_DE_FOTOS_POR_ACHADO`, SEC-009), e depois da higiene o que resta e a
 * derivada de ate 500 KB -- o original ja foi apagado. Teto de ~1,5 MB por
 * aviso.
 *
 * **Nao ha, portanto, numero de retencao a declarar aqui.** Houve um
 * (`DIAS_DE_RETENCAO_DA_FOTO_DA_CONVERSA = 30`) e ele foi REMOVIDO: era
 * constante exportada que ninguem lia, nomeando um prazo que nada aplicava.
 * Numero assim nao e documentacao, e convite -- a proxima pessoa o encontra,
 * conclui que falta a varredura e a escreve, contra a decisao de 17/10. Se o
 * cliente quiser prazo, o prazo volta junto com a varredura e com a revogacao
 * explicita daquela decisao, no mesmo commit.
 */

/**
 * Dez minutos, em segundos. O motivo esta no cabecalho deste arquivo, e nao
 * neste comentario: numero com a justificativa longe dele e numero que a
 * proxima pessoa troca por achismo.
 */
export const VALIDADE_DA_URL_DA_FOTO_EM_SEGUNDOS = 600;

/**
 * A SUPERFICIE DO ACHADOR SEM CONTA NAO SERVE CHAVE QUE CARREGA IDENTIFICADOR.
 *
 * ## O defeito que este guarda impede, medido
 *
 * A URL assinada de leitura carrega a CHAVE no caminho -- e assim que URL
 * assinada funciona, e nao ha como assinar sem ela. E a chave da derivada
 * higienizada e
 * `found-reports/{dono}/sanitized/{128 bits}.{ext}`, onde `{dono}` e:
 *
 *   - `sem-conta`, para a foto de quem avisou SEM conta;
 *   - o `found_report_id` (UUIDv7), para a foto pedida por quem TEM conta.
 *
 * Servir a segunda ao achador sem conta entrega a ele um UUIDv7 interno, com o
 * instante de criacao dentro. **E exatamente o que o SEC-001 proibe**, e e o
 * mesmo defeito que `chaveDaFotoDoAchadorSemConta` ja existe para evitar no
 * caminho do ENVIO: o cabecalho dela diz, por extenso, que o segmento do aviso
 * foi trocado por um rotulo fixo porque "a chave SAI para o achador" e "com o
 * id do aviso ali, o achador sem conta receberia um UUIDv7 interno".
 *
 * Este guarda e a mesma regra na LEITURA. Ele foi escrito depois de a
 * conferencia de nao-vazamento de `finder-conversation-routes.test.ts`
 * REPROVAR a primeira versao desta frente, que servia a URL assinada dos dois
 * lados sem olhar a chave. Aquele caso ja proibia `found-reports/` e qualquer
 * UUID no corpo do achador, e ele estava certo.
 *
 * ## O QUE ISTO CUSTA, e e TENSAO EM ABERTO e nao desenho acabado
 *
 * Hoje a consequencia e que **o achador sem conta nao ve a foto que o TUTOR
 * mandou** -- ele ve a que ele mesmo mandou. O ENVIO e simetrico (os dois
 * lados mandam, e a foto do achador chega ao tutor, que e o sentido que o
 * texto ja entregue no aplicativo promete); a LEITURA, deste lado, nao e.
 *
 * Fechar isso exige uma decisao que nao e desta frente, porque as tres saidas
 * tem custos diferentes e nenhuma e local:
 *
 *   1. uma leitura OPACA na superficie do achador
 *      (`GET /finder/conversation/photos/{ref}`): operacao nova no contrato,
 *      que resolve uma referencia de 128 bits e repassa os bytes. E a saida
 *      certa e a mais cara;
 *   2. a chave higienizada do achado deixar de carregar o `found_report_id`
 *      para TODAS as especies. Barato de escrever e nao e local: o prefixo
 *      por aviso e o que permite a politica de balde, ao ciclo de vida e ao
 *      expurgo tratarem a foto do achado por aviso, e isso esta escrito em
 *      `chaveDaFotoDoAchado`;
 *   3. aceitar a assimetria. E o estado de hoje, e e o unico que nao decide
 *      nada no lugar de ninguem.
 *
 * Enquanto nao houver decisao, **o guarda recusa**. Vazar um UUIDv7 para quem
 * nao tem conta e irreversivel; nao mostrar uma foto nao e.
 */
const DONO_SEM_IDENTIFICADOR = 'sem-conta';

/**
 * `true` quando a chave pode ser servida a quem NAO tem conta.
 *
 * A conferencia e por LISTA DE PERMISSAO (o segmento de dono tem de ser o
 * rotulo fixo) e nao por lista de proibicao (procurar o que PARECE um UUID).
 * A diferenca importa: uma forma de chave nova, de uma especie de foto que
 * ainda nao existe, seria RECUSADA por este guarda em vez de passar por nao
 * casar com o padrao de UUID. O erro cai para o lado de nao mostrar a foto.
 */
export function podeSairParaQuemNaoTemConta(chave: string): boolean {
  const segmentos = chave.split('/');
  return (
    segmentos.length === 4 &&
    segmentos[0] === 'found-reports' &&
    segmentos[1] === DONO_SEM_IDENTIFICADOR &&
    segmentos[2] === 'sanitized'
  );
}

/**
 * UMA FOTO QUE ESTE CHAMADOR ENVIAR CHEGA A SER LIDA PELO OUTRO LADO?
 *
 * ## Por que a resposta pode ser NÃO, e por que o tutor precisa saber
 *
 * O ENVIO é simétrico: os dois lados mandam foto. A LEITURA do lado de quem não
 * tem conta não é, por causa de [podeSairParaQuemNaoTemConta] acima — a URL
 * assinada leva a chave no caminho, e a chave da foto pedida por quem TEM conta
 * leva o `found_report_id` dentro. Servi-la entregaria um UUIDv7 a quem não tem
 * conta, que é o que o SEC-001 proíbe.
 *
 * Então, hoje, o tutor pode anexar uma foto que o achador sem conta **não vê**.
 * Sem este campo na resposta, isso é um **defeito de expectativa**: o tutor
 * manda a foto do pet, não recebe reação nenhuma, e fica esperando resposta de
 * quem não viu nada. O servidor é o único que sabe disso — a tela não tem como
 * deduzir —, então é o servidor que tem de dizer.
 *
 * É **expectativa e não permissão**: ninguém está sendo recusado. O envio é
 * aceito, a mensagem é gravada, a foto existe e o próprio remetente a vê. O que
 * o campo informa é o alcance.
 *
 * ## A tabela inteira, e por que `achadorTemConta` basta
 *
 * | chamador | outro lado | onde o outro lê | alcança? |
 * |---|---|---|---|
 * | tutor | achador SEM conta | `FinderConversation` | **não** — o guarda recusa |
 * | tutor | achador COM conta | `Conversation` | sim |
 * | achador COM conta | tutor | `Conversation` | sim |
 *
 * A quarta linha não existe: o achador SEM conta não autentica, então ele nunca
 * é o chamador desta vista. É por isso que `achadorTemConta` responde sozinho,
 * sem precisar do papel do chamador — e é por isso que o nome do campo fala do
 * "outro lado" em vez de nomear tutor ou achador.
 *
 * **A foto do achador sem conta CHEGA ao tutor**, e é o sentido que o texto já
 * entregue no aplicativo promete ("a foto entra na conversa quando o tutor
 * aparecer"): a chave dela é `found-reports/sem-conta/sanitized/...`, não carrega
 * identificador, e o tutor lê pela vista autenticada, que não tem guarda.
 *
 * ## Quando isto passa a ser sempre `true`
 *
 * No dia em que a leitura do achador sem conta ganhar um caminho opaco (a opção
 * 1 das três listadas em [podeSairParaQuemNaoTemConta]). Aí esta função devolve
 * `true` sempre e **o campo continua no contrato**, respondendo a verdade nova:
 * tirá-lo quebraria clientes que já o leem, e um campo que só diz `true` custa
 * um booleano.
 */
export function fotoAlcancaOutroLado(conversa: { readonly achadorTemConta: boolean }): boolean {
  return conversa.achadorTemConta;
}
