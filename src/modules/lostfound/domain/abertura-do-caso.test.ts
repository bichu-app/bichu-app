/**
 * As regras de abertura do caso de perdido.
 *
 * O caso central é **negativo pela ausência**: falta de coordenada NÃO bloqueia.
 * É o erro fácil de escrever — "sem localização não dá para alertar, então não
 * deixa abrir" — e ele exclui exatamente quem negou a permissão de localização,
 * que é muita gente e especialmente quem instalou o app na pressa, no dia em
 * que precisou dele.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TETO_DE_CASOS_ABERTOS_POR_CONTA,
  atingiuTetoDaConta,
  bloqueiosParaAbrirCaso,
  rotuloDaArea,
  temCoordenada,
  temOndeSuficiente,
} from './abertura-do-caso.js';

const PRONTO = {
  temCanalVerificado: true,
  temFotoPronta: true,
  petJaTemCasoAberto: false,
  casosAbertosDaConta: 0,
};

void describe('bloqueios para abrir caso', () => {
  void it('com tudo em ordem, nada bloqueia', () => {
    assert.deepEqual(bloqueiosParaAbrirCaso(PRONTO), []);
  });

  void it('sem canal verificado: o aviso de quem achar cairia no vazio', () => {
    assert.deepEqual(
      bloqueiosParaAbrirCaso({ ...PRONTO, temCanalVerificado: false }),
      ['contact_channel_unverified'],
    );
  });

  void it('sem foto pronta: o vizinho não reconhece "um caramelo de porte médio"', () => {
    assert.deepEqual(
      bloqueiosParaAbrirCaso({ ...PRONTO, temFotoPronta: false }),
      ['pet_photo_missing'],
    );
  });

  void it('pet já perdido: um segundo caso divide a atenção e duplica o aviso', () => {
    assert.deepEqual(
      bloqueiosParaAbrirCaso({ ...PRONTO, petJaTemCasoAberto: true }),
      ['pet_already_lost'],
    );
  });

  void it('vários bloqueios saem JUNTOS, na ordem da dificuldade de resolver', () => {
    // Juntos porque a folha de bloqueio precisa dizer tudo de uma vez: mandar
    // resolver um, voltar, e descobrir o próximo é uma ida à caixa de entrada
    // por bloqueio.
    //
    // E nesta ordem: verificar o e-mail a maior parte das pessoas resolve na
    // hora, com o link que já está na caixa. A foto exige sair da tela e
    // voltar. Pedir a difícil primeiro faz desistir quem resolveria a fácil.
    assert.deepEqual(
      bloqueiosParaAbrirCaso({
        temCanalVerificado: false,
        temFotoPronta: false,
        petJaTemCasoAberto: true,
        casosAbertosDaConta: 0,
      }),
      ['contact_channel_unverified', 'pet_photo_missing', 'pet_already_lost'],
    );
  });
});

void describe('teto de casos abertos por conta', () => {
  void it(`abaixo de ${String(TETO_DE_CASOS_ABERTOS_POR_CONTA)} não atinge`, () => {
    assert.equal(atingiuTetoDaConta({ ...PRONTO, casosAbertosDaConta: 2 }), false);
  });

  void it('no teto, atinge', () => {
    assert.equal(
      atingiuTetoDaConta({ ...PRONTO, casosAbertosDaConta: TETO_DE_CASOS_ABERTOS_POR_CONTA }),
      true,
    );
  });

  void it('o teto é 3, e o número tem razão de privacidade além de produto', () => {
    // A lista pública mostra bairro e data. Uma conta sem teto entregaria a um
    // observador uma SÉRIE de pontos no tempo e no espaço da mesma pessoa.
    assert.equal(TETO_DE_CASOS_ABERTOS_POR_CONTA, 3);
  });
});

void describe('onde o pet foi visto — a ausência que NÃO bloqueia', () => {
  void it('SÓ ÁREA ABRE O CASO: falta de coordenada não impede nada', () => {
    // Critério 5. Este é o caso que o erro fácil quebraria.
    const soArea = { city: 'São Paulo', neighborhood: 'Vila Madalena' };
    assert.equal(temOndeSuficiente(soArea), true);
    assert.equal(temCoordenada(soArea), false, 'has_location precisa sair FALSO');
  });

  void it('só coordenada também abre', () => {
    const soPonto = { lat: -23.55, lon: -46.63 };
    assert.equal(temOndeSuficiente(soPonto), true);
    assert.equal(temCoordenada(soPonto), true);
  });

  void it('NEM uma NEM outra não abre: seria um caso invisível', () => {
    // Sem ponto e sem cidade ele não apareceria no alerta NEM na lista pública.
    // O tutor acharia que abriu.
    assert.equal(temOndeSuficiente({}), false);
    assert.equal(temOndeSuficiente({ neighborhood: 'Vila Madalena' }), false,
      'bairro sem cidade não localiza nada: há Centro em toda cidade do país');
  });

  void it('cidade só de espaços não conta', () => {
    assert.equal(temOndeSuficiente({ city: '   ' }), false);
  });
});

void describe('rótulo de área — o que sai em superfície pública', () => {
  void it('bairro e cidade, que é o nível máximo de precisão pública', () => {
    assert.equal(
      rotuloDaArea({ neighborhood: 'Vila Madalena', city: 'São Paulo' }),
      'Vila Madalena, São Paulo',
    );
  });

  void it('sem bairro, a cidade sozinha serve', () => {
    assert.equal(rotuloDaArea({ city: 'São Paulo' }), 'São Paulo');
  });

  void it('A COORDENADA NUNCA APARECE, nem quando existe', () => {
    // Nem arredondada: ponto arredondado ainda é ponto, e 100 m no meio de um
    // bairro residencial aponta para o quarteirão.
    const rotulo = rotuloDaArea({ lat: -23.5505, lon: -46.6333, city: 'São Paulo' });
    assert.equal(rotulo, 'São Paulo');
    assert.ok(!/-?\d+\.\d+/.test(rotulo ?? ''), 'vazou número decimal no rótulo público');
  });

  void it('sem nada, é nulo e não string vazia', () => {
    assert.equal(rotuloDaArea({}), null);
  });
});
