/**
 * ISCA: conta desabilitada trava a conversa nos DOIS sentidos e perde o nome.
 *
 * ## A decisão, literal, de 17/10
 *
 * > *"E sobre a conversa, a foto deve trazer um avatar padrão cinza, como se
 * > tivesse desabilitado e bloquear o chat para não enviar ou receber mais
 * > nenhuma nova mensagem"*
 *
 * ## Como "não RECEBER" foi entendido, e isto precisa estar escrito
 *
 * "Não receber nenhuma nova mensagem" não é alcançável travando só quem saiu:
 * quem saiu não consegue nem entrar (`autenticar()` recusa `status != 'active'`).
 * Quem ainda escreve é **o outro participante**, e uma mensagem dele iria para
 * alguém que não está mais na plataforma. Então "não receber" se implementa
 * travando **quem escreve**, e o resultado é um chat fechado para os dois lados.
 * É o que `participanteDesabilitado` faz, e é o que estes casos medem.
 *
 * ## Por que no DOMÍNIO, e não em cada rota
 *
 * `estadoDaConversa` e `participantesVisiveis` são os dois pontos por onde as
 * **duas** vistas passam: a do chamador com conta (`conversation-service.ts`) e
 * a do achador por token (`conversa-do-achador.ts`). A segunda não pede login,
 * e é justamente a que uma despersonalização feita na montagem da resposta
 * deixaria de fora.
 *
 * E o mesmo sinal alimenta a trava e o `status` que a tela lê, então não existe
 * o arranjo em que a tela diz "encerrada" e a rota aceita a mensagem, nem o
 * inverso.
 *
 * ## O AVATAR CINZA NÃO ESTÁ AQUI, E NÃO PODE ESTAR
 *
 * Medido: **não existe campo de foto de participante** em consulta, DTO,
 * resposta nem contrato. `Conversation.participants` tem dois campos — `role` e
 * `display_name` — e a descrição do contrato proíbe foto de perfil por extenso:
 * *"Nunca sobrenome completo, telefone, e-mail nem foto de perfil"*. Também não
 * existe tela de conversa no app Flutter (a seção está marcada `planejada`), nem
 * componente de avatar em lugar nenhum de `app/lib/`.
 *
 * Então nada foi inventado: o que o servidor pode fazer pelo pedido do cliente é
 * **a despersonalização do NOME**, que é a outra metade do que ele pediu ("o
 * nome também não deve identificar"). O avatar está no relatório como premissa
 * que não se sustenta hoje.
 *
 * ## A isca, e como ela SERIA provada
 *
 * **Nada neste arquivo foi executado** — instrução do cliente nesta rodada.
 * Roteiro para quando houver autorização:
 *
 * | o que desligar | esperado |
 * |---|---|
 * | `if (sinais.participanteDesabilitado) return 'closed';` em `estadoDaConversa` | reprovam os 3 casos de trava |
 * | `||` virando `&&` no mesmo `if` | reprovam os casos de um lado só |
 * | as duas linhas `? null :` de `participantesVisiveis` | reprovam os 4 de nome |
 * | só a linha do tutor | reprova o do tutor, e o do achador fica verde |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  type NomesDaConversa,
  type SinaisDeEstado,
} from './conversa-mediada.js';

const ABERTA: SinaisDeEstado = {
  encerradaEm: null,
  bloqueadaEm: null,
  casoEncerrado: false,
  participanteDesabilitado: false,
};

const NOMES: NomesDaConversa = {
  nomeDoTutor: 'Leandro Panegassi',
  nomeDoAchador: 'Ana Paula Ribeiro',
  tutorDesabilitado: false,
  achadorDesabilitado: false,
  // A EMENDA 3 DO ADR-0010 (19/10/2026) acrescentou três campos de entrada.
  // Esta bancada e a de quem **não é conexão aceita**, que é o estado normal da
  // conversa de achado: os dois recortados chegam nulos, como a consulta os
  // entrega. O caso de conexão aceita vive em `conversa-mediada.test.ts`.
  papelDoChamador: 'tutor',
  apelidoDoOutro: null,
  chaveDaFotoDoOutro: null,
};

/** A lista FECHADA de campos de um participante. Um quinto reprova. */
const CHAVES_DO_PARTICIPANTE = ['displayName', 'handle', 'photoKey', 'role'];

const PASSOU_A_TRAVA =
  'a conversa aceita mensagem nova com um participante desabilitado. O cliente pediu ' +
  '"bloquear o chat para não enviar ou receber mais nenhuma nova mensagem", e sem esta ' +
  'trava a mensagem vai para alguém que não está mais na plataforma.';

void describe('a conversa de conta desabilitada fica travada nos dois sentidos', () => {
  void it('ISCA: participante desabilitado fecha a conversa, sem `closed_at` no banco', () => {
    const sinais = { ...ABERTA, participanteDesabilitado: true };
    assert.equal(estadoDaConversa(sinais), 'closed');
    assert.ok(!aceitaMensagem(estadoDaConversa(sinais)), PASSOU_A_TRAVA);
  });

  void it('`closed` e NÃO `blocked`: a tela precisa poder explicar, e ninguém bloqueou', () => {
    // `blocked` diria "alguém te bloqueou", que é falso e é justamente a
    // informação que a política de `problemas.conversaEncerrada()` existe para
    // NÃO dar (uma resposta só para encerrada e bloqueada). `closed` é o estado
    // que o critério 8 associa a "modo leitura com a explicação".
    assert.equal(estadoDaConversa({ ...ABERTA, participanteDesabilitado: true }), 'closed');
  });

  void it('BASTA UM LADO: o sinal é `||`, e um `&&` deixaria metade dos casos abertos', () => {
    // Na prática quase sempre é o tutor quem desabilita (o achador costuma não
    // ter conta). Um `&&` exigiria os DOIS desabilitados e nunca dispararia.
    assert.equal(estadoDaConversa({ ...ABERTA, participanteDesabilitado: true }), 'closed');
    assert.equal(estadoDaConversa(ABERTA), 'open', 'conversa sem ninguém desabilitado fechou');
  });

  void it('CONTRAPESO: sem ninguém desabilitado, a conversa continua aberta', () => {
    // Sem este caso, a implementação mais simples que passa nos de cima é
    // devolver `closed` sempre — e aí o produto perde a conversa inteira.
    assert.equal(estadoDaConversa(ABERTA), 'open');
    assert.ok(aceitaMensagem(estadoDaConversa(ABERTA)));
  });
});

void describe('o participante desabilitado perde o nome, e fica o rótulo neutro', () => {
  void it('ISCA: tutor desabilitado aparece como `Tutor`, e o nome real não sai', () => {
    const participantes = participantesVisiveis({ ...NOMES, tutorDesabilitado: true });
    const tutor = participantes.find((p) => p.role === 'tutor');

    assert.equal(tutor?.displayName, 'Tutor');
    // A varredura é sobre o JSON INTEIRO e não sobre o campo esperado: um campo
    // novo qualquer que carregasse o nome passaria por uma conferência que só
    // olhasse `displayName`.
    assert.doesNotMatch(
      JSON.stringify(participantes),
      /Leandro/,
      'o nome do tutor desabilitado continua saindo. O cliente pediu que "o nome também ' +
        'não deve identificar" -- avatar cinza com o nome real ao lado anula o efeito.',
    );
  });

  void it('ISCA: achador desabilitado aparece como `Quem achou`, e o nome não sai', () => {
    const participantes = participantesVisiveis({ ...NOMES, achadorDesabilitado: true });
    const achador = participantes.find((p) => p.role === 'finder');

    assert.equal(achador?.displayName, 'Quem achou');
    assert.doesNotMatch(
      JSON.stringify(participantes),
      /Ana/,
      'o nome do achador desabilitado continua saindo',
    );
  });

  void it('o lado QUE FICA conserva o nome: despersonalizar os dois seria exagero', () => {
    // O outro participante não pediu nada e continua na plataforma. Apagar o
    // nome dele junto tornaria a conversa ilegível para quem tem direito a ela.
    const participantes = participantesVisiveis({ ...NOMES, tutorDesabilitado: true });
    assert.equal(participantes.find((p) => p.role === 'finder')?.displayName, 'Ana');
  });

  void it('CONTRAPESO: sem ninguém desabilitado, os dois primeiros nomes saem', () => {
    const participantes = participantesVisiveis(NOMES);
    assert.equal(participantes.find((p) => p.role === 'tutor')?.displayName, 'Leandro');
    assert.equal(participantes.find((p) => p.role === 'finder')?.displayName, 'Ana');
  });

  void it('o rótulo neutro é o que o produto JÁ usava para "sem nome", e não um novo', () => {
    // Nenhum componente nem rótulo inventado: desabilitar entra pelo mesmo
    // caminho de quem nunca preencheu o nome.
    const semNome = participantesVisiveis({
      nomeDoTutor: null,
      nomeDoAchador: null,
      tutorDesabilitado: false,
      achadorDesabilitado: false,
      papelDoChamador: 'tutor',
      apelidoDoOutro: null,
      chaveDaFotoDoOutro: null,
    });
    const desabilitados = participantesVisiveis({
      ...NOMES,
      tutorDesabilitado: true,
      achadorDesabilitado: true,
    });
    assert.deepEqual(desabilitados, semNome);
  });

  void it('o participante tem a LISTA FECHADA de campos: despersonalizar não acrescentou nada', () => {
    // O item 7 do ADR-0010 proíbe qualquer coisa que permita agrupar os pets de
    // um mesmo tutor. Um campo novo tipo `desabilitado: true` por participante
    // seria um sinal estável por pessoa, que é exatamente o que ele fecha.
    //
    // **Eram dois campos e são quatro desde 19/10/2026** (emenda 3 do
    // ADR-0010). A lista continua FECHADA, e trocar este literal continua
    // custando uma decisão: um quinto campo reprova aqui.
    for (const p of participantesVisiveis({ ...NOMES, tutorDesabilitado: true })) {
      assert.deepEqual(Object.keys(p).sort(), CHAVES_DO_PARTICIPANTE);
    }
  });

  void it('ISCA: o lado DESABILITADO não traz foto nem apelido, mesmo sendo conexão aceita', () => {
    // A medida: `conta_habilitada` das duas pontas está DENTRO do predicado de
    // conexão aceita, na consulta -- então quando o outro lado desabilita a
    // conta, `apelidoDoOutro` e `chaveDaFotoDoOutro` chegam NULOS aqui. Esta
    // isca prova que o domínio não inventa foto para o lado que saiu, e prova
    // o CONTRAPESO junto: com os dois campos preenchidos (conta habilitada), o
    // mesmo lado traz os dois.
    const saiu = participantesVisiveis({
      ...NOMES,
      achadorDesabilitado: true,
      apelidoDoOutro: null,
      chaveDaFotoDoOutro: null,
    });
    const achadorQueSaiu = saiu.find((p) => p.role === 'finder');
    assert.equal(achadorQueSaiu?.displayName, 'Quem achou', 'o lado que saiu perde o nome');
    assert.equal(achadorQueSaiu?.handle, null, 'o lado que saiu não traz apelido');
    assert.equal(achadorQueSaiu?.photoKey, null, 'o lado que saiu não traz foto');

    const ativo = participantesVisiveis({
      ...NOMES,
      apelidoDoOutro: 'ana-paula',
      chaveDaFotoDoOutro: 'thumb/ana.jpg',
    });
    const achadorAtivo = ativo.find((p) => p.role === 'finder');
    assert.equal(achadorAtivo?.handle, 'ana-paula', 'sem este contrapeso a isca passaria vazia');
    assert.equal(achadorAtivo?.photoKey, 'thumb/ana.jpg');
  });
});
