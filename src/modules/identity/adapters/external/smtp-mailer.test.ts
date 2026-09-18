/**
 * As duas defesas de injeção do `smtp-mailer` (BICHUS-130).
 *
 * ## Por que estes casos olham o TEXTO montado, e não um retorno
 *
 * Falha de escape em SMTP **não levanta erro**. A mensagem sai, o servidor
 * responde `250`, e o `enviar()` resolve normalmente — só que o que chegou não
 * é o que se quis mandar. Um teste que afirmasse "o envio não explodiu" ficaria
 * verde no exato cenário que interessa: o atacante recebendo, por `Bcc`, cópia
 * do aviso de segurança da vítima. Por isso tudo aqui lê `montarMensagem`
 * linha a linha.
 *
 * ## As duas defesas
 *
 * 1. `Subject:` — o assunto passa por `.replace(/[\r\n]+/g, ' ')`. Sem isso,
 *    um assunto com CRLF fecha o cabeçalho e o que vem depois vira **cabeçalho
 *    novo**: `Bcc:` para o endereço que o atacante escolher.
 * 2. Corpo — um ponto sozinho numa linha **encerra os dados** no SMTP. Sem o
 *    escape, um corpo com essa linha termina o e-mail no meio e o resto da
 *    mensagem é lido pelo servidor como comando de protocolo.
 *
 * Nenhuma das duas depende de socket, de rede ou de contêiner: são funções
 * puras, e é só por isso que este arquivo existe sem nada de integração. O
 * transporte em si (falar SMTP de verdade) é outra issue.
 *
 * ## Isca
 *
 * Cada defesa foi removida do código de produção, a suíte rodada e o caso dela
 * conferido reprovando, antes de ser restaurada. Defesa cuja remoção não
 * reprova nada não está provada — era exatamente esse o estado antes daqui.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escaparPontos, montarMensagem } from './smtp-mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';
import type { Mensagem } from '../../ports/mailer.js';

/**
 * Configuração descartável. Nada aqui está sob teste — o que está sob teste é
 * o tratamento do que vem de `Mensagem`, que é a parte que pode carregar
 * conteúdo escolhido por outra pessoa.
 */
const CONFIG: MailConfig = {
  transport: 'smtp',
  host: 'mail',
  port: 1025,
  from: 'nao-responda@mail.exemplo.test',
  fromName: 'Bichu',
  replyTo: 'nao-responda@mail.exemplo.test',
};

const ENDERECO_DA_VITIMA = 'vitima@exemplo.test';

function mensagem(campos: Partial<Mensagem>): Mensagem {
  return {
    para: ENDERECO_DA_VITIMA,
    assunto: 'Redefinir sua senha do Bichu',
    corpo: 'Use o link abaixo.',
    ...campos,
  };
}

/** O protocolo separa linha por `\r\n`, então é assim que a mensagem é lida. */
function linhasDe(bruta: string): string[] {
  return bruta.split('\r\n');
}

/**
 * O bloco de cabeçalhos vai até a primeira linha vazia — é ela que, no
 * protocolo, marca onde o cabeçalho acaba e o corpo começa. Injeção de
 * cabeçalho é exatamente conseguir fazer aparecer uma linha a mais ANTES dela.
 */
function cabecalhosDe(bruta: string): string[] {
  const linhas = linhasDe(bruta);
  const vazia = linhas.indexOf('');
  assert.notEqual(vazia, -1, 'a mensagem precisa ter a linha em branco que separa cabeçalho de corpo');
  return linhas.slice(0, vazia);
}

/** O que sobra depois da linha em branco, sem o terminador final. */
function corpoDe(bruta: string): string[] {
  const linhas = linhasDe(bruta);
  return linhas.slice(linhas.indexOf('') + 1, -1);
}

function valorDo(bruta: string, nome: string): string | undefined {
  const prefixo = `${nome}: `;
  const achada = cabecalhosDe(bruta).find((l) => l.startsWith(prefixo));
  return achada?.slice(prefixo.length);
}

const CABECALHOS_ESPERADOS = ['From', 'To', 'Reply-To', 'Subject', 'MIME-Version', 'Content-Type'];

/**
 * Nenhum cabeçalho além dos que o código escreve.
 *
 * Esta é a asserção que pega a injeção de verdade: procurar só por `Bcc:`
 * pegaria o ataque do exemplo e deixaria passar `Cc:`, `Reply-To:` duplicado,
 * `Content-Type:` trocado para HTML e qualquer outro nome que alguém invente
 * depois. Contar e nomear o conjunto inteiro não tem essa brecha.
 */
function conferirQueNenhumCabecalhoApareceu(bruta: string): void {
  const nomes = cabecalhosDe(bruta).map((l) => l.slice(0, l.indexOf(':')));
  assert.deepEqual(nomes, CABECALHOS_ESPERADOS);
}

void describe('montarMensagem — injeção de cabeçalho pelo assunto', () => {
  void it('assunto com \\r\\n sai numa linha só e não cria cabeçalho nenhum', () => {
    // O ataque literal da issue: fechar o `Subject:` e abrir um `Bcc:`, que
    // manda cópia integral do e-mail — inclusive o link de redefinição de
    // senha — para o endereço do atacante.
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: 'Redefinir sua senha\r\nBcc: atacante@mal.test' }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Redefinir sua senha Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
    assert.equal(cabecalhosDe(bruta).length, CABECALHOS_ESPERADOS.length);
  });

  void it('assunto com \\n sozinho também', () => {
    // `\n` sozinho é o caso que uma limpeza escrita como `.replace('\r\n', …)`
    // deixaria passar inteiro — e há servidor que aceita LF nu como quebra.
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: 'Aviso\nBcc: atacante@mal.test' }));

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('assunto com \\r sozinho também', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: 'Aviso\rBcc: atacante@mal.test' }));

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('assunto com quebras repetidas vira um espaço só, sem linha em branco no meio do cabeçalho', () => {
    // `\r\n\r\n` é o ataque mais direto de todos: a linha em branco ENCERRA o
    // cabeçalho, então sem a limpeza o resto do assunto viraria corpo — e o
    // corpo verdadeiro entraria depois dele, num e-mail que o usuário leria
    // como se fosse nosso.
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: 'Aviso\r\n\r\nTexto falso assinado pelo Bichu' }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Texto falso assinado pelo Bichu');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('assunto legítimo com ponto e acento chega intacto', () => {
    // A defesa não pode custar o caso normal: limpeza que estragasse assunto
    // comum seria trocada por ninguém na primeira reclamação.
    const assunto = 'Sua senha do Bichu foi alterada. Confira.';
    const bruta = montarMensagem(CONFIG, mensagem({ assunto }));

    assert.equal(valorDo(bruta, 'Subject'), assunto);
  });
});

void describe('montarMensagem — o destinatário e o corpo legítimos', () => {
  void it('o To: leva o endereço do usuário, sem sobrar nem faltar nada', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: 'Aviso\r\nBcc: atacante@mal.test' }));

    // Mesmo sob o ataque no assunto, o destinatário continua sendo só a vítima:
    // o que o atacante queria era um SEGUNDO destinatário, e ele não existe.
    assert.equal(valorDo(bruta, 'To'), ENDERECO_DA_VITIMA);
  });

  void it('ponto no meio da frase não vira ponto dobrado no corpo', () => {
    // O escape é `^\.` de propósito. Um escape escrito sem a âncora dobraria
    // todo ponto do texto e entregaria "Ola.. Tudo bem?? " ao usuário — defesa
    // que corrompe conteúdo legítimo é removida na semana seguinte.
    const corpo = 'Olá. Tudo bem? Acesse a versão 1.2 do app. Obrigado.';
    const bruta = montarMensagem(CONFIG, mensagem({ corpo }));

    assert.deepEqual(corpoDe(bruta), [corpo]);
  });

  void it('a mensagem termina no terminador de dados, e ele é o único ponto sozinho', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ corpo: 'Linha um.\nLinha dois.' }));

    assert.ok(bruta.endsWith('\r\n.'), 'o bloco de DATA precisa terminar em `\\r\\n.`');
    const sozinhos = linhasDe(bruta).filter((l) => l === '.');
    assert.equal(sozinhos.length, 1, 'só o terminador pode ser uma linha com um ponto');
  });
});

void describe('escaparPontos — injeção de SMTP pelo corpo', () => {
  void it('linha contendo APENAS um ponto é escapada — é ela que encerra a mensagem', () => {
    // Sem o escape, o servidor leria o `.` como fim dos dados e trataria
    // `RCPT TO:<atacante@mal.test>` como comando: cópia da mensagem para quem
    // o atacante quiser, sem erro nenhum em lugar nenhum.
    const corpo = 'Use o link abaixo.\n.\nRCPT TO:<atacante@mal.test>';
    const bruta = montarMensagem(CONFIG, mensagem({ corpo }));

    assert.deepEqual(corpoDe(bruta), [
      'Use o link abaixo.',
      '..',
      'RCPT TO:<atacante@mal.test>',
    ]);
    const sozinhos = linhasDe(bruta).filter((l) => l === '.');
    assert.equal(sozinhos.length, 1, 'o único ponto sozinho tem que ser o terminador final');
  });

  void it('linha que começa com ponto é escapada depois de \\n sozinho', () => {
    assert.equal(escaparPontos('oi\n.fim'), 'oi\r\n..fim');
  });

  void it('linha que começa com ponto é escapada depois de \\r\\n', () => {
    // O par e o LF nu precisam ser tratados IGUAL. Uma implementação que
    // escapasse só um dos dois deixaria o outro como caminho de injeção
    // aberto, e o defeito seria invisível em qualquer teste de envio.
    assert.equal(escaparPontos('oi\r\n.fim'), 'oi\r\n..fim');
  });

  void it('ponto no primeiro caractere do corpo é escapado', () => {
    // Não há quebra antes dele: quem escreveu o escape com `\n\.` em vez de
    // `^\.` perderia justamente este.
    assert.equal(escaparPontos('.tudo bem'), '..tudo bem');
  });

  void it('só o primeiro ponto da linha é dobrado', () => {
    // O protocolo manda dobrar o ponto inicial, não todos: dobrar demais
    // entregaria ao usuário um texto diferente do que foi escrito.
    assert.equal(escaparPontos('..x'), '...x');
    assert.equal(escaparPontos('.\n.\n'), '..\r\n..\r\n');
  });

  void it('o corpo sai todo em \\r\\n, porque LF nu faz servidor estrito recusar o e-mail inteiro', () => {
    assert.equal(escaparPontos('a\nb\r\nc'), 'a\r\nb\r\nc');
  });

  void it('corpo sem ponto no início de linha atravessa sem mudança de conteúdo', () => {
    assert.equal(escaparPontos('linha um\nlinha dois'), 'linha um\r\nlinha dois');
  });
});
