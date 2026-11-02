import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  apareceNaListagem,
  ligarPerfilPublicoExigeApelido,
  motivoDeNaoAparecerNaListagem,
  type EstadoDoPerfilDePessoa,
} from './perfil-publico-de-pessoa.js';

const PRONTA: EstadoDoPerfilDePessoa = {
  perfilPublicoLigado: true,
  temFotoPronta: true,
  apelido: 'maria-silva',
};

void describe('perfil publico de pessoa: FOTO + PERFIL PUBLICO (cliente, 02/11/2026)', () => {
  void it('ISCA: o estado completo APARECE -- sem isto os casos abaixo passariam vacuos', () => {
    assert.equal(motivoDeNaoAparecerNaListagem(PRONTA), null);
    assert.ok(apareceNaListagem(PRONTA));
  });

  void it('perfil publico DESLIGADO nao aparece -- e desligado e o padrao', () => {
    assert.equal(
      motivoDeNaoAparecerNaListagem({ ...PRONTA, perfilPublicoLigado: false }),
      'perfil_publico_desligado',
    );
  });

  void it('sem foto pronta nao aparece, mesmo com o perfil ligado', () => {
    assert.equal(
      motivoDeNaoAparecerNaListagem({ ...PRONTA, temFotoPronta: false }),
      'sem_foto_pronta',
    );
  });

  void it('sem apelido nao aparece: o perfil nao teria endereco', () => {
    assert.equal(motivoDeNaoAparecerNaListagem({ ...PRONTA, apelido: null }), 'sem_apelido');
  });

  void it('a ordem e a do cliente: o perfil publico vem ANTES da foto', () => {
    assert.equal(
      motivoDeNaoAparecerNaListagem({
        perfilPublicoLigado: false,
        temFotoPronta: false,
        apelido: null,
      }),
      'perfil_publico_desligado',
      'tres pendencias de uma vez: a tela tem de resolver a primeira, nao as tres',
    );
  });

  void it('ligar o perfil publico exige apelido, e so para quem nao tem', () => {
    assert.ok(ligarPerfilPublicoExigeApelido({ handle: null }));
    assert.ok(!ligarPerfilPublicoExigeApelido({ handle: 'maria-silva' }));
  });
});
