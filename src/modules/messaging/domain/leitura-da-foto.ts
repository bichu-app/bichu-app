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
 * ## RETENCAO: por quanto tempo a foto existe
 *
 * **Trinta dias depois de o caso encerrar**, alinhado ao que o produto JA
 * decidiu em dois lugares, em vez de um numero novo:
 *
 * - `DIAS_DE_LEITURA_DEPOIS_DO_ENCERRAMENTO = 30`
 *   (`messaging/domain/acesso-do-achador.ts`): o acesso do achador ao canal
 *   vence em "caso aberto + 30 dias", e e esse o prazo em que a conversa
 *   inteira -- foto incluida -- ainda tem leitor;
 * - a emenda 4 do ADR-0010 mantem o pet reencontrado na listagem por 30 dias.
 *
 * Depois disso a foto nao tem mais quem a leia: o token do achador nao resolve,
 * e a conversa sai das leituras. Alinhar o prazo do OBJETO ao prazo do ACESSO e
 * o que evita a terceira data para a mesma pergunta.
 *
 * **O que ja esta coberto, e o que NAO esta:**
 *
 * - a exclusao de CONTA ja apaga o objeto. `apagar-objetos-da-conta.ts`, pelo
 *   `kysely-media-repository.ts`, ja varre `conversation_messages.photo_object_key`
 *   por `sender_user_id` e enfileira a chave no balde privado. Isso vale para o
 *   tutor e para o achador COM conta, e passa a alcancar as fotos que este
 *   commit grava -- sem uma linha nova;
 * - **nao existe varredura por TEMPO**, e a lacuna e relatada em vez de
 *   fechada aqui. O achador SEM conta tem `sender_user_id` nulo, e o proprio
 *   comentario daquele arquivo diz por que: "nao ha titular cuja exclusao
 *   estejamos cumprindo". Construir um varredor de 30 dias e trabalho proprio,
 *   com decisao de produto sobre o que acontece com a conversa junto, e
 *   fabrica-lo dentro desta frente seria desenhar expurgo de dado de duas
 *   pessoas num commit sobre envio de foto.
 */

/**
 * Dez minutos, em segundos. O motivo esta no cabecalho deste arquivo, e nao
 * neste comentario: numero com a justificativa longe dele e numero que a
 * proxima pessoa troca por achismo.
 */
export const VALIDADE_DA_URL_DA_FOTO_EM_SEGUNDOS = 600;

/** Trinta dias depois do encerramento do caso. Ver o cabecalho. */
export const DIAS_DE_RETENCAO_DA_FOTO_DA_CONVERSA = 30;

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
