/**
 * A quantização e a validade, sem banco, sem servidor e sem rede.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi **desligado no arquivo de produção, rodado e visto
 * reprovar** em 22/09/2026, e depois restaurado. A contagem é sobre este
 * arquivo **mais** `localizacao-de-referencia-routes.test.ts`, que é onde o
 * efeito de borda aparece:
 *
 * | o que foi desligado em `localizacao-de-referencia.ts` | reprovaram |
 * |---|---|
 * | `quantizar` devolvendo a coordenada intacta | 7 casos |
 * | `PASSO_DA_GRADE_EM_GRAUS` de `0.001` para `0.0001` (célula de 11 m) | 5 casos |
 * | `localizacaoAGravar` usando `bruta` em vez de `quantizar(bruta)` | 4 casos |
 * | `estaValida` com `>=` no lugar de `>` | 1 caso |
 * | `+ 0` removido do zero negativo | 1 caso |
 *
 * A linha mais importante da tabela é a terceira: ela é a que impede o
 * caminho "quantiza numa função que ninguém chama".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Instant } from '../../../shared/types/brands.js';
import {
  estaValida,
  localizacaoAGravar,
  PASSO_DA_GRADE_EM_GRAUS,
  PRECISAO_EM_METROS,
  quantizar,
  validadeDe,
  VALIDADE_EM_DIAS,
} from './localizacao-de-referencia.js';

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** Metros por grau de latitude. Constante, e é o que torna a grade previsível. */
const METROS_POR_GRAU_DE_LATITUDE = 111_320;

void describe('a coordenada é quantizada numa grade de cerca de 100 m', () => {
  void it('snap para o vértice de grade mais próximo', () => {
    // Avenida Paulista, 1578. O ponto exato existe; o gravado não.
    assert.deepEqual(quantizar({ lat: -23.561414, lon: -46.655981 }), {
      lat: -23.561,
      lon: -46.656,
    });
  });

  void it('dois pontos a menos de 100 m caem na MESMA célula', () => {
    // 0.0002 grau de latitude são cerca de 22 m.
    const a = quantizar({ lat: -23.5612, lon: -46.6558 });
    const b = quantizar({ lat: -23.5614, lon: -46.6559 });
    assert.deepEqual(a, b, 'a grade não está colapsando vizinhos, e é para isso que ela existe');
  });

  void it('dois pontos a mais de 200 m caem em células DIFERENTES', () => {
    const a = quantizar({ lat: -23.5612, lon: -46.6558 });
    const b = quantizar({ lat: -23.5642, lon: -46.6558 });
    assert.notDeepEqual(a, b, 'a grade grossa demais apagaria a diferença que o raio precisa ver');
  });

  void it('o deslocamento máximo é meio passo, e não mais que isso', () => {
    // O pior caso: exatamente no meio entre dois vértices.
    const bruto = { lat: -23.5615, lon: -46.6555 };
    const { lat } = quantizar(bruto);
    const deslocamento = Math.abs(lat - bruto.lat) * METROS_POR_GRAU_DE_LATITUDE;
    assert.ok(
      deslocamento <= (PASSO_DA_GRADE_EM_GRAUS / 2) * METROS_POR_GRAU_DE_LATITUDE + 0.001,
      `deslocou ${String(deslocamento)} m, e meio passo são ${String(
        (PASSO_DA_GRADE_EM_GRAUS / 2) * METROS_POR_GRAU_DE_LATITUDE,
      )} m`,
    );
  });

  void it('a célula mede entre 92 m e 111 m em toda a caixa do Brasil', () => {
    // As duas latitudes extremas que `UserLocationInput` aceita: 6 N e 34 S.
    for (const latitude of [6, -34]) {
      const ladoNorteSul = PASSO_DA_GRADE_EM_GRAUS * METROS_POR_GRAU_DE_LATITUDE;
      const ladoLesteOeste =
        PASSO_DA_GRADE_EM_GRAUS * METROS_POR_GRAU_DE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
      assert.ok(ladoNorteSul > 92 && ladoNorteSul < 112, `norte-sul em ${String(latitude)}`);
      assert.ok(
        ladoLesteOeste > 92 && ladoLesteOeste < 112,
        `leste-oeste em ${String(latitude)}: ${String(ladoLesteOeste)} m`,
      );
    }
  });

  void it('quantizar o que já está quantizado não move nada', () => {
    const uma = quantizar({ lat: -23.561414, lon: -46.655981 });
    assert.deepEqual(quantizar(uma), uma, 'reenviar a mesma localização não pode gravar outra');
  });

  void it('o zero negativo não sobrevive', () => {
    const { lat, lon } = quantizar({ lat: -0.0004, lon: -0.0004 });
    assert.ok(Object.is(lat, 0), '-0 compara diferente de 0 depois de ir e voltar do fio');
    assert.ok(Object.is(lon, 0));
  });
});

void describe('a localização a gravar já nasce quantizada', () => {
  void it('`localizacaoAGravar` não deixa a coordenada bruta passar', () => {
    const gravar = localizacaoAGravar({ lat: -23.561414, lon: -46.655981 }, 'device_gps', AGORA);
    assert.equal(gravar.lat, -23.561);
    assert.equal(gravar.lon, -46.656);
    assert.notEqual(gravar.lat, -23.561414, 'o bruto chegou ao que vai para o banco');
  });

  void it('carrega a precisão que sai na resposta, e ela é a da grade', () => {
    const gravar = localizacaoAGravar({ lat: -10, lon: -50 }, 'map_pin', AGORA);
    assert.equal(gravar.precisaoEmMetros, PRECISAO_EM_METROS);
    assert.equal(gravar.precisaoEmMetros, 100);
  });

  void it('guarda a origem, que é o que distingue GPS concedido de toque no mapa', () => {
    assert.equal(localizacaoAGravar({ lat: -10, lon: -50 }, 'map_pin', AGORA).origem, 'map_pin');
    assert.equal(
      localizacaoAGravar({ lat: -10, lon: -50 }, 'device_gps', AGORA).origem,
      'device_gps',
    );
  });
});

void describe('a validade é de 30 dias e a conta sai do raio quando ela vence', () => {
  void it('expira 30 dias depois da captura', () => {
    assert.equal(validadeDe(AGORA), AGORA + VALIDADE_EM_DIAS * DIA);
    assert.equal(VALIDADE_EM_DIAS, 30);
  });

  void it('vale no dia 29 e não vale no dia 31', () => {
    const gravada = localizacaoAGravar({ lat: -10, lon: -50 }, 'device_gps', AGORA);
    assert.equal(estaValida(gravada, (AGORA + 29 * DIA) as Instant), true);
    assert.equal(estaValida(gravada, (AGORA + 31 * DIA) as Instant), false);
  });

  void it('no milissegundo exato do vencimento já não vale', () => {
    const gravada = localizacaoAGravar({ lat: -10, lon: -50 }, 'device_gps', AGORA);
    assert.equal(estaValida(gravada, gravada.expiraEm), false);
    assert.equal(estaValida(gravada, (gravada.expiraEm - 1) as Instant), true);
  });
});
