/**
 * Push entregue ao FCM, pela API HTTP v1, por HTTP, sem SDK.
 *
 * **Este é o único arquivo do sistema que sabe que existe FCM**, e é por isso
 * que ele mora em `adapters/external/` — a mesma regra que faz de
 * `gcp-secret-manager.ts` o único que sabe que existe Secret Manager. Quem
 * consome enxerga `PushSender` (ADR-0008, ADR-0012, docs/03-arquitetura.md
 * §11.1).
 *
 * ## Por que REST à mão, e não `firebase-admin`
 *
 * A pergunta foi feita com o mesmo critério do cabeçalho do
 * `gcp-secret-manager.ts`, e deu a mesma resposta — mas por DUAS das três
 * razões de lá, e com uma quarta que é só deste caso. A diferença importa e
 * está escrita para que ninguém reabra a decisão achando que ela foi copiada:
 *
 * 1. **O projeto tem cinco dependências de produção** (`fastify`, `kysely`,
 *    `pg`, `yaml`, `sharp`). O `firebase-admin` puxa a camada de autenticação
 *    do Google, o cliente de Firestore e o resto da árvore — dezenas de pacotes
 *    transitivos para fazer **um** `POST`. E o nome do provedor entraria no
 *    `package.json`, que é o lugar mais difícil de tirar depois.
 * 2. **A superfície usada é uma chamada.** `messages:send` recebe uma mensagem
 *    e devolve um nome. Não há paginação, não há streaming, não há
 *    retentativa sofisticada para herdar. São ~60 linhas de HTTP contra um
 *    acoplamento que o ADR-0012 existe para evitar.
 * 3. **A terceira razão de lá NÃO se aplica aqui, e isso é honestidade e não
 *    detalhe.** Lá a porta era transversal (`shared/`) e a liberação de lint de
 *    `no-restricted-imports` não a cobria, então o SDK reprovaria na esteira.
 *    Aqui o arquivo está em `src/modules/notifications/adapters/external/`, que
 *    é exatamente o caminho liberado em `eslint.config.mjs`: o SDK **passaria**
 *    no lint. Ele não entra por escolha, pelas razões 1, 2 e 4 — não por
 *    impedimento.
 * 4. **O `firebase-admin` é a porta de entrada do resto do Firebase.** O
 *    ADR-0008 fecha uma fronteira explícita: "nada de Firebase Auth, Analytics,
 *    Firestore ou Crashlytics; identidade é nossa e observabilidade é Sentry",
 *    e diz por que vale escrever isso — "o SDK puxa os outros produtos com
 *    facilidade e a fronteira some sem ninguém decidir". Com o SDK instalado, a
 *    linha que abre o Firestore é um `import` que passa no lint e na revisão.
 *    Sem ele, a fronteira não depende de ninguém lembrar.
 *
 * A decisão se inverte no dia em que precisarmos de envio em lote de verdade,
 * de gerenciamento de tópico ou de App Check no servidor — e nesse dia ela se
 * inverte AQUI, sem tocar em mais nada.
 *
 * ## De onde vem a credencial
 *
 * Do servidor de metadados da própria instância, igual ao adaptador de
 * segredos: a máquina carrega uma conta de serviço e o token sai dela.
 * **Não há chave de conta de serviço em arquivo nenhum**, e isso não é economia
 * de configuração — é o ponto. O `.env.example` já registra a razão: a
 * organização recusa emitir chave baixável
 * (`constraints/iam.disableServiceAccountKeyCreation`), e a recusa está certa,
 * porque chave de conta de serviço é segredo de longa vida que não expira, não
 * se revoga sozinho e viaja em anexo de e-mail. `FCM_SERVICE_ACCOUNT_JSON`
 * existe vazia como saída de emergência para o dia em que rodarmos fora do GCP,
 * e **este adaptador não a lê**: ler seria devolver o `.env` ao caminho.
 *
 * A identidade esperada é `bichu-push`, com o papel customizado
 * `bichu.pushSender` e uma permissão só, `cloudmessaging.messages.create`. Essa
 * conta envia push e NADA mais: não lê Firestore, não mexe em Auth, não toca
 * Storage e não assina tópico. Se vazar, o estrago máximo é push.
 *
 * ## O que este arquivo deliberadamente não faz
 *
 * Não escolhe destinatário, não agrupa, não registra nem apaga aparelho e não
 * monta texto. Ele recebe uma mensagem pronta e a põe no fio — e, antes de pôr,
 * passa a porteira de `domain/conteudo-do-push.ts` de novo. A segunda passada
 * não é desconfiança do chamador de hoje: é a única defesa que cobre o chamador
 * de amanhã, que vai montar a mensagem à mão sem ler nenhum destes comentários.
 */
import { assegurarSuperficiePublica } from '../../domain/conteudo-do-push.js';
import type {
  MensagemDePush,
  PushSender,
  ResultadoDoEnvio,
} from '../../ports/push-sender.js';
import { PushNaoEnviadoError } from '../../ports/push-sender.js';
import { TOKEN_DA_CONTA_DE_SERVICO } from '../../../../shared/adapters/external/metadados-do-gcp.js';

/** Fonte da credencial da instância. Não é domínio público: só resolve dentro da VM. */
const METADADOS = TOKEN_DA_CONTA_DE_SERVICO;
const ENVIO = 'https://fcm.googleapis.com/v1';

/** O envio não pode ficar pendurado: a fila reenfileira, o processo segue. */
const TIMEOUT_MS = 10_000;
/** Margem antes do vencimento do token, igual à do adaptador de segredos. */
const MARGEM_DO_TOKEN_MS = 60_000;

export interface FcmConfig {
  /**
   * Projeto do Firebase para onde o envio vai.
   *
   * **Precisa ser o MESMO projeto que gerou o `google-services.json` embutido
   * no APK.** Se divergir, o transporte responde `SENDER_ID_MISMATCH` por
   * aparelho — ver `motivoDoErro`, que é onde essa confusão está explicada.
   */
  readonly projeto: string;
}

/** `fetch` entra por parâmetro para que o teste prove o mapeamento sem rede. */
export type Buscar = typeof globalThis.fetch;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * O `errorCode` do transporte, quando ele vem.
 *
 * Ele mora dentro de `error.details[]`, e não em `error.status`: os dois
 * existem e dizem coisas diferentes. `status` é o código genérico do Google
 * (`NOT_FOUND`, `INVALID_ARGUMENT`); `errorCode` é o do FCM, e é o único que
 * distingue "este token morreu" de "este token é de outro projeto" — que
 * chegam os dois como erro de cliente e pedem ações opostas.
 */
function errorCodeDoCorpo(corpo: unknown): string | undefined {
  const erro = ehObjeto(corpo) ? corpo['error'] : undefined;
  if (!ehObjeto(erro)) return undefined;
  const detalhes: unknown = erro['details'];
  if (Array.isArray(detalhes)) {
    for (const detalhe of detalhes as unknown[]) {
      if (ehObjeto(detalhe) && typeof detalhe['errorCode'] === 'string') {
        return detalhe['errorCode'];
      }
    }
  }
  return typeof erro['status'] === 'string' ? erro['status'] : undefined;
}

/**
 * Traduz a falha do transporte para o que quem chamou precisa decidir.
 *
 * **`SENDER_ID_MISMATCH` é o caso que justifica esta função existir.** Ele
 * significa que o token foi emitido por um projeto do Firebase e o envio saiu
 * de outro — quase sempre porque o `google-services.json` do build instalado no
 * aparelho não é o do projeto configurado no servidor. Lido cru, ele parece
 * problema de token, e quem o lê vai apagar o aparelho e mandar a pessoa
 * reinstalar o app; o aparelho volta com um token do mesmo projeto errado e o
 * defeito se repete, agora parecendo intermitente. É a variante de push do
 * `403` do gerenciador de segredos, e pela mesma razão precisa das duas
 * leituras na mensagem.
 *
 * `THIRD_PARTY_AUTH_ERROR` é o segundo: em aparelho Apple ele quer dizer que a
 * chave APNs não está carregada no projeto Firebase. Isso é **BICHUS-136**, é
 * pendência da conta Apple, e não é defeito deste código nem do aparelho.
 */
function motivoDoErro(
  status: number,
  errorCode: string | undefined,
  projeto: string,
): PushNaoEnviadoError | 'aparelho-sumiu' {
  // Higiene de token (ADR-0008): o aparelho não existe mais. Não é falha, é
  // desfecho — quem chamou apaga o registro agora.
  if (errorCode === 'UNREGISTERED' || errorCode === 'NOT_FOUND' || status === 404) {
    return 'aparelho-sumiu';
  }

  if (errorCode === 'SENDER_ID_MISMATCH') {
    return new PushNaoEnviadoError(
      'projeto-divergente',
      false,
      `O transporte recusou o token porque ele foi emitido por OUTRO projeto ` +
        `do Firebase, e o envio saiu do projeto ${projeto}. Isto NÃO é token ` +
        `inválido e apagar o aparelho não resolve: o build instalado volta a ` +
        `registrar no mesmo projeto errado e o defeito reaparece parecendo ` +
        `intermitente. Confira se o google-services.json do APK e a ` +
        `configuração deste processo apontam para o mesmo projeto.`,
    );
  }

  if (errorCode === 'THIRD_PARTY_AUTH_ERROR') {
    return new PushNaoEnviadoError(
      'credencial-apns',
      false,
      `O transporte aceitou a nossa credencial e não conseguiu falar com a ` +
        `plataforma que entrega no aparelho. Em aparelho Apple isto é a chave ` +
        `APNs (.p8) ausente ou inválida no projeto ${projeto} — pendência da ` +
        `conta Apple, registrada em BICHUS-136. Não é defeito deste código e ` +
        `não afeta Android.`,
    );
  }

  if (errorCode === 'INVALID_ARGUMENT' || status === 400) {
    return new PushNaoEnviadoError(
      'mensagem-malformada',
      false,
      `O transporte recusou a mensagem por forma, e repeti-la vai falhar ` +
        `igual. O defeito é nosso, na montagem. O corpo do erro NÃO é ` +
        `impresso aqui: ele repete o payload recusado.`,
    );
  }

  if (status === 401 || status === 403) {
    return new PushNaoEnviadoError(
      'credencial',
      false,
      `O transporte respondeu ${String(status)}: a credencial da instância foi ` +
        `recusada. Não é sobre este aparelho nem sobre esta mensagem — é a ` +
        `conta de serviço da máquina. Ela precisa da permissão ` +
        `cloudmessaging.messages.create no projeto ${projeto}.`,
    );
  }

  if (status === 429 || errorCode === 'QUOTA_EXCEEDED') {
    return new PushNaoEnviadoError(
      'cota',
      true,
      'Cota do transporte estourada. Vale tentar de novo com espera.',
    );
  }

  if (status >= 500 || errorCode === 'UNAVAILABLE' || errorCode === 'INTERNAL') {
    return new PushNaoEnviadoError(
      'transporte-indisponivel',
      true,
      `O transporte respondeu ${String(status)}. É dele e passa; vale tentar de novo.`,
    );
  }

  // Status que não sabemos ler NÃO vira retentável por otimismo: repetir para
  // sempre uma falha desconhecida é como uma fila morre sem ninguém notar.
  return new PushNaoEnviadoError(
    'desconhecido',
    false,
    `O transporte respondeu ${String(status)}${
      errorCode === undefined ? '' : ` (${errorCode})`
    }, que este adaptador não sabe ler. Precisa de olho humano.`,
  );
}

export function criarPushSenderFcm(
  config: FcmConfig,
  buscar: Buscar = globalThis.fetch,
): PushSender {
  let token: { valor: string; venceEm: number } | undefined;

  async function tokenDaInstancia(): Promise<string> {
    const agora = Date.now();
    if (token !== undefined && token.venceEm > agora) return token.valor;

    const resposta = await buscar(METADADOS, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) {
      throw new PushNaoEnviadoError(
        'credencial',
        false,
        `O servidor de metadados da instância respondeu ` +
          `${String(resposta.status)}. A máquina provavelmente subiu sem conta ` +
          `de serviço anexada, ou sem o escopo cloud-platform. Isso não é ` +
          `consertável por variável de ambiente, e NÃO adianta tentar de novo.`,
      );
    }
    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo) || typeof corpo['access_token'] !== 'string') {
      throw new PushNaoEnviadoError(
        'credencial',
        false,
        'O servidor de metadados respondeu sem `access_token`.',
      );
    }
    const expiraEm = typeof corpo['expires_in'] === 'number' ? corpo['expires_in'] : 0;
    token = {
      valor: corpo['access_token'],
      venceEm: agora + Math.max(expiraEm * 1000 - MARGEM_DO_TOKEN_MS, 0),
    };
    return token.valor;
  }

  return {
    transporte: `FCM HTTP v1 (projeto ${config.projeto})`,

    async enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio> {
      // A PORTEIRA VEM ANTES DE QUALQUER COISA, inclusive antes de pedir o
      // token. Duas consequências, e as duas são de propósito: nada sensível
      // chega perto do fio, e a mensagem envenenada não consome credencial
      // nem cota para ser recusada.
      assegurarSuperficiePublica(mensagem);

      const corpoDoEnvio = {
        message: {
          token: mensagem.token,
          // `notification` (e não só `data`) é o que faz o sistema desenhar o
          // aviso com o app em segundo plano ou encerrado — que é exatamente
          // o caso do alerta. Só com `data`, um app encerrado não mostra nada.
          notification: { title: mensagem.titulo, body: mensagem.corpo },
          data: { ...mensagem.dados },
          android: {
            // Nome do enum, em maiúsculas: é a forma canônica do JSON de
            // protobuf. A minúscula também é aceita hoje, e depender disso é
            // depender de tolerância que não está no contrato.
            priority: mensagem.prioridade === 'alta' ? 'HIGH' : 'NORMAL',
            ttl: `${String(mensagem.validadeEmSegundos)}s`,
            collapse_key: mensagem.chaveDeAgrupamento,
            ...(mensagem.imagemUrl === undefined
              ? {}
              : { notification: { image: mensagem.imagemUrl } }),
          },
          // NÃO há bloco `apns` aqui, e a ausência é deliberada: iOS depende da
          // chave APNs no projeto Firebase, que é pendência da conta Apple em
          // BICHUS-136. Um bloco vazio não adiantaria, e um bloco preenchido
          // esconderia a pendência atrás de configuração que não funciona.
        },
      };

      const alvo = `${ENVIO}/projects/${config.projeto}/messages:send`;

      let resposta: Response;
      try {
        resposta = await buscar(alvo, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await tokenDaInstancia()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(corpoDoEnvio),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (erro) {
        // `tokenDaInstancia` já estoura `PushNaoEnviadoError`; repassar aqui
        // evita reclassificar falha de credencial como falha de rede — e a
        // diferença entre as duas é justamente `retentavel`.
        if (erro instanceof PushNaoEnviadoError) throw erro;
        throw new PushNaoEnviadoError(
          'rede',
          true,
          `Não foi possível falar com o transporte: ` +
            `${erro instanceof Error ? erro.message : 'erro desconhecido'}. ` +
            `O token do aparelho NÃO entra nesta mensagem.`,
        );
      }

      if (resposta.ok) return 'aceito';

      // O corpo do erro é lido só para achar o `errorCode`, e nunca é
      // impresso: numa recusa por forma ele devolve o payload de volta.
      let errorCode: string | undefined;
      try {
        errorCode = errorCodeDoCorpo(await resposta.json());
      } catch {
        errorCode = undefined;
      }

      const traduzido = motivoDoErro(resposta.status, errorCode, config.projeto);
      if (traduzido === 'aparelho-sumiu') return 'aparelho-sumiu';
      throw traduzido;
    },
  };
}
