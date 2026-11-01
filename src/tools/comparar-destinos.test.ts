import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DIVERGENCIAS_PERMITIDAS,
  SERVICOS_AUSENTES_NO_HOSPEDADO,
  autoteste,
  compararRespostas,
  conferirTopologia,
} from './comparar-destinos.js';

const COMMIT = '262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OUTRO_COMMIT = 'b528bc8fedcba9876543210fedcba9876543210f';

const SONDA = {
  status: 'ok',
  version: '0.1.0',
  build: { artifact: '0123456789abcdef', commit: COMMIT },
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

  void it('REPROVA quando o artefato difere, nomeando o campo e os dois valores', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: 'fedcba9876543210', commit: COMMIT } }),
    );
    assert.equal(resultado.falhas.length, 1);
    assert.match(resultado.falhas[0] as string, /build\.artifact/);
    assert.match(resultado.falhas[0] as string, /local=/);
    assert.match(resultado.falhas[0] as string, /hospedado=/);
  });

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

  void it('REPROVA quando o commit difere entre os destinos', () => {
    const resultado = compararRespostas(
      par({
        ...structuredClone(SONDA),
        build: { artifact: '0123456789abcdef', commit: OUTRO_COMMIT },
      }),
    );
    assert.equal(resultado.falhas.length, 1);
    assert.match(resultado.falhas[0] as string, /build\.commit/);
    assert.match(resultado.falhas[0] as string, /local=/);
    assert.match(resultado.falhas[0] as string, /hospedado=/);
  });

  void it('REPROVA quando um destino responde commit nulo', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: '0123456789abcdef', commit: null } }),
    );
    assert.ok(resultado.falhas.some((f) => f.includes('build.commit')));
  });

  void it('deixa passar a divergência que a lista fechada permite, e a anota', () => {
    const resultado = compararRespostas(par({ ...structuredClone(SONDA), version: '0.2.0' }), [
      { campo: 'version', motivo: 'exceção só deste teste, nunca da lista real' },
    ]);
    assert.deepEqual(resultado.falhas, []);
    assert.deepEqual(resultado.permitidas, ['version: local="0.1.0" hospedado="0.2.0"']);
  });

  void it('avisa quando uma exceção declarada não foi usada', () => {
    const resultado = compararRespostas(par(structuredClone(SONDA)), [
      { campo: 'version', motivo: 'exceção só deste teste, nunca da lista real' },
    ]);
    assert.deepEqual(resultado.naoUsadas, ['version']);
  });

  void it('toda entrada da lista fechada tem motivo escrito', () => {
    for (const entrada of DIVERGENCIAS_PERMITIDAS) {
      assert.ok(
        entrada.motivo.trim().length > 40,
        `\`${entrada.campo}\` está na lista sem motivo que explique nada`,
      );
    }
  });

  void it('`build.commit` NÃO está na lista de divergências permitidas', () => {
    assert.equal(
      DIVERGENCIAS_PERMITIDAS.some((e) => e.campo === 'build.commit'),
      false,
    );
  });
});

void describe('topologia declarada', () => {
  const DECLARADOS = new Map([['mail', 'motivo escrito, só deste bloco de casos']]);

  void it('aprova quando o serviço com perfil está declarado', () => {
    assert.deepEqual(
      conferirTopologia('services:\n  api: {}\n  mail:\n    profiles: [dev, qa]\n', DECLARADOS),
      [],
    );
  });

  void it('REPROVA um serviço com `profiles:` fora da lista fechada', () => {
    const falhas = conferirTopologia(
      'services:\n  api: {}\n  mail:\n    profiles: [dev]\n  metricas:\n    profiles: [dev]\n',
      DECLARADOS,
    );
    assert.equal(falhas.length, 1);
    assert.match(falhas[0] as string, /metricas/);
  });

  void it('REPROVA quando o serviço declarado sumiu do compose', () => {
    const falhas = conferirTopologia('services:\n  api: {}\n', DECLARADOS);
    assert.ok(falhas.some((f) => f.includes('mail')));
  });

  void it('REPROVA quando o declarado perdeu o `profiles:` e passou a subir nos dois', () => {
    const falhas = conferirTopologia('services:\n  api: {}\n  mail: {}\n', DECLARADOS);
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
