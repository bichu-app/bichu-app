/**
 * O TRANSPORTE do e-mail (BICHUS-129, item 2; critério 10 de BICHUS-15).
 *
 * Este arquivo fecha a segunda metade de BICHUS-129. A primeira — a MONTAGEM —
 * está em `aviso-de-reuso.test.ts` (qual mensagem sai) e em
 * `smtp-mailer.test.ts` (que texto o `montarMensagem` produz). As duas são
 * puras: provam o texto montado. **Nenhuma delas prova que o e-mail sai do
 * processo.**
 *
 * A diferença não é acadêmica. Enquanto só havia teste de unidade, apontar o
 * `MAIL_HOST` para um host que não existe, quebrar o diálogo do protocolo em
 * `smtp-mailer.ts:180-195` ou trocar o `enviar` por um `return
 * Promise.resolve()` **não reprovava nada**. O relato de 18/09 dizia
 * "confirmado chegando no receptor local", e era verdade — naquele dia, na mão,
 * uma vez. Verificação manual não é regressão.
 *
 * Quem paga a conta é a vítima do reuso de refresh. O aviso de segurança é a
 * única coisa que ela recebe quando alguém está usando o refresh dela; se ele
 * parar de sair, a detecção volta a ser exatamente o que o critério 10 proíbe:
 * silenciosa. Ela lê a revogação como "o app me deslogou", entra de novo e
 * segue com o invasor dentro da conta.
 *
 * ## Por que a prova é lida no RECEPTOR, e não no log da aplicação
 *
 * O log diz que o processo *tentou*. O que interessa é o que o **servidor SMTP
 * entendeu**, e as duas coisas divergem justamente nos casos que importam:
 * falha de escape em SMTP **não levanta erro**. O servidor responde `250`, o
 * `enviar()` resolve, o log fica verde — e o que chegou não é o que se quis
 * mandar. Por isso toda afirmação aqui vem da API do mailpit (`bichu-mail-1`),
 * que é o outro lado do socket.
 *
 * ## O que cada caso fecha
 *
 * 1. **chega** — o e-mail sai do processo e aterrissa no receptor. É o caso que
 *    reprova quando o transporte quebra, e o único que nenhum teste de unidade
 *    consegue fazer.
 * 2. **destinatário, assunto e corpo** chegam como `montarMensagem` os montou.
 *    A comparação é contra a saída real do `montarMensagem`, e não contra
 *    literais copiados: assim o caso segue o código se a montagem mudar, em vez
 *    de virar cópia que envelhece em silêncio.
 * 3. **linha com um ponto só** — é o caso que encerra os dados no SMTP. O
 *    `escaparPontos` existe para isso e já tem teste de unidade; o que faltava é
 *    que o teste de unidade prova o **texto montado**, e só o servidor de
 *    verdade prova que ele **concorda**. Sem o escape, a mensagem termina no
 *    ponto e o resto vira comando de protocolo — e o link de redefinição de
 *    senha, que vem depois, some do e-mail da vítima.
 * 4. **assunto com `\r\n`** não vira cabeçalho novo **na mensagem recebida**.
 *    BICHUS-130 provou a limpeza no texto montado; aqui se confere que o
 *    servidor não leu um `Bcc:` onde ninguém escreveu um. Um `Bcc:` enxertado
 *    assim entrega ao atacante cópia integral do aviso de segurança da vítima,
 *    com o link de redefinição dentro.
 *
 * Os casos 3 e 4 são o ponto do arquivo: eles fecham o ciclo entre o teste de
 * unidade de BICHUS-130 e o que o servidor SMTP de verdade faz com aquilo.
 *
 * ## Isca conferida
 *
 * Com o mecanismo desligado de quatro formas, uma de cada vez, e restaurado
 * depois conferindo SHA-256:
 *
 * - `MAIL_PORT` apontando para porta sem ninguém escutando: os quatro casos
 *   reprovam em `ECONNREFUSED`, **dizendo o que houve** — não é tempo esgotado
 *   mudo;
 * - `enviar` trocado por `Promise.resolve()` (o envio que mente que enviou):
 *   os quatro reprovam em {@link PRAZO_DE_ENTREGA_MS} com a mensagem de
 *   {@link esperarNaCaixa}, que nomeia o defeito;
 * - `escaparPontos` devolvendo o corpo cru: o caso 3 reprova **sozinho**, com o
 *   corpo cortado no ponto à vista;
 * - a limpeza do assunto (`m.assunto.replace(/[\r\n]+/g, ' ')`) removida: o
 *   caso 4 reprova sozinho, e o que ele imprime é o achado inteiro desta issue
 *   — `"Subject: Encerramos as sessões", "Bcc: atacante-…@exemplo.invalid"`
 *   como **dois cabeçalhos** no código-fonte gravado pelo servidor. Não é
 *   dedução a partir do texto montado: é o mailpit tendo aceitado o `Bcc:` que
 *   ninguém escreveu. Era exatamente isso que nada reprovava antes daqui.
 *
 * Isca é obrigatória aqui pelo mesmo motivo de sempre: um teste de entrega que
 * nunca se viu reprovar pode estar lendo mensagem de outra rodada.
 *
 * ## Como rodar
 *
 * Não cabe em `npm test`: precisa do receptor de pé. A issue já previa isso.
 * Com a pilha no ar, sem reconstruir nem derrubar nada dela:
 *
 *   npx tsc -p tsconfig.json --outDir dist/_tests
 *   docker compose run --rm --no-deps \
 *     -v "$PWD/dist/_tests:/app/dist/_tests" api \
 *     node --test "dist/_tests/tests/integration/transporte-de-email.test.js"
 *
 * O contêiner é efêmero e `--no-deps` não toca em nenhum serviço que já esteja
 * de pé. O caminho oficial da suíte inteira continua sendo `make test-int`.
 *
 * Fora do compose não roda, e é de propósito: `mail` é um nome da rede do
 * compose. Rodar de fora exigiria publicar a porta 1025 no hospedeiro, que é
 * expor um relay SMTP aberto na máquina de quem desenvolve.
 *
 * ## O que este arquivo NÃO prova
 *
 * Entregabilidade: SPF, DKIM, DMARC e reputação de domínio só existem com
 * provedor real, e o próprio compose diz isso na definição do serviço `mail`. O
 * mailpit aceita tudo. O que se prova aqui é que a mensagem **sai do processo e
 * chega ao outro lado do socket íntegra** — que é a parte que o código desta
 * casa controla. O transporte do provedor (ADR-0009, Postmark) é HTTP, entra
 * como outro adaptador atrás da mesma porta, e vai precisar da própria prova.
 *
 * Também não prova o caminho que CHAMA o mailer: quem dispara o aviso de reuso
 * é `auth-service.test.ts`, e a montagem é `aviso-de-reuso.test.ts`. Aqui a
 * `Mensagem` é construída à mão, de propósito — o que está sob teste é o
 * adaptador, e arrastar serviço e banco para dentro faria o caso reprovar por
 * motivos que não são o transporte.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { criarMailer, montarMensagem } from '../../src/modules/identity/adapters/external/smtp-mailer.js';
import type { Mensagem } from '../../src/modules/identity/ports/mailer.js';

/**
 * Até quando se espera a mensagem aparecer no receptor.
 *
 * Generoso de propósito, pelo mesmo motivo do observador de
 * `revogacao-de-sessao.test.ts`: ele não é requisito de desempenho, é o ponto
 * em que o caso para de esperar e **diz o que houve**. Sem prazo, um `enviar`
 * que virou no-op viraria teste pendurado, e quem lê o painel veria tempo
 * esgotado sem motivo em vez de "o e-mail não sai mais".
 */
const PRAZO_DE_ENTREGA_MS = 10_000;

/** Intervalo entre consultas ao receptor enquanto a mensagem não aparece. */
const INTERVALO_DE_CONSULTA_MS = 100;

/**
 * Porta da API HTTP do mailpit. A porta SMTP vem de `MAIL_PORT`, que a
 * aplicação já lê; esta é só do receptor e só deste arquivo.
 */
const PORTA_DA_API_DO_RECEPTOR = Number.parseInt(
  process.env['MAILPIT_API_PORT'] ?? '8025',
  10,
);

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * Identifica esta execução.
 *
 * Cada caso manda para um endereço próprio e procura por ele. Sem isso, uma
 * rodada leria a mensagem da rodada anterior — que é a forma mais silenciosa de
 * este arquivo virar decoração: ele ficaria verde com o envio desligado,
 * confirmando entrega de um e-mail de ontem.
 */
const EXECUCAO = randomUUID().slice(0, 8);

const config = loadAppConfig();

/**
 * O endereço da API do receptor, derivado de `MAIL_HOST`.
 *
 * Montado a partir da configuração e não escrito à mão: hostname literal é o
 * que o portão de portabilidade reprova em `src/`, e repetir aqui o valor que a
 * aplicação já lê criaria duas fontes para a mesma verdade — o dia em que o
 * receptor mudar de nome, o teste passaria a conversar com outra coisa.
 */
const baseDoReceptor = `http://${config.mail.host}:${String(PORTA_DA_API_DO_RECEPTOR)}`;

/** O recorte que este arquivo usa da resposta do mailpit. */
interface MensagemNoReceptor {
  readonly ID: string;
  readonly Subject: string;
  readonly Text: string;
  readonly To: readonly { readonly Address: string }[];
  readonly Bcc: readonly { readonly Address: string }[];
  readonly From: { readonly Address: string };
}

interface BuscaNoReceptor {
  readonly messages: readonly { readonly ID: string }[];
}

function enderecoDoCaso(caso: string): string {
  return `transporte-${caso}-${EXECUCAO}@${DOMINIO_DE_TESTE}`;
}

async function lerJson<T>(caminho: string): Promise<T> {
  const resposta = await fetch(`${baseDoReceptor}${caminho}`);
  assert.equal(
    resposta.status,
    200,
    `o receptor local respondeu ${String(resposta.status)} em ${caminho}. Sem o ` +
      `receptor não há como afirmar entrega nenhuma — confira se \`bichu-mail-1\` está ` +
      `de pé e se este processo está na rede do compose.`,
  );
  return (await resposta.json()) as T;
}

/**
 * Espera a mensagem daquele destinatário aparecer no receptor e a devolve
 * inteira.
 *
 * Consulta por destinatário, e não "a última que chegou": a caixa do mailpit é
 * compartilhada com quem estiver usando a pilha de desenvolvimento, e pegar a
 * última faria este arquivo afirmar coisas sobre o e-mail de outra pessoa.
 *
 * O `assert.fail` do fim é a parte que precisa ser boa. Este é o caminho pelo
 * qual o arquivo reprova quando o envio deixa de acontecer **sem levantar
 * erro** — o `enviar` que virou no-op, o transporte trocado por `log`, o
 * `MAIL_TRANSPORT` mexido no ambiente. Nenhum desses explode: todos resolvem a
 * promessa e somem. Se a mensagem daqui fosse só "tempo esgotado", quem
 * olhasse o painel veria um teste instável e mexeria no prazo.
 */
async function esperarNaCaixa(destinatario: string): Promise<MensagemNoReceptor> {
  const limite = Date.now() + PRAZO_DE_ENTREGA_MS;

  while (Date.now() < limite) {
    const busca = await lerJson<BuscaNoReceptor>(
      `/api/v1/search?query=${encodeURIComponent(`to:${destinatario}`)}`,
    );
    const achada = busca.messages[0];
    if (achada !== undefined) {
      return await lerJson<MensagemNoReceptor>(`/api/v1/message/${achada.ID}`);
    }
    await new Promise((seguir) => setTimeout(seguir, INTERVALO_DE_CONSULTA_MS));
  }

  assert.fail(
    `o \`enviar()\` do transporte \`${config.mail.transport}\` resolveu sem erro, mas ` +
      `nenhuma mensagem para este destinatário chegou ao receptor local em ` +
      `${String(PRAZO_DE_ENTREGA_MS)} ms. Isto NÃO é lentidão do receptor: entrega no ` +
      `mailpit é imediata. O e-mail parou de sair do processo — e o aviso de reuso de ` +
      `refresh é a única coisa que a vítima recebe quando alguém está usando o refresh ` +
      `dela. Sem ele, a detecção volta a ser silenciosa, que é o que o critério 10 de ` +
      `BICHUS-15 proíbe.`,
  );
}

/** O código-fonte cru, como o servidor gravou: é onde os cabeçalhos aparecem. */
async function lerBruta(id: string): Promise<string> {
  const resposta = await fetch(`${baseDoReceptor}/api/v1/message/${id}/raw`);
  assert.equal(resposta.status, 200, 'o receptor não devolveu o código-fonte da mensagem');
  return await resposta.text();
}

/**
 * As linhas de cabeçalho da mensagem recebida, já desdobradas.
 *
 * O bloco vai até a primeira linha vazia — é ela que, no protocolo, marca onde
 * o cabeçalho acaba e o corpo começa. Linha que começa com espaço ou tabulação
 * é **continuação** da anterior, não cabeçalho novo: o `Received:` que o
 * próprio receptor acrescenta vem dobrado em três linhas, e contá-las como
 * cabeçalhos faria o caso 4 acusar injeção onde não há.
 */
function cabecalhosDe(bruta: string): string[] {
  const fim = bruta.indexOf('\r\n\r\n');
  const bloco = fim === -1 ? bruta : bruta.slice(0, fim);
  return bloco.split('\r\n').filter((linha) => !/^[ \t]/.test(linha));
}

/** Manda de verdade, pelo adaptador de produção, com a configuração da aplicação. */
async function enviarDeVerdade(mensagem: Mensagem): Promise<void> {
  // `criarMailer` e não um dublê: o que está sob teste É o adaptador. Um mailer
  // de mentira aqui mediria um caminho que ninguém roda, e é assim que um teste
  // de integração vira teste de unidade com contêiner em volta.
  await criarMailer(config.mail).enviar(mensagem);
}

void describe('BICHUS-129 item 2 — o transporte: o e-mail sai do processo e chega íntegro', () => {
  void it('a configuração em uso fala SMTP de verdade com o receptor local', () => {
    // Guarda contra a forma mais fácil de o arquivo inteiro virar teatro. O
    // transporte `log` resolve a promessa, imprime e não manda nada — com ele
    // no ar, os quatro casos abaixo ficariam pendurados por dez segundos cada e
    // reprovariam por um motivo que a mensagem de `esperarNaCaixa` não
    // descreve. Falhar aqui, primeiro e explicando, é mais barato.
    assert.equal(
      config.mail.transport,
      'smtp',
      `o ambiente está com o transporte \`${config.mail.transport}\`, que não abre ` +
        `socket nenhum. Este arquivo mede o TRANSPORTE: com \`log\` ele não teria o que ` +
        `medir. Rode com \`MAIL_TRANSPORT\` diferente de \`log\` (o .env do compose já é ` +
        `assim).`,
    );
  });

  void it('1 — a mensagem chega ao receptor local, lida na API dele e não no log', async () => {
    const para = enderecoDoCaso('chegada');

    await enviarDeVerdade({
      para,
      assunto: 'Encerramos as sessões da sua conta no Bichu',
      corpo: 'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta.',
    });

    const recebida = await esperarNaCaixa(para);
    assert.equal(
      recebida.To[0]?.Address,
      para,
      'a mensagem encontrada no receptor não é a que este caso mandou',
    );
  });

  void it('2 — destinatário, assunto e corpo chegam como `montarMensagem` os montou', async () => {
    const para = enderecoDoCaso('fidelidade');
    const mensagem: Mensagem = {
      para,
      assunto: 'Encerramos as sessões da sua conta no Bichu',
      corpo:
        'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta, ' +
        'e encerramos todas as sessões.\n\nSe não foi você, troque sua senha.',
    };

    // O esperado sai do PRÓPRIO `montarMensagem`, e não de literais copiados
    // para cá. Copiar transformaria este caso numa segunda cópia da mensagem,
    // que envelhece em silêncio no dia em que o modelo mudar; derivar faz o
    // caso acompanhar o código e continuar perguntando a única coisa que ele
    // sabe responder — "o que foi montado é o que chegou?".
    const montada = montarMensagem(config.mail, mensagem);
    const assuntoMontado = /^Subject: (.*)$/m.exec(montada)?.[1]?.replace(/\r$/, '');
    assert.ok(assuntoMontado !== undefined, 'a montagem não produziu um `Subject:`');

    await enviarDeVerdade(mensagem);
    const recebida = await esperarNaCaixa(para);

    assert.equal(recebida.To[0]?.Address, para, 'chegou a outro destinatário');
    assert.equal(recebida.To.length, 1, 'chegou a mais de um destinatário');
    assert.equal(recebida.From.Address, config.mail.from, 'o remetente não é o configurado');
    assert.equal(recebida.Subject, assuntoMontado, 'o assunto recebido não é o assunto montado');
    // O protocolo separa linha por `\r\n`; a comparação normaliza para não
    // reprovar por causa disso, que não é o que o caso pergunta.
    assert.equal(
      recebida.Text.replace(/\r\n/g, '\n').trimEnd(),
      mensagem.corpo,
      'o corpo recebido não é o corpo enviado',
    );
  });

  void it('3 — corpo com uma linha de um ponto só chega inteiro, e não cortado no ponto', async () => {
    const para = enderecoDoCaso('ponto');
    // A linha com o ponto sozinho é o terminador dos dados no SMTP. O texto
    // DEPOIS dela é o que prova o escape: sem `escaparPontos`, a mensagem
    // termina no ponto e o link de redefinição — que vem depois — não chega. A
    // vítima receberia um aviso pela metade, sem a única ação que ele pede.
    const depoisDoPonto = `Se não foi você, troque sua senha: ${config.publicBaseUrl}/redefinir-senha?token=${EXECUCAO}`;
    const mensagem: Mensagem = {
      para,
      assunto: 'Encerramos as sessões da sua conta no Bichu',
      corpo: `Alguém pode ter copiado o acesso da sua conta.\n.\n${depoisDoPonto}`,
    };

    await enviarDeVerdade(mensagem);
    const recebida = await esperarNaCaixa(para);

    const linhas = recebida.Text.replace(/\r\n/g, '\n').trimEnd().split('\n');
    assert.deepEqual(
      linhas,
      ['Alguém pode ter copiado o acesso da sua conta.', '.', depoisDoPonto],
      'o corpo com a linha de um ponto só não chegou inteiro. O `escaparPontos` de ' +
        '`smtp-mailer.ts` é o que impede isso: sem ele o servidor lê a linha do ponto ' +
        'como fim dos dados, a mensagem termina ali, e o que vier depois vira comando ' +
        'de protocolo. O teste de unidade de BICHUS-130 prova o texto MONTADO; este ' +
        'caso é o único que prova que o servidor concorda.',
    );
    // Afirmado à parte porque é o outro lado do mesmo defeito: escapar demais
    // também estraga a mensagem, e entrega um `..` onde a pessoa escreveu `.`.
    // O `..` do protocolo é desfeito pelo servidor; se ele chegar, é porque o
    // escape foi aplicado duas vezes.
    assert.ok(
      !recebida.Text.includes('\r\n..'),
      'o ponto chegou escapado (`..`): o escape do protocolo foi aplicado duas vezes e ' +
        'a pessoa vai ler um caractere que ninguém escreveu.',
    );
  });

  void it('4 — assunto com `\\r\\n` não vira cabeçalho novo na mensagem RECEBIDA', async () => {
    const para = enderecoDoCaso('injecao');
    const enderecoDoAtacante = `atacante-${EXECUCAO}@${DOMINIO_DE_TESTE}`;
    // O que um atacante tentaria: fechar o `Subject:` e abrir um `Bcc:` para
    // si. Se passasse, ele receberia cópia integral do aviso de segurança da
    // vítima — com o link de redefinição de senha dentro.
    const mensagem: Mensagem = {
      para,
      assunto: `Encerramos as sessões\r\nBcc: ${enderecoDoAtacante}`,
      corpo: 'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta.',
    };

    await enviarDeVerdade(mensagem);
    const recebida = await esperarNaCaixa(para);
    const cabecalhos = cabecalhosDe(await lerBruta(recebida.ID));

    // A pergunta do caso é sobre o que o SERVIDOR entendeu, e é por isso que
    // ela é feita ao código-fonte gravado por ele, e não ao texto que saiu
    // daqui. BICHUS-130 já provou a limpeza no texto montado; o que faltava era
    // saber se o outro lado leu um cabeçalho a mais.
    const injetados = cabecalhos.filter((linha) => /^Bcc:/i.test(linha));
    assert.deepEqual(
      injetados,
      [],
      `o assunto com quebra de linha criou um cabeçalho \`Bcc:\` na mensagem recebida. ` +
        `A limpeza do assunto em \`montarMensagem\` é o que fecha essa porta: sem ela, ` +
        `quem escolher o assunto recebe cópia integral do aviso de segurança da vítima, ` +
        `com o link de redefinição dentro. Cabeçalhos recebidos: ` +
        `${JSON.stringify(cabecalhos)}`,
    );
    assert.deepEqual(
      recebida.Bcc,
      [],
      'o receptor registrou um destinatário em cópia oculta que ninguém escreveu',
    );

    const assuntos = cabecalhos.filter((linha) => /^Subject:/i.test(linha));
    assert.equal(
      assuntos.length,
      1,
      `a mensagem recebida tem ${String(assuntos.length)} cabeçalhos \`Subject:\`. ` +
        `Um assunto que vira dois cabeçalhos é a mesma quebra de linha passando: ` +
        `${JSON.stringify(assuntos)}`,
    );
    // O assunto continua sendo o que a pessoa escreveu, numa linha só — a
    // decisão de `montarMensagem` é limpar, e não recusar. Afirmar o valor
    // inteiro (e não só "não tem Bcc") é o que impede a defesa de virar um
    // `assunto = ''`, que também passaria nas duas afirmações acima.
    assert.equal(
      recebida.Subject,
      `Encerramos as sessões Bcc: ${enderecoDoAtacante}`,
      'o assunto recebido não é o assunto limpo: a quebra virou espaço, e o resto do ' +
        'texto continua sendo assunto — não pode sumir nem virar outra coisa.',
    );
  });
});
