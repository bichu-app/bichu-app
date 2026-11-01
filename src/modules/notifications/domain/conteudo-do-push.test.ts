import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assegurarSuperficiePublica,
  montarMensagemDePush,
  VazamentoNoPushError,
  type ContextoDoAviso,
} from './conteudo-do-push.js';
import { montarAvisoDePedidoAprovado } from './conteudo-do-push.js';

const TELEFONE = '(11) 98888-7777';
const ENDERECO = 'Rua Harmonia, 123';
const EMAIL = 'tutor@exemplo.com.br';
const PET_ID = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
const CASO_ID = '018f7c20-1111-7222-8333-444455556666';
const USUARIO_ID = '018f7c21-9999-7888-8777-666655554444';
const CEP = '01310-100';
const COORDENADA = '-23.5505,-46.6333';

const TOKEN_PUBLICO = 'k7QpZr3XmBvNs2Td';

function contexto(ajuste: Partial<ContextoDoAviso> = {}): ContextoDoAviso {
  return {
    tipo: 'tagEscaneada',
    token: 'token-de-aparelho-descartavel',
    nomeDoPet: 'Nina',
    tokenPublico: TOKEN_PUBLICO,
    bairro: 'Vila Madalena',
    casoAberto: true,
    sigiloso: {
      petId: PET_ID,
      casoId: CASO_ID,
      usuarioId: USUARIO_ID,
      telefoneDoTutor: TELEFONE,
      enderecoDoAchado: ENDERECO,
      emailDoTutor: EMAIL,
      cepDoTutor: CEP,
      coordenadaDoAchado: COORDENADA,
    },
    ...ajuste,
  };
}

void describe('nenhum dado sensível entra no payload', () => {
  void it('o mundo inteiro entra e nada sensível sai', () => {
    const conteudo = montarMensagemDePush(contexto());
    const noFio = JSON.stringify(conteudo);

    for (const proibido of [
      TELEFONE,
      ENDERECO,
      EMAIL,
      PET_ID,
      CASO_ID,
      USUARIO_ID,
      CEP,
      COORDENADA,
    ]) {
      assert.ok(
        !noFio.includes(proibido),
        `REPROVA: "${proibido}" saiu no payload do push. Notificação é ` +
          `superfície pública (ADR-0010) e isso aparece na tela bloqueada.`,
      );
    }

    assert.equal(conteudo.dados['ref'], TOKEN_PUBLICO);
    assert.equal(conteudo.dados['tipo'], 'tagEscaneada');
    assert.ok(conteudo.titulo.includes('Nina'));
    assert.ok(conteudo.corpo.includes('Vila Madalena'));
  });

  void it('o payload tem DOIS campos de dados, e nenhum a mais', () => {
    assert.deepEqual(Object.keys(montarMensagemDePush(contexto()).dados).sort(), [
      'ref',
      'tipo',
    ]);
  });
});

void describe('a porteira reprova cada forma proibida (as iscas)', () => {
  function exigirReprovacao(
    nomeDoCaso: string,
    montar: () => unknown,
    padrao: string,
  ): void {
    void it(nomeDoCaso, () => {
      assert.throws(
        montar,
        (erro: unknown) =>
          erro instanceof VazamentoNoPushError &&
          erro.padrao === padrao &&
          erro.message.includes('NÃO é impresso'),
        `REPROVA: a porteira deixou passar "${padrao}".`,
      );
    });
  }

  exigirReprovacao(
    'UUID no lugar do share_token vaza a base inteira como telemetria (SEC-002)',
    () => montarMensagemDePush(contexto({ tokenPublico: CASO_ID })),
    'UUID de banco',
  );

  exigirReprovacao(
    'UUID sem hífens continua sendo o mesmo UUID',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: 'Toque para falar.',
        dados: { ref: CASO_ID.replaceAll('-', '') },
        chaveDeAgrupamento: 'tagEscaneada:x',
      }),
    'UUID sem hífens',
  );

  exigirReprovacao(
    'UUID na CHAVE do mapa de dados vaza igual ao UUID no valor',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: 'Toque para falar.',
        dados: { [PET_ID]: '1' },
        chaveDeAgrupamento: 'tagEscaneada:x',
      }),
    'UUID de banco',
  );

  exigirReprovacao(
    'telefone escondido no nome do pet chega à tela bloqueada como qualquer outro texto',
    () => montarMensagemDePush(contexto({ nomeDoPet: TELEFONE })),
    'telefone',
  );

  exigirReprovacao(
    'endereço no lugar do bairro fura o teto de precisão do ADR-0010',
    () => montarMensagemDePush(contexto({ bairro: ENDERECO })),
    'logradouro',
  );

  exigirReprovacao(
    'CEP é endereço com outro nome',
    () => montarMensagemDePush(contexto({ bairro: `Pinheiros ${CEP}` })),
    'CEP',
  );

  exigirReprovacao(
    'coordenada, "mesmo arredondada, mesmo em campo aproximado" (item 4)',
    () => montarMensagemDePush(contexto({ bairro: COORDENADA })),
    'coordenada geográfica',
  );

  exigirReprovacao(
    'e-mail de quem quer que seja (item 1)',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: `Responda para ${EMAIL}.`,
        dados: {},
        chaveDeAgrupamento: 'tagEscaneada:x',
      }),
    'endereço de e-mail',
  );

  exigirReprovacao(
    'a chave de agrupamento é payload, e é o campo que ninguém lembra de conferir',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: 'Toque para falar.',
        dados: {},
        chaveDeAgrupamento: `caso-${CASO_ID}`,
      }),
    'UUID de banco',
  );

  exigirReprovacao(
    'campo chamado case_id é recusado pelo NOME, mesmo com valor inofensivo',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: 'Toque para falar.',
        dados: { case_id: TOKEN_PUBLICO },
        chaveDeAgrupamento: 'tagEscaneada:x',
      }),
    'campo cujo nome o ADR-0010 proíbe',
  );

  exigirReprovacao(
    'telefone num campo de dados qualquer',
    () =>
      assegurarSuperficiePublica({
        titulo: 'Alguém está com Nina',
        corpo: 'Toque para falar.',
        dados: { contato: TELEFONE },
        chaveDeAgrupamento: 'tagEscaneada:x',
      }),
    'telefone',
  );
});

void describe('a porteira não reprova o que o produto precisa dizer', () => {
  void it('bairro e cidade passam: são o teto, não a proibição', () => {
    assert.doesNotThrow(() =>
      montarMensagemDePush(contexto({ bairro: 'Vila Madalena, São Paulo' })),
    );
  });

  void it('nome de pet comum passa', () => {
    for (const nome of ['Nina', 'Rex', 'Mel', 'Thor', 'Bob Marley']) {
      assert.doesNotThrow(() => montarMensagemDePush(contexto({ nomeDoPet: nome })));
    }
  });
});

void describe('o texto não inventa gênero que o banco não tem', () => {
  void it('sem artigo antes do nome: "com Rex", e nunca "com a Rex"', () => {
    const conteudo = montarMensagemDePush(contexto({ nomeDoPet: 'Rex' }));
    assert.equal(conteudo.titulo, 'Alguém está com Rex');
    assert.ok(!conteudo.titulo.includes('a Rex'));
  });

  void it('o tutor que ainda NÃO sabe recebe o fato cru, e não a consequência', () => {
    const conteudo = montarMensagemDePush(contexto({ casoAberto: false }));
    assert.equal(conteudo.titulo, 'Alguém escaneou a tag de Nina');
  });

  void it('a possível correspondência não afirma que é o pet: ela pede que a pessoa olhe', () => {
    const conteudo = montarMensagemDePush(
      contexto({ tipo: 'possivelCorrespondencia', bairro: 'Pinheiros' }),
    );
    assert.equal(conteudo.titulo, 'Um pet parecido com Nina foi achado');
    assert.ok(conteudo.corpo.includes('ver se é Nina'));
  });

  void it('sem bairro, o texto sai sem lugar em vez de com lugar vago', () => {
    const conteudo = montarMensagemDePush(contexto({ bairro: undefined }));
    assert.equal(conteudo.corpo, 'Uma pessoa escaneou a tag agora. Toque para falar.');
  });
});

void describe('prioridade e validade seguem o ADR-0008', () => {
  void it('o alerta de vizinhança vale 6 horas: alerta velho atrapalha o caso seguinte', () => {
    const conteudo = montarMensagemDePush(
      contexto({ tipo: 'alertaDeVizinhanca', especie: 'cão' }),
    );
    assert.equal(conteudo.validadeEmSegundos, 6 * 60 * 60);
    assert.equal(conteudo.prioridade, 'alta');
    assert.equal(conteudo.titulo, 'Um cão sumiu perto de você');
  });

  void it('o lembrete de desfecho é o único em prioridade normal: ele é pergunta, não notícia', () => {
    const conteudo = montarMensagemDePush(contexto({ tipo: 'lembreteDeDesfecho' }));
    assert.equal(conteudo.prioridade, 'normal');
  });

  void it('avisos de tipos diferentes sobre a mesma referência NÃO se engolem', () => {
    const scan = montarMensagemDePush(contexto({ tipo: 'tagEscaneada' }));
    const vizinhanca = montarMensagemDePush(
      contexto({ tipo: 'alertaDeVizinhanca', especie: 'cão' }),
    );
    assert.notEqual(scan.chaveDeAgrupamento, vizinhanca.chaveDeAgrupamento);

    const outroScan = montarMensagemDePush(contexto({ tipo: 'tagEscaneada', bairro: 'Pinheiros' }));
    assert.equal(scan.chaveDeAgrupamento, outroScan.chaveDeAgrupamento);
  });
});

void describe('o push de pedido aprovado leva so o titulo', () => {
  void it('titulo e corpo: a frase fixa e o titulo do encontro; dados so com o tipo', () => {
    const c = montarAvisoDePedidoAprovado('Encontro de galgos');
    assert.equal(c.titulo, 'Seu pedido foi aprovado');
    assert.equal(c.corpo, 'Encontro de galgos');
    assert.deepEqual(c.dados, { tipo: 'pedidoAprovado' });
  });

  void it('ISCA: titulo com cara de endereco nao sai (a porteira falha fechado)', () => {
    assert.throws(() => montarAvisoDePedidoAprovado('Encontro na Rua das Flores, 120'), VazamentoNoPushError);
  });
});
