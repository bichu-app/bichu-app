/**
 * Testes do comparador de destinos.
 *
 * O primeiro caso é o que importa: `autoteste()` é a prova negativa que o
 * próprio comando roda antes de tocar a rede, e ela precisa continuar dando o
 * resultado certo. Se ela evaporar, a esteira passa a rodar um comparador que
 * ninguém viu reprovar.
 *
 * Os demais casos cobrem o que o autoteste embutido não alcança: a forma dos
 * argumentos, a lista fechada de verdade (e não uma de mentira) e o aviso de
 * exceção que envelheceu.
 *
 * Nenhum caso aqui lê `compose.yaml`: `make test` roda a suíte DENTRO do
 * container, e a imagem `dev` não carrega o compose. A amarração com o arquivo
 * de verdade é o passo da esteira que executa o comando na raiz do repositório
 * — ler um arquivo que às vezes não existe produziria um teste que às vezes
 * verifica.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DIVERGENCIAS_PERMITIDAS,
  SERVICOS_AUSENTES_NO_HOSPEDADO,
  autoteste,
  compararRespostas,
  conferirTopologia,
} from './comparar-destinos.js';

const SONDA = {
  status: 'ok',
  version: '0.1.0',
  build: { artifact: '0123456789abcdef', commit: null },
  checks: { database: 'ok' },
};

const par = (b: unknown): { rotulo: string; corpo: unknown }[] => [
  { rotulo: 'local', corpo: SONDA },
  { rotulo: 'hospedado', corpo: b },
];

void describe('autoteste embutido', () => {
  void it('não acusa cegueira no comparador de hoje', () => {
    assert.deepEqual(autoteste(), []);
  });
});

void describe('comparação entre destinos', () => {
  void it('aprova dois destinos idênticos', () => {
    assert.deepEqual(compararRespostas(par(structuredClone(SONDA))).falhas, []);
  });

  // ISCA: é a asserção inteira do critério 12. Dois artefatos diferentes com as
  // duas pilhas de pé era exatamente o estado que o QA reprovou.
  void it('REPROVA quando o artefato difere, nomeando o campo e os dois valores', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: 'fedcba9876543210', commit: null } }),
    );
    assert.equal(resultado.falhas.length, 1);
    assert.match(resultado.falhas[0] as string, /build\.artifact/);
    assert.match(resultado.falhas[0] as string, /local=/);
    assert.match(resultado.falhas[0] as string, /hospedado=/);
  });

  // ISCA: campo ausente não pode virar "nada para comparar".
  void it('REPROVA quando um destino não traz `build`', () => {
    const { status, version, checks } = SONDA;
    const resultado = compararRespostas(par({ status, version, checks }));
    assert.ok(resultado.falhas.some((f) => f.includes('build.artifact')));
  });

  void it('REPROVA um destino sozinho: ele concorda consigo mesmo', () => {
    const resultado = compararRespostas([{ rotulo: 'local', corpo: SONDA }]);
    assert.equal(resultado.falhas.length, 1);
  });

  void it('REPROVA quando um destino perdeu uma sonda de dependência', () => {
    const resultado = compararRespostas(par({ ...structuredClone(SONDA), checks: {} }));
    assert.ok(resultado.falhas.some((f) => f.includes('checks')));
  });

  // CONTROLE POSITIVO: a lista fechada precisa ser consultada de verdade. Um
  // comparador que reprova tudo passaria em todas as iscas acima.
  void it('deixa passar a divergência que a lista fechada permite, e a anota', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: '0123456789abcdef', commit: '1a4a3f7' } }),
    );
    assert.deepEqual(resultado.falhas, []);
    assert.deepEqual(resultado.permitidas, ['build.commit: local=null hospedado="1a4a3f7"']);
  });

  void it('avisa quando uma exceção declarada não foi usada', () => {
    const resultado = compararRespostas(par(structuredClone(SONDA)));
    assert.deepEqual(resultado.naoUsadas, ['build.commit']);
  });

  void it('toda entrada da lista fechada tem motivo escrito', () => {
    assert.ok(DIVERGENCIAS_PERMITIDAS.length > 0);
    for (const entrada of DIVERGENCIAS_PERMITIDAS) {
      assert.ok(
        entrada.motivo.trim().length > 40,
        `\`${entrada.campo}\` está na lista sem motivo que explique nada`,
      );
    }
  });
});

void describe('topologia declarada', () => {
  void it('aprova quando o serviço com perfil está declarado', () => {
    assert.deepEqual(
      conferirTopologia('services:\n  api: {}\n  mail:\n    profiles: [dev, qa]\n'),
      [],
    );
  });

  // ISCA: um segundo serviço com perfil, sem declaração, é um serviço a menos
  // no destino hospedado que ninguém escreveu em lugar nenhum.
  void it('REPROVA um serviço com `profiles:` fora da lista fechada', () => {
    const falhas = conferirTopologia(
      'services:\n  api: {}\n  mail:\n    profiles: [dev]\n  metricas:\n    profiles: [dev]\n',
    );
    assert.equal(falhas.length, 1);
    assert.match(falhas[0] as string, /metricas/);
  });

  // ISCA da outra direção: declaração que envelheceu protege o que não existe.
  void it('REPROVA quando o serviço declarado sumiu do compose', () => {
    const falhas = conferirTopologia('services:\n  api: {}\n');
    assert.ok(falhas.some((f) => f.includes('mail')));
  });

  void it('REPROVA quando o declarado perdeu o `profiles:` e passou a subir nos dois', () => {
    const falhas = conferirTopologia('services:\n  api: {}\n  mail: {}\n');
    assert.ok(falhas.some((f) => f.includes('NÃO tem')));
  });

  void it('REPROVA um compose sem bloco `services`, em vez de aprovar o vazio', () => {
    assert.equal(conferirTopologia('name: bichu\n').length, 1);
  });

  void it('toda entrada da lista de serviços tem motivo escrito', () => {
    assert.ok(SERVICOS_AUSENTES_NO_HOSPEDADO.size > 0);
    for (const [nome, motivo] of SERVICOS_AUSENTES_NO_HOSPEDADO) {
      assert.ok(motivo.trim().length > 40, `\`${nome}\` está na lista sem motivo`);
    }
  });
});
