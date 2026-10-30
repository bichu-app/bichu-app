/** As quatro defesas de injeção do `smtp-mailer` (BICHUS-130 e BICHUS-131). */
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

/** Um caractere pelo ponto de código. */
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

/** Configuração descartável. */
const CONFIG: MailConfig = {
  transport: 'smtp',
  host: 'mail',
  port: 1025,
  from: 'nao-responda@mail.exemplo.test',
  fromName: 'Bichu',
  replyTo: 'nao-responda@mail.exemplo.test',
  webhookSecret: Buffer.from('segredo-de-teste-com-32-bytes!!!', 'utf8'),
  apiToken: undefined,
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
 * O bloco de cabeçalhos vai até a primeira linha vazia — é ela que, no protocolo,
 * marca onde o cabeçalho acaba e o corpo começa.
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

/** Nenhum cabeçalho além dos que o código escreve. */
function conferirQueNenhumCabecalhoApareceu(bruta: string): void {
  const nomes = cabecalhosDe(bruta).map((l) => l.slice(0, l.indexOf(':')));
  assert.deepEqual(nomes, CABECALHOS_ESPERADOS);
}

/**
 * O caso de injeção pelo endereço, escrito uma vez: ele tem que ser recusado, e a
 * recusa não pode virar texto montado com cabeçalho a mais.
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
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: `Redefinir sua senha${CRLF}Bcc: atacante@mal.test` }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Redefinir sua senha Bcc: atacante@mal.test');
    conferirQueNenhumCabecalhoApareceu(bruta);
    assert.equal(cabecalhosDe(bruta).length, CABECALHOS_ESPERADOS.length);
  });

  void it('assunto com LF sozinho também', () => {
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
    const bruta = montarMensagem(
      CONFIG,
      mensagem({ assunto: `Aviso${CRLF}${CRLF}Texto falso assinado pelo Bichu` }),
    );

    assert.equal(valorDo(bruta, 'Subject'), 'Aviso Texto falso assinado pelo Bichu');
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('VT, FF, NEL e os separadores do Unicode também são limpos do assunto', () => {
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
    const assunto = 'Sua senha do Bichu foi alterada. Confira.';
    const bruta = montarMensagem(CONFIG, mensagem({ assunto }));

    assert.equal(valorDo(bruta, 'Subject'), assunto);
  });
});

void describe('montarMensagem — o destinatário e o corpo legítimos', () => {
  void it('o To: leva o endereço do usuário, sem sobrar nem faltar nada', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ assunto: `Aviso${CRLF}Bcc: atacante@mal.test` }));

    assert.equal(valorDo(bruta, 'To'), ENDERECO_DA_VITIMA);
  });

  void it('ponto no meio da frase não vira ponto dobrado no corpo', () => {
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
    assert.equal(escaparPontos(`oi${CRLF}.fim`), `oi${CRLF}..fim`);
  });

  void it('ponto no primeiro caractere do corpo é escapado', () => {
    assert.equal(escaparPontos('.tudo bem'), '..tudo bem');
  });

  void it('só o primeiro ponto da linha é dobrado', () => {
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
  void it('Bcc embutido depois de CRLF é RECUSADO, e nenhuma mensagem chega a existir', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${CRLF}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('LF sozinho e CR sozinho também são recusados', () => {
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${LF}Bcc: atacante@mal.test`, /quebra de linha/);
    conferirQueRecusaSemMontar(`${ENDERECO_DA_VITIMA}${CR}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('CRLF na PARTE LOCAL é recusado', () => {
    conferirQueRecusaSemMontar(`vi${CRLF}Bcc: atacante@mal.test${LF}tima@exemplo.test`, /quebra de linha/);
  });

  void it('CRLF no DOMÍNIO é recusado', () => {
    conferirQueRecusaSemMontar(`vitima@exem${CRLF}Bcc: atacante@mal.test`, /quebra de linha/);
  });

  void it('endereço com ponto sozinho numa linha é recusado — é ele que encerra o DATA', () => {
    conferirQueRecusaSemMontar(
      `${ENDERECO_DA_VITIMA}${CRLF}.${CRLF}MAIL FROM:<atacante@mal.test>`,
      /quebra de linha/,
    );
  });

  void it('o `>` fecha o RCPT TO e enxerta parâmetro ESMTP SEM nenhuma quebra de linha', () => {
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
    for (const invisivel of [VT, FF, NEL, SEPARADOR_DE_LINHA, SEPARADOR_DE_PARAGRAFO]) {
      conferirQueRecusaSemMontar(
        `${ENDERECO_DA_VITIMA}${invisivel}Bcc: atacante@mal.test`,
        /transporte não carrega/,
      );
    }
  });

  void it('a recusa não despeja o endereço na mensagem de erro', () => {
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
    const inofensivo = 'vitima%0d%0aBcc@exemplo.test';
    const bruta = montarMensagem(CONFIG, mensagem({ para: inofensivo }));

    assert.equal(valorDo(bruta, 'To'), inofensivo);
    conferirQueNenhumCabecalhoApareceu(bruta);
    assert.equal(linhasDe(bruta).filter((l) => l === '').length, 1, 'nenhuma linha em branco a mais');

    conferirQueRecusaSemMontar('vitima%0d%0aBcc: atacante@mal.test', /transporte não carrega/);
  });

  void it('percent-encoding DEPOIS de decodificado cai na recusa, que é onde ele tem de cair', () => {
    conferirQueRecusaSemMontar(
      decodeURIComponent('vitima@exemplo.test%0d%0aBcc:%20atacante@mal.test'),
      /quebra de linha/,
    );
  });

  void it('NENHUM ponto de código do Unicode normaliza para CR ou LF — medido, não afirmado', () => {
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
    for (const separador of [NEL, SEPARADOR_DE_LINHA, SEPARADOR_DE_PARAGRAFO]) {
      assert.throws(() => { conferirDestinatario(`a@b.test${separador}x`); }, /transporte não carrega/);
    }
  });
});

void describe('conferirDestinatario — o que NÃO pode ser recusado', () => {
  void it('endereço legítimo continua passando, com o To: intacto', () => {
    const bruta = montarMensagem(CONFIG, mensagem({ para: ENDERECO_DA_VITIMA }));

    assert.equal(valorDo(bruta, 'To'), ENDERECO_DA_VITIMA);
    conferirQueNenhumCabecalhoApareceu(bruta);
  });

  void it('ponto, etiqueta com `+`, apóstrofo e os símbolos de `atext` passam', () => {
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
  void it('transporte smtp recusa antes de abrir conexão', async () => {
    const mailer = criarMailer(CONFIG);

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}${CRLF}Bcc: atacante@mal.test` })),
      /quebra de linha/,
    );
  });

  void it('transporte smtp recusa o `>` antes de abrir conexão', async () => {
    const mailer = criarMailer(CONFIG);

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}> NOTIFY=SUCCESS` })),
      /transporte não carrega/,
    );
  });

  void it('transporte log recusa igual, para a porta não ensinar o contrário', async () => {
    const mailer = criarMailer({ ...CONFIG, transport: 'log' });

    await assert.rejects(
      () => mailer.enviar(mensagem({ para: `${ENDERECO_DA_VITIMA}${LF}Bcc: atacante@mal.test` })),
      /quebra de linha/,
    );
  });
});
