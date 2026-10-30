/** AS ISCAS DA MODERACAO DE PALAVRAS. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { EXCECOES, PALAVRAS_RECUSADAS } from './lista-de-moderacao.js';
import {
  CODIGO_DA_MODERACAO,
  errosDeModeracao,
  MENSAGEM_DA_MODERACAO,
  normalizarParaModeracao,
  temPalavraRecusada,
} from './moderacao.js';

void describe('(a) xingamento e RECUSADO, e com `code` proprio', () => {
  void it('o xingamento escrito por extenso cai, no campo que foi medido', () => {
    const erros = errosDeModeracao('body', 'atendimento de merda, o cara é um babaca');
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.field, 'body');
    assert.equal(erros[0]?.code, CODIGO_DA_MODERACAO);
  });

  void it('a normalizacao faz o trabalho dela: acento, maiuscula, numero por letra, letra repetida e hifen', () => {
    for (const texto of [
      'VAGABUNDA',
      'Otário',
      'id10ta',
      'B@B4C4',
      'caraaaalho',
      'foda-se esse lugar',
      'p u t a',
      'm.e.r.d.a',
    ]) {
      assert.equal(temPalavraRecusada(texto), true, texto);
    }
  });

  void it('o plural em `s` cai sem a lista precisar da linha dobrada', () => {
    assert.equal(temPalavraRecusada('são todos uns babacas'), true);
  });
});

void describe('(b) A ISCA QUE MAIS IMPORTA: nome proprio e palavra legitima PASSAM', () => {
  void it('`Clínica Pinto` passa -- o sobrenome e o nome do negocio', () => {
    assert.deepEqual(errosDeModeracao('display_name', 'Clínica Pinto'), []);
  });

  void it('`Cadela` passa -- e o termo correto para femea de cao, num aplicativo de animais', () => {
    assert.deepEqual(errosDeModeracao('body', 'Cuidaram muito bem da minha cadela.'), []);
  });

  void it('nome proprio plausivel de negocio real passa, um por um', () => {
    for (const nome of [
      'Pet Shop Pinto & Filhos',
      'Veterinária Buceta',
      'Clínica Rola Vet',
      'Agropecuária Prego',
      'Casa de Repouso Animal Cunha',
      'Hotelzinho do Paulo',
      'Pousada Veado Branco',
      'Japa Pet Sushi Bar',
    ]) {
      assert.deepEqual(errosDeModeracao('display_name', nome), [], nome);
    }
  });

  void it('vocabulario de veterinaria e de pelagem passa, inclusive o que parece ofensa', () => {
    for (const texto of [
      'Trataram do corno uterino da minha cadela.',
      'Fizeram a castração, conferiram o escroto e explicaram tudo.',
      'Levei meu cavalo crioulo e minha égua.',
      'Meu gato preto e a cachorra foram bem atendidos.',
      'Diagnosticaram crescimento retardado no filhote.',
      'Tem piranha, perereca e bicho exótico; atendem tudo.',
      'Cuidam de burro, vaca e galinha também.',
      'O pinto da galinha estava com o rabo machucado.',
    ]) {
      assert.deepEqual(errosDeModeracao('body', texto), [], texto);
    }
  });

  void it('critica negativa dura PASSA: avaliacao ruim nao e ofensa', () => {
    for (const texto of [
      'Atendimento péssimo, demorou três horas e ninguém explicou nada.',
      'Caro, sujo e desorganizado. Não volto e não indico.',
      'Achei o lugar nojento e o preço um roubo.',
      'Esse lugar é foda, melhor da cidade.',
      'Meu cachorro safado adorou.',
    ]) {
      assert.deepEqual(errosDeModeracao('body', texto), [], texto);
    }
  });

  void it('`reputacao` nao contem `puta`: o casamento e por palavra inteira, nunca por pedaco', () => {
    assert.equal(temPalavraRecusada('Lugar de ótima reputação'), false);
  });

  void it('A EXCECAO VENCE O BLOQUEIO: nenhuma palavra esta nas duas listas', () => {
    const nas_duas = PALAVRAS_RECUSADAS.filter((p) => EXCECOES.includes(p));
    assert.deepEqual(nas_duas, [], 'palavra em EXCECOES nunca bloqueia, e isto denuncia o engano');
  });

  void it('a normalizacao nao transforma excecao em palavra recusada', () => {
    for (const permitida of EXCECOES) {
      assert.equal(temPalavraRecusada(permitida), false, permitida);
    }
  });

  void it('as duas listas entram normalizadas: cada palavra da lista pega a si mesma', () => {
    for (const palavra of PALAVRAS_RECUSADAS) {
      assert.equal(temPalavraRecusada(palavra), true, palavra);
    }
    assert.equal(normalizarParaModeracao('Burro'), normalizarParaModeracao('burro'));
  });
});

void describe('(c) a palavra proibida NAO aparece na mensagem de erro nem em log', () => {
  void it('a mensagem nao cita nenhuma palavra da lista, e nao devolve o texto medido', () => {
    const texto = 'seu babaca, atendimento de merda';
    const erro = errosDeModeracao('body', texto)[0];
    assert.notEqual(erro, undefined);
    const mensagem = erro?.message ?? '';
    for (const palavra of PALAVRAS_RECUSADAS) {
      assert.equal(mensagem.toLowerCase().includes(palavra), false, palavra);
    }
    assert.equal(mensagem.includes(texto), false);
    assert.deepEqual(Object.keys(erro ?? {}).sort(), ['code', 'field', 'message']);
  });

  void it('a mensagem e a MESMA para qualquer palavra: ela nao e oraculo da lista', () => {
    const a = errosDeModeracao('body', 'babaca')[0]?.message;
    const b = errosDeModeracao('body', 'merda')[0]?.message;
    assert.equal(a, MENSAGEM_DA_MODERACAO);
    assert.equal(b, MENSAGEM_DA_MODERACAO);
  });

  void it('o modulo nao tem como registrar nada: nem `console`, nem logger, nem trilha', () => {
    const fonte = readFileSync(resolve(process.cwd(), 'src/shared/texto/moderacao.ts'), 'utf8');
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const proibido of ['console.', 'logger', 'auditLog', 'request.log']) {
      assert.equal(codigo.includes(proibido), false, proibido);
    }
    const importados = [...codigo.matchAll(/from '([^']+)'/g)].map((casado) => casado[1] ?? '');
    assert.deepEqual(importados.sort(), ['../http/problem.js', './lista-de-moderacao.js']);
  });
});
