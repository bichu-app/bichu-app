/**
 * Testes da senha local. Rodam sem servidor, sem banco e sem rede: se uma regra
 * de negócio precisasse de infraestrutura para ser testada, o acoplamento seria
 * o defeito.
 *
 * Cada caso aqui corresponde a um critério de aceite de BICHUS-17.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BYTES_DERIVADOS,
  BYTES_DE_SAL,
  codificarPhc,
  decodificarPhc,
  gerarHashDeSenha,
  ITERACOES_VIGENTES,
  precisaDeRehash,
  verificarSenha,
} from './password.js';

// A derivação é cara de propósito: 210.000 iterações custam centenas de
// milissegundos, e é isso que protege o hash. O teto do teste acomoda isso.
const TEMPO_LIMITE = 30_000;

void describe('senha local em PBKDF2-HMAC-SHA512', { timeout: TEMPO_LIMITE }, () => {
  void it('grava algoritmo, iterações, sal e tamanho junto do hash (critério 1 e 2)', async () => {
    const phc = await gerarHashDeSenha('girassol-de-agosto-9');

    assert.match(phc, /^\$pbkdf2-sha512\$i=210000\$[^$]+\$[^$]+$/);

    const parametros = decodificarPhc(phc);
    assert.ok(parametros !== undefined, 'o hash gravado precisa ser legível de volta');
    assert.equal(parametros.iteracoes, ITERACOES_VIGENTES);
    assert.equal(parametros.sal.length, BYTES_DE_SAL);
    assert.equal(parametros.derivado.length, BYTES_DERIVADOS);
  });

  void it('recusa bcrypt e qualquer outro formato que não emitimos (critério 3)', () => {
    // O Keycloak não importa bcrypt nativamente, e é por isso que ele está
    // proibido. Um hash de bcrypt na coluna precisa ser ilegível para nós.
    assert.equal(decodificarPhc('$2b$12$KIXQJ9m1yQm5r6uZbYt3LeJxvGq1f0O8pZ2m4n6q8s0u2w4y6a8c'), undefined);
    assert.equal(decodificarPhc('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA'), undefined);
    assert.equal(decodificarPhc('$pbkdf2-sha512$i=0$c2FsdA$aGFzaA'), undefined);
    assert.equal(decodificarPhc('texto solto'), undefined);
  });

  void it('dá hashes diferentes para a mesma senha em contas diferentes (critério 4)', async () => {
    const [primeiro, segundo] = await Promise.all([
      gerarHashDeSenha('a mesma senha exatamente'),
      gerarHashDeSenha('a mesma senha exatamente'),
    ]);

    assert.notEqual(primeiro, segundo, 'o sal aleatório precisa separar os dois');
    // E os dois continuam verificando a mesma senha: sal diferente não pode
    // significar hash inutilizável.
    assert.equal(await verificarSenha('a mesma senha exatamente', primeiro), true);
    assert.equal(await verificarSenha('a mesma senha exatamente', segundo), true);
  });

  void it('aceita a senha certa e recusa a errada', async () => {
    const phc = await gerarHashDeSenha('frase longa que ninguem adivinha');
    assert.equal(await verificarSenha('frase longa que ninguem adivinha', phc), true);
    assert.equal(await verificarSenha('frase longa que ninguem adivinha ', phc), false);
    assert.equal(await verificarSenha('', phc), false);
  });

  void it('pede regravação quando os parâmetros estão abaixo da política (critério 6)', () => {
    const salCurto = Buffer.alloc(BYTES_DE_SAL);
    const derivado = Buffer.alloc(BYTES_DERIVADOS);

    const antigo = codificarPhc({ iteracoes: 120_000, sal: salCurto, derivado });
    assert.equal(precisaDeRehash(antigo), true, 'iterações abaixo da política precisam subir');

    const vigente = codificarPhc({ iteracoes: ITERACOES_VIGENTES, sal: salCurto, derivado });
    assert.equal(precisaDeRehash(vigente), false, 'hash na política vigente não é regravado à toa');

    // Formato ilegível conta como "precisa de rehash": é a resposta segura, e
    // não deixa um hash estranho sobreviver por omissão.
    assert.equal(precisaDeRehash('$2b$12$qualquercoisa'), true);
  });
});
