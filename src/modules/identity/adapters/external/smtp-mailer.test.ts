/**
 * As quatro defesas de injeção do `smtp-mailer` (BICHUS-130 e BICHUS-131).
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
 * ## As quatro defesas
 *
 * 1. `Subject:` — o assunto passa por `limparAssunto`. Sem isso, um assunto com
 *    CRLF fecha o cabeçalho e o que vem depois vira **cabeçalho novo**: `Bcc:`
 *    para o endereço que o atacante escolher.
 * 2. Corpo — um ponto sozinho numa linha **encerra os dados** no SMTP. Sem o
 *    escape, um corpo com essa linha termina o e-mail no meio e o resto da
 *    mensagem é lido pelo servidor como comando de protocolo.
 * 3. `To:` e `RCPT TO:<…>` — o destinatário é interpolado nos dois. Aqui a
 *    defesa **recusa** em vez de limpar, e é por isso que os casos dela esperam
 *    exceção e não texto limpo: endereço com CRLF não é endereço mal formatado,
 *    é tentativa, e limpar entregaria a mensagem em silêncio a um endereço que
 *    ninguém escreveu.
 * 4. `From:` e `MAIL FROM:<…>` — o remetente vem da configuração, que também é
 *    entrada, e é interpolado nos mesmos dois lugares.
 *
 * Nenhuma das quatro depende de socket, de rede ou de contêiner: são funções
 * puras, e é só por isso que este arquivo existe sem nada de integração. O
 * transporte em si (falar SMTP de verdade) é outra issue.
 *
 * ## Isca
 *
 * Cada defesa foi removida do código de produção, a suíte rodada e o caso dela
 * conferido reprovando, antes de ser restaurada. Defesa cuja remoção não
 * reprova nada não está provada.
 *
 * ## Como os caracteres invisíveis são escritos aqui
 *
 * Por ponto de código (`ch(0x0b)`), nunca como literal. Um VT ou um NEL colado
 * dentro de uma string some no editor, sobrevive mal a cópia e a formatador, e
 * um caso de injeção que perde em silêncio o caractere que ele testa passa por
 * qualquer motivo menos o certo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  conferirDestinatario,
  conferirRemetente,
  criarMailer,
  escaparPontos,
  montarMensagem,
} from './smtp-mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';
import type { Mensagem } from '../../ports/mailer.js';

/** Um caractere pelo ponto de código. Ver a nota no cabeçalho. */
const ch = (cp: number): string => String.fromCodePoint(cp);

const CR = ch(0x0d);
const LF = ch(0x0a);
const CRLF = `${CR}${LF}`;
const NUL = ch(0x00);
const VT = ch(0x0b);
const FF = ch(0x0c);
const NEL = ch(0x85);
const SEPARADOR_DE_LINHA = ch(0x2028);
const SEPARADOR_DE_PARAGRAFO = ch(0x2029);

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
  // O envio por SMTP não usa este segredo: ele é do webhook de ENTRADA, que é
  // o caminho oposto (`POST /webhooks/postmark`). Está aqui só porque
  // `MailConfig` é um tipo só para os dois sentidos do e-mail.
  webhookSecret: Buffer.from('segredo-de-teste-com-32-bytes!!!', 'utf8'),
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
  return bruta.split(CRLF);
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

/**
 * O caso de injeção pelo endereço, escrito uma vez: ele tem que ser recusado, e
 * a recusa não pode virar texto montado com cabeçalho a mais.
 *
 * Os dois lados juntos importam. Só `assert.throws` deixaria passar uma futura
 * troca da recusa por limpeza; só a contagem de cabeçalhos aprovaria uma
 * limpeza que entrega a mensagem a um endereço que ninguém escreveu.
 */
function conferirQueRecusaSemMontar(para: string, motivo: RegExp): void {
  assert.throws(() => montarMensagem(CONFIG, mensagem({ para })), motivo);
  let bruta: string | undefined;
  try {
    bruta = montarMensagem(CONFIG, mensagem({ para }));
  } catch {
    bruta = undefined;
  }
  if (bruta !== undefined) conferirQueNenhumCabecalhoApareceu(bruta);
  assert.equal(bruta, undefined, 'endereço perigoso tem que ser recusado, não limpo');
}

void describe('montarMensagem — injeção de cabeçalho pelo assunto (defesa 1)', () => {
  void it('assunto com CRLF sai numa linha só e não cria cabeçalho nenhum', () => {
    // O ataque literal da issue: fechar o `Subject:` e abrir um `Bcc:`, que
    // manda cópia integral do e-mail — inclusive o link de redefinição de
    // senha — para o endereço do atacante.
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: `Redefinir sua senha${CRLF}Bcc: atacante@mal.test` }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Redefinir sua senha Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
    assert.equal(cabecalhosDe(bruta).length, CABECALHOS_ESPERADOS.length);
  });

  void it('assunto com LF sozinho também', () => {
    // O LF nu é o caso que uma limpeza escrita como `.replace('\r\n', …)`
    // deixaria passar inteiro — e há servidor que aceita LF nu como quebra.
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: `Aviso${LF}Bcc: atacante@mal.test` }));

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('assunto com CR sozinho também', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: `Aviso${CR}Bcc: atacante@mal.test` }));

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('quebras repetidas viram um espaço só, sem linha em branco no meio do cabeçalho', () => {
    // `\r\n\r\n` é o ataque mais direto de todos: a linha em branco ENCERRA o
    // cabeçalho, então sem a limpeza o resto do assunto viraria corpo — e o
    // corpo verdadeiro entraria depois dele, num e-mail que o usuário leria
    // como se fosse nosso.
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: `Aviso${CRLF}${CRLF}Texto falso assinado pelo Bichu` }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Texto falso assinado pelo Bichu');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('VT, FF, NEL e os separadores do Unicode também são limpos do assunto', () => {
    // Nenhum dos cinco é CR nem LF, e três deles nem entram no `\s` do
    // JavaScript. Parte dos analisadores de cabeçalho os lê como quebra, então
    // uma limpeza restrita a `[\r\n]` deixaria a defesa 1 com cinco portas.
    for (const invisivel of [VT, FF, NEL, SEPARADOR_DE_LINHA, SEPARADOR_DE_PARAGRAFO]) {
      const bruta = montarMensagem(
        CONFIG,
        mensagem({ assunto: `Aviso${invisivel}Bcc: atacante@mal.test` }),
      );

      assert.equal(valorDo(bruta, 'Subject'), 'Aviso Bcc: atacante@mal.test');
      conferirQueNenhumCabecalhoApareceu(bruta);
    }
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
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: `Aviso${CRLF}Bcc: atacante@mal.test` }));

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
    const bruta = montarMensagem(CONFIG, mensagem({ corpo: `Linha um.${LF}Linha dois.` }));

    assert.ok(bruta.endsWith(`${CRLF}.`), 'o bloco de DATA precisa terminar em CRLF seguido de ponto');
    const sozinhos = linhasDe(bruta).filter((l) => l === '.');
    assert.equal(sozinhos.length, 1, 'só o terminador pode ser uma linha com um ponto');
  });
});

void describe('escaparPontos — injeção de SMTP pelo corpo (defesa 2)', () => {
  void it('linha contendo APENAS um ponto é escapada — é ela que encerra a mensagem', () => {
    // Sem o escape, o servidor leria o `.` como fim dos dados e trataria
    // `RCPT TO:<atacante@mal.test>` como comando: cópia da mensagem para quem
    // o atacante quiser, sem erro nenhum em lugar nenhum.
    const corpo = `Use o link abaixo.${LF}.${LF}RCPT TO:<atacante@mal.test>`;
    const bruta = montarMensagem(CONFIG, mensagem({ corpo }));

    assert.deepEqual(corpoDe(bruta), [
      'Use o link abaixo.',
      '..',
      'RCPT TO:<atacante@mal.test>',
    ]);
    const sozinhos = linhasDe(bruta).filter((l) => l === '.');
    assert.equal(sozinhos.length, 1, 'o único ponto sozinho tem que ser o terminador final');
  });

  void it('linha que começa com ponto é escapada depois de LF sozinho', () => {
    assert.equal(escaparPontos(`oi${LF}.fim`), `oi${CRLF}..fim`);
  });

  void it('linha que começa com ponto é escapada depois de CRLF', () => {
    // O par e o LF nu precisam ser tratados IGUAL. Uma implementação que
    // escapasse só um dos dois deixaria o outro como caminho de injeção
    // aberto, e o defeito seria invisível em qualquer teste de envio.
    assert.equal(escaparPontos(`oi${CRLF}.fim`), `oi${CRLF}..fim`);
  });

  void it('ponto no primeiro caractere do corpo é escapado', () => {
    // Não há quebra antes dele: quem escreveu o escape sem a âncora de início
    // de linha perderia justamente este.
    assert.equal(escaparPontos('.tudo bem'), '..tudo bem');
  });

  void it('só o primeiro ponto da linha é dobrado', () => {
    // O protocolo manda dobrar o ponto inicial, não todos: dobrar demais
    // entregaria ao usuário um texto diferente do que foi escrito.
    assert.equal(escaparPontos('..x'), '...x');
    assert.equal(escaparPontos(`.${LF}.${LF}`), `..${CRLF}..${CRLF}`);
  });

  void it('o corpo sai todo em CRLF, porque LF nu faz servidor estrito recusar o e-mail inteiro', () => {
    assert.equal(escaparPontos(`a${LF}b${CRLF}c`), `a${CRLF}b${CRLF}c`);
  });

  void it('corpo sem ponto no início de linha atravessa sem mudança de conteúdo', () => {
    assert.equal(escaparPontos(`linha um${LF}linha dois`), `linha um${CRLF}linha dois`);
  });
});

void describe('conferirDestinatario — injeção pelo DESTINATÁRIO (defesa 3)', () => {
  /*
   * O ataque, e por que a asserção é "levantou erro" e não "saiu limpo".
   *
   * `To: ${para}` e `RCPT TO:<${para}>` interpolam o endereço. Com um CRLF
   * dentro dele, a linha do `To:` fecha e a seguinte vira cabeçalho: cópia
   * integral do aviso de segurança da vítima, link de redefinição incluído, na
   * caixa do atacante.
   *
   * Uma implementação que LIMPASSE o endereço passaria numa asserção de
   * "nenhum cabeçalho novo apareceu" e mesmo assim estaria errada: ela
   * entregaria a mensagem a `vitima@exemplo.testBcc: atacante@mal.test`, um
   * endereço que ninguém escreveu, sem avisar ninguém. Por isso o caso exige a
   * recusa.
   */
  void it('Bcc embutido depois de CRLF é RECUSADO, e nenhuma mensagem chega a existir', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${CRLF}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('LF sozinho e CR sozinho também são recusados', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${LF}Bcc: atacante@mal.test`, /quebra de linha/);
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${CR}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('CRLF na PARTE LOCAL é recusado', () => {
    // A quebra antes do `@`. Uma conferência que só olhasse o sufixo do
    // endereço, ou que validasse só o domínio, perderia este.
    conferirQueRecusaSemMontar(`vi${CRLF}Bcc: atacante@mal.test${LF}tima@exemplo.test`, /quebra de linha/);
  });

  void it('CRLF no DOMÍNIO é recusado', () => {
    conferirQueRecusaSemMontar(`vitima@exem${CRLF}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('endereço com ponto sozinho numa linha é recusado — é ele que encerra o DATA', () => {
    // Se este endereço chegasse ao `To:`, o ponto sozinho encerraria o bloco de
    // dados no meio do cabeçalho e o `MAIL FROM:` seguinte seria lido como
    // comando: mensagem nova, com remetente escolhido pelo atacante.
    conferirQueRecusaSemMontar(
      `${ENDERECO_DA_VITIMA}${CRLF}.${CRLF}MAIL FROM:<atacante@mal.test>`,
      /quebra de linha/,
    );
  });

  void it('o `>` fecha o RCPT TO e enxerta parâmetro ESMTP SEM nenhuma quebra de linha', () => {
    // O furo que sobrava depois de BICHUS-131: a defesa procurava só `[\r\n]`,
    // e este ataque não usa nenhum dos dois. `RCPT TO:<vitima@x> NOTIFY=SUCCESS
    // ORCPT=rfc822;atacante@mal.test` faz o servidor mandar o aviso de entrega,
    // com os cabeçalhos originais dentro, para o endereço do atacante.
    conferirQueRecusaSemMontar(
      `${ENDERECO_DA_VITIMA}> NOTIFY=SUCCESS ORCPT=rfc822;atacante@mal.test`,
      /transporte não carrega/,
    );
  });

  void it('o `>` também acrescenta um segundo destinatário na mesma linha de comando', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}>, <atacante@mal.test`, /transporte não carrega/);
  });

  void it('o `:` monta a rota de origem do RFC 821, que passa a mensagem por servidor alheio', () => {
    conferirQueRecusaSemMontar('@relay.mal.test:vitima@exemplo.test', /transporte não carrega/);
  });

  void it('espaço sozinho é recusado — é ele que separa argumento de comando SMTP', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA} Bcc: atacante@mal.test`, /transporte não carrega/);
  });

  void it('NUL é recusado — ele trunca o endereço em MTA escrito em C', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${NUL}@mal.test`, /transporte não carrega/);
  });

  void it('VT, FF, NEL e os separadores do Unicode são recusados no endereço', () => {
    // NEL não entra no `\s` do JavaScript: uma conferência escrita como
    // `/\s/.test(para)`, que é exatamente o que `emailTemFormaValida` usa,
    // deixaria este passar.
    for (const invisivel of [VT, FF, NEL, SEPARADOR_DE_LINHA, SEPARADOR_DE_PARAGRAFO]) {
      conferirQueRecusaSemMontar(
        `${ENDERECO_DA_VITIMA}${invisivel}Bcc: atacante@mal.test`,
        /transporte não carrega/,
      );
    }
  });

  void it('a recusa não despeja o endereço na mensagem de erro', () => {
    // Endereço de usuário é dado pessoal e mensagem de erro vai para o log —
    // o mesmo motivo que mantém a linha do protocolo fora do erro de `dizer`.
    // Uma recusa que vazasse o endereço trocaria um defeito por outro.
    assert.throws(
      () => montarMensagem(CONFIG, mensagem({ para: `${ENDERECO_DA_VITIMA}${CRLF}Bcc: atacante@mal.test` })),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.doesNotMatch(erro.message, /vitima/);
        assert.doesNotMatch(erro.message, /atacante/);
        assert.doesNotMatch(erro.message, /@/);
        return true;
      },
    );
  });
});

void describe('conferirDestinatario — codificação percentual e normalização Unicode', () => {
  void it('percent-encoding NÃO é decodificado aqui, e por isso não vira cabeçalho nenhum', () => {
    // `%` é `atext` legítimo de parte local (RFC 5322). Decodificar aqui
    // transformaria endereço válido em ataque; o que importa é que o texto que
    // chega é o texto que vai para o fio, e no fio a sequência é literal.
    const inofensivo = 'vitima%0d%0aBcc@exemplo.test';
    const bruta = montarMensagem(CONFIG, mensagem({ para: inofensivo }));

    assert.equal(valorDo(bruta, 'To'), inofensivo);
    conferirQueNenhumCabecalhoApareceu(bruta);
    assert.equal(linhasDe(bruta).filter((l) => l === '').length, 1, 'nenhuma linha em branco a mais');

    // Com o espaço do `Bcc: ` ele cai na recusa, porque espaço quebra o comando.
    conferirQueRecusaSemMontar('vitima%0d%0aBcc: atacante@mal.test', /transporte não carrega/);
  });

  void it('percent-encoding DEPOIS de decodificado cai na recusa, que é onde ele tem de cair', () => {
    // O caminho que existiria se alguém montasse o endereço a partir de uma
    // URL: importação, campo administrativo, retorno de provedor.
    conferirQueRecusaSemMontar(
      decodeURIComponent('vitima@exemplo.test%0d%0aBcc:%20atacante@mal.test'),
      /quebra de linha/,
    );
  });

  void it('NENHUM ponto de código do Unicode normaliza para CR ou LF — medido, não afirmado', () => {
    // A hipótese "um caractere Unicode que normaliza para CRLF fura a defesa" é
    // plausível e falsa, e uma frase dizendo isso evapora na primeira
    // refatoração. Este caso mede: os 1.114.112 pontos de código sob as quatro
    // formas de normalização, mais as duas conversões de caixa, porque
    // `normalizarEmail` faz `toLowerCase`. Roda em ~90 ms.
    //
    // Se uma versão futura do Unicode acrescentar uma decomposição dessas, este
    // caso reprova e a conferência passa a precisar de um passo de normalização.
    const produzem: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (cp === 0x0d || cp === 0x0a) continue;
      const caractere = String.fromCodePoint(cp);
      const derivados = [
        caractere.normalize('NFC'),
        caractere.normalize('NFD'),
        caractere.normalize('NFKC'),
        caractere.normalize('NFKD'),
        caractere.toLowerCase(),
        caractere.toUpperCase(),
      ];
      if (derivados.some((d) => d.includes(CR) || d.includes(LF))) {
        produzem.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }

    assert.deepEqual(
      produzem,
      [],
      'algum ponto de código passou a produzir CR/LF: a conferência precisa normalizar antes',
    );
  });

  void it('os separadores de linha do Unicode são recusados pelo que são, não pelo que viram', () => {
    // A defesa que de fato existe contra a família Unicode. Ela não depende de
    // normalização nenhuma: recusa o caractere direto.
    for (const separador of [NEL, SEPARADOR_DE_LINHA, SEPARADOR_DE_PARAGRAFO]) {
      assert.throws(() => { conferirDestinatario(`a@b.test${separador}x`); }, /transporte não carrega/);
    }
  });
});

void describe('conferirDestinatario — o que NÃO pode ser recusado', () => {
  void it('endereço legítimo continua passando, com o To: intacto', () => {
    // Sem este caso, uma implementação que recusasse TODO endereço passaria em
    // tudo que está acima — e o produto pararia de mandar e-mail.
    const bruta = montarMensagem(CONFIG, mensagem({ para: ENDERECO_DA_VITIMA }));

    assert.equal(valorDo(bruta, 'To'), ENDERECO_DA_VITIMA);
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('ponto, etiqueta com `+`, apóstrofo e os símbolos de `atext` passam', () => {
    // `domain/email.ts` decide de propósito NÃO remover ponto na parte local
    // nem o sufixo `+etiqueta`, e a validação de forma de lá é frouxa de
    // propósito. O adaptador não pode ser MAIS estrito em nada além da
    // gramática do transporte: conta que se cadastrou e depois não recebe o
    // e-mail de verificação é conta morta, sem erro visível para o usuário.
    for (const endereco of [
      'ana.paula+bichu@exemplo.test',
      "o'brien@exemplo.test",
      'joao_silva-99@sub.exemplo.com.br',
      'conta!#$%&*+-/=?^_`{|}~@exemplo.test',
    ]) {
      assert.doesNotThrow(() => { conferirDestinatario(endereco); }, endereco);
      assert.equal(valorDo(montarMensagem(CONFIG, mensagem({ para: endereco })), 'To'), endereco);
    }
  });
});

void describe('conferirRemetente — a configuração também é entrada (defesa 4)', () => {
  void it('MAIL_FROM_NAME com CRLF derruba a criação do mailer, e não o primeiro envio', () => {
    // A recusa é em `criarMailer` para o processo NÃO subir. Descobrir no
    // primeiro envio significa descobrir em produção, com a mensagem entregue
    // e o `Bcc:` já no cabeçalho de todo e-mail que o produto manda.
    assert.throws(
      () => criarMailer({ ...CONFIG, fromName: `Bichu${CRLF}Bcc: atacante@mal.test` }),
      /MAIL_FROM_NAME/,
    );
  });

  void it('MAIL_FROM e MAIL_REPLY_TO com quebra também derrubam', () => {
    assert.throws(() => criarMailer({ ...CONFIG, from: `a@b.test${CRLF}Bcc: x@mal.test` }), /MAIL_FROM/);
    assert.throws(() => criarMailer({ ...CONFIG, replyTo: `a@b.test${LF}Bcc: x@mal.test` }), /MAIL_REPLY_TO/);
  });

  void it('o nome de exibição pode ter espaço e acento — só não pode fechar a linha', () => {
    assert.doesNotThrow(() => { conferirRemetente({ ...CONFIG, fromName: 'Bichu, a rede dos pets' }); });
  });

  void it('a recusa do remetente não despeja o endereço configurado na mensagem', () => {
    assert.throws(
      () => conferirRemetente({ ...CONFIG, from: `contato@bichu.test${CRLF}x` }),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.doesNotMatch(erro.message, /contato/);
        assert.doesNotMatch(erro.message, /@/);
        return true;
      },
    );
  });
});

void describe('criarMailer — a recusa acontece na ENTRADA da porta', () => {
  /*
   * Por que não basta conferir dentro de `montarMensagem`.
   *
   * No transporte SMTP, `RCPT TO:<${para}>` vai para a rede **antes** de
   * `montarMensagem` ser chamado. Uma conferência só lá dentro chegaria tarde:
   * o comando enxertado já teria sido escrito no socket e o servidor já teria
   * registrado o destinatário a mais. Por isso `enviar` confere antes de abrir
   * a conexão, e é isso que estes casos afirmam.
   */
  void it('transporte smtp recusa antes de abrir conexão', async () => {
    const mailer = criarMailer(CONFIG);

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}${CRLF}Bcc: atacante@mal.test` })),
      /quebra de linha/,
    );
  });

  void it('transporte smtp recusa o `>` antes de abrir conexão', async () => {
    // Este é o que mais importa dos dois: sem quebra de linha, ele só seria
    // pego aqui, e `montarMensagem` roda DEPOIS do `RCPT TO:` ir para o fio.
    const mailer = criarMailer(CONFIG);

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}> NOTIFY=SUCCESS` })),
      /transporte não carrega/,
    );
  });

  void it('transporte log recusa igual, para a porta não ensinar o contrário', async () => {
    // O transporte de desenvolvimento não pode aceitar o que o de produção
    // recusa: quem testar contra ele aprenderia a regra errada.
    const mailer = criarMailer({ ...CONFIG, transport: 'log' });

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}${LF}Bcc: atacante@mal.test` })),
      /quebra de linha/,
    );
  });
});
