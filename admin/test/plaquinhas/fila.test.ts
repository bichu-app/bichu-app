/**
 * O vocabulario e a maquina de estados da entrega da plaquinha, no painel.
 *
 * ## As iscas deste arquivo, e como cada uma SERIA desligada
 *
 * | isca | o que desligar em `fila.ts` | esperado |
 * |---|---|---|
 * | a tela nao oferece o que o servidor recusa | fazer `proximaAcao` devolver `'confirmar'` para `arrived` | reprova "nao se volta atras" |
 * | a entrega nao anda antes do aceite | tirar o ramo `status === 'pending'` de `proximaAcao` | reprova "pedido pendente oferece atender" |
 * | o rastreio em branco NAO apaga por acidente | fazer `corpoDaEntrega` mandar `null` sempre que o campo estiver vazio | reprova "campo vazio sem rastreio gravado nao manda o campo" |
 * | nenhum formato de transportadora e cobrado | pOr um regex de Correios em `erroDoRastreio` | reprova "aceita codigo que nao e de transportadora nenhuma" |
 * | o endereco e mascarado pelas funcoes de `formato/` | trocar `cepDosOitoDigitos` por interpolacao crua | reprova "o CEP sai com hifen" |
 *
 * Exigencia de metodo: uma prova de isca so conta quando o arquivo de fato
 * mudou entre o antes e o depois. As linhas acima dizem o que mudar.
 *
 * ## POR QUE ESTE ARQUIVO MORA EM `test/`, e nao ao lado de `fila.ts`
 *
 * O `include` do vitest deste pacote e `test/**\/*.test.{ts,tsx}` -- e SO ele.
 * Caso escrito em `src/` ao lado do modulo **nao e executado por ninguem**:
 * medido em 18/10/2026, `vitest run src/plaquinhas/fila.test.ts` responde "No
 * test files found". Ha dois arquivos no repositorio nessa situacao hoje --
 * `src/diretorio/dominio.test.ts` e `src/formato/telefone.test.ts` --, e os dois
 * parecem suite e nao sao. Este nao entra na conta.
 */
import { describe, expect, it } from 'vitest';

import {
  ROTULO_DO_PASSO,
  corpoDaEntrega,
  enderecoEmLinhas,
  erroDoRastreio,
  podeCorrigirRastreio,
  proximaAcao,
  type Pedido,
} from '../../src/plaquinhas/fila.ts';

/**
 * Um pedido da fila, como o contrato o declara. O endereco e completo porque
 * `enderecoEmLinhas` o le inteiro.
 */
function pedido(partes: Partial<Pedido> = {}): Pedido {
  return {
    ref: 'yjJwZ3hBc0RmR2hKa0xtTg',
    pet: { display_name: 'Bidu', species: 'dog' },
    delivery_address: {
      recipient_name: 'Mariana Destinataria',
      recipient_phone: '+5511987654321',
      postal_code: '05435000',
      street: 'Rua Harmonia',
      street_number: '1578B',
      complement: null,
      neighborhood: 'Vila Madalena',
      city: 'Sao Paulo',
      state: 'SP',
    },
    notes: null,
    status: 'fulfilled',
    requested_at: '2026-10-18T12:00:00.000Z',
    decided_at: '2026-10-18T13:00:00.000Z',
    delivery_state: 'requested',
    tracking_code: null,
    shipped_at: null,
    delivered_at: null,
    ...partes,
  } as Pedido;
}

describe('proximaAcao: a tela oferece exatamente o que o servidor aceita', () => {
  it('pedido pendente oferece atender, e a entrega nao anda antes do aceite', () => {
    expect(proximaAcao(pedido({ status: 'pending' }))).toBe('atender');
  });

  it('pedido aceito e ainda nao despachado oferece `em transporte`', () => {
    expect(proximaAcao(pedido({ status: 'fulfilled', delivery_state: 'requested' }))).toBe(
      'despachar',
    );
  });

  it('pedido em transporte oferece `chegou`', () => {
    expect(proximaAcao(pedido({ delivery_state: 'in_transit' }))).toBe('confirmar');
  });

  it('nao se volta atras: pedido que chegou nao oferece acao nenhuma', () => {
    // A isca: `arrived` e terminal. Oferecer `confirmar` aqui mandaria o painel
    // repetir o passo (que o servidor aceita, para corrigir rastreio) como se
    // fosse progresso, e oferecer `despachar` levaria um 400
    // `invalid_delivery_transition`.
    expect(proximaAcao(pedido({ delivery_state: 'arrived' }))).toBeUndefined();
  });

  it('recusado nao anda e nao volta', () => {
    expect(proximaAcao(pedido({ status: 'declined', delivery_state: 'requested' }))).toBeUndefined();
  });
});

describe('podeCorrigirRastreio: o campo aparece so depois de o pedido sair', () => {
  it('nao aparece em pedido que ainda nao saiu', () => {
    // `CHECK collar_tag_requests_rastreio_so_apos_sair`: oferecer o campo aqui
    // seria oferecer um 400.
    expect(podeCorrigirRastreio(pedido({ delivery_state: 'requested' }))).toBe(false);
  });

  it('aparece em transporte e depois de chegar', () => {
    expect(podeCorrigirRastreio(pedido({ delivery_state: 'in_transit' }))).toBe(true);
    expect(podeCorrigirRastreio(pedido({ delivery_state: 'arrived' }))).toBe(true);
  });

  it('nao aparece em pedido recusado', () => {
    expect(podeCorrigirRastreio(pedido({ status: 'declined' }))).toBe(false);
  });
});

describe('erroDoRastreio: so o claramente invalido e recusado', () => {
  it('vazio e valido: o rastreio e opcional', () => {
    expect(erroDoRastreio('')).toBeUndefined();
    expect(erroDoRastreio('   ')).toBeUndefined();
  });

  it('aceita codigo que nao e de transportadora nenhuma', () => {
    // A ISCA do formato. Correios tem 13 simbolos, FedEx de 12 a 22, DHL 10, e
    // regional tem o que quiser. Um regex de transportadora em `erroDoRastreio`
    // reprova aqui -- e e exatamente essa barreira que barraria envio legitimo,
    // num campo que quem atende nao tem como contornar.
    expect(erroDoRastreio('entrega-em-maos-2026')).toBeUndefined();
    expect(erroDoRastreio('XQ771230045BR')).toBeUndefined();
    expect(erroDoRastreio('123')).toBeUndefined();
  });

  it('recusa um ou dois simbolos, que e engano de digitacao e nao codigo', () => {
    expect(erroDoRastreio('X')).toMatch(/pelo menos/i);
  });

  it('recusa acima de 64, que e texto colado por engano', () => {
    expect(erroDoRastreio('X'.repeat(65))).toMatch(/no m[áa]ximo/i);
    expect(erroDoRastreio('X'.repeat(64))).toBeUndefined();
  });
});

describe('corpoDaEntrega: os tres casos do rastreio sao tres coisas diferentes', () => {
  it('campo preenchido define o codigo, sem espaco nas bordas', () => {
    expect(corpoDaEntrega(pedido(), 'in_transit', '  XQ771230045BR  ')).toEqual({
      delivery_state: 'in_transit',
      tracking_code: 'XQ771230045BR',
    });
  });

  it('campo vazio SEM rastreio gravado nao manda o campo', () => {
    // A ISCA. Mandar `tracking_code: null` aqui registraria na trilha uma troca
    // de `null` para `null` -- uma mudanca que nao houve.
    expect(corpoDaEntrega(pedido({ tracking_code: null }), 'in_transit', '')).toEqual({
      delivery_state: 'in_transit',
    });
  });

  it('campo vazio COM rastreio gravado apaga, e isso e explicito', () => {
    expect(corpoDaEntrega(pedido({ tracking_code: 'XQ771230045BR' }), 'arrived', '')).toEqual({
      delivery_state: 'arrived',
      tracking_code: null,
    });
  });

  it('marcar a chegada com o campo preenchido mantem o codigo', () => {
    // O dialogo preenche o campo com o codigo gravado, e e isso que faz
    // "marcar que chegou" nao limpar o rastreio.
    expect(corpoDaEntrega(pedido({ tracking_code: 'XQ77' }), 'arrived', 'XQ77')).toEqual({
      delivery_state: 'arrived',
      tracking_code: 'XQ77',
    });
  });
});

describe('enderecoEmLinhas: o endereco sai mascarado pelas funcoes de `formato/`', () => {
  it('o CEP sai com hifen e o telefone com DDD entre parenteses', () => {
    const linhas = enderecoEmLinhas(pedido());
    expect(linhas).toContain('CEP 05435-000');
    expect(linhas).toContain('(11) 98765-4321');
  });

  it('sem complemento, a linha da rua nao ganha travessao solto', () => {
    expect(enderecoEmLinhas(pedido())).toContain('Rua Harmonia, 1578B');
  });

  it('com complemento, ele entra na mesma linha da rua', () => {
    const com = pedido({
      delivery_address: { ...pedido().delivery_address, complement: 'apto 92' },
    });
    expect(enderecoEmLinhas(com)).toContain('Rua Harmonia, 1578B — apto 92');
  });
});

describe('ROTULO_DO_PASSO: os passos saem nas palavras do cliente', () => {
  it('os tres passos tem rotulo em portugues, e nenhum sai cru', () => {
    expect(ROTULO_DO_PASSO.requested).toBe('Solicitado');
    expect(ROTULO_DO_PASSO.in_transit).toBe('Em transporte');
    expect(ROTULO_DO_PASSO.arrived).toBe('Chegou');
  });
});
