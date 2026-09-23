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

const COMMIT = '262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OUTRO_COMMIT = 'b528bc8fedcba9876543210fedcba9876543210f';

const SONDA = {
  status: 'ok',
  version: '0.1.0',
  // Era `commit: null` até a BICHUS-210 — o estado real dos dois ambientes, e a
  // concordância mais barata que existe: os dois não sabiam de onde vieram.
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

  // ISCA: é a asserção inteira do critério 12. Dois artefatos diferentes com as
  // duas pilhas de pé era exatamente o estado que o QA reprovou.
  void it('REPROVA quando o artefato difere, nomeando o campo e os dois valores', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: 'fedcba9876543210', commit: COMMIT } }),
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

  // ISCA da BICHUS-210. `build.commit` era divergência PERMITIDA enquanto o
  // commit não viajava dentro da imagem. Agora ele viaja, e dois destinos com o
  // mesmo artefato que reportam commits diferentes são uma das duas coisas que
  // a história existe para pegar: imagem construída sem o argumento certo, ou
  // valor fixado em algum lugar.
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

  // ISCA: um destino que não sabe de onde veio não pode sumir da comparação.
  void it('REPROVA quando um destino responde commit nulo', () => {
    const resultado = compararRespostas(
      par({ ...structuredClone(SONDA), build: { artifact: '0123456789abcdef', commit: null } }),
    );
    assert.ok(resultado.falhas.some((f) => f.includes('build.commit')));
  });

  // CONTROLE POSITIVO: a lista fechada precisa ser consultada de verdade. Um
  // comparador que reprova tudo passaria em todas as iscas acima.
  //
  // A lista REAL está vazia desde a BICHUS-210, então o controle passa uma
  // lista própria: sem isto o mecanismo de exceção deixaria de ser exercitado e
  // pararia de funcionar sem ninguém perceber, no dia em que a primeira entrada
  // nova chegasse.
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

  // A lista real pode estar VAZIA — e hoje está, que é o objetivo dela. O que
  // não pode é ter entrada sem motivo escrito: exceção sem justificativa é
  // exceção que ninguém revisa.
  void it('toda entrada da lista fechada tem motivo escrito', () => {
    for (const entrada of DIVERGENCIAS_PERMITIDAS) {
      assert.ok(
        entrada.motivo.trim().length > 40,
        `\`${entrada.campo}\` está na lista sem motivo que explique nada`,
      );
    }
  });

  // A lista vazia é uma decisão, e uma decisão que envelhece calada é o que
  // esta asserção impede: quem reintroduzir `build.commit` aqui precisa
  // reabrir a BICHUS-210 e explicar por que o argumento de build parou de
  // valer.
  void it('`build.commit` NÃO está na lista de divergências permitidas', () => {
    assert.equal(
      DIVERGENCIAS_PERMITIDAS.some((e) => e.campo === 'build.commit'),
      false,
    );
  });
});

void describe('topologia declarada', () => {
  // A LISTA DESTE BLOCO É DO BLOCO, E NÃO A DE PRODUÇÃO.
  //
  // Estes casos passavam a lista real por omissão, e isso os amarrava ao
  // TAMANHO dela: enquanto `SERVICOS_AUSENTES_NO_HOSPEDADO` teve uma entrada
  // só, o compose de mentira com `api` e `mail` casava por acaso. Em 23/09 o
  // serviço `ferramentas` entrou na lista real (serviço de ferramenta, com
  // `profiles:`, que compila fora do teto de runtime da `api`) e dois casos
  // deste bloco reprovaram — não por o comparador ter parado de funcionar, mas
  // por o compose de mentira não ter um serviço que a lista real citava.
  //
  // Caso que reprova quando outra pessoa acrescenta um serviço legítimo é caso
  // que mede a lista em vez de medir a regra. Com a lista explícita aqui, cada
  // caso volta a dizer exatamente o que quer dizer, e a lista real continua
  // conferida onde ela precisa ser: `node dist/tools/comparar-destinos.js`, no
  // job `contrato`, roda contra o `compose.yaml` de verdade.
  const DECLARADOS = new Map([['mail', 'motivo escrito, só deste bloco de casos']]);

  void it('aprova quando o serviço com perfil está declarado', () => {
    assert.deepEqual(
      conferirTopologia('services:\n  api: {}\n  mail:\n    profiles: [dev, qa]\n', DECLARADOS),
      [],
    );
  });

  // ISCA: um segundo serviço com perfil, sem declaração, é um serviço a menos
  // no destino hospedado que ninguém escreveu em lugar nenhum.
  void it('REPROVA um serviço com `profiles:` fora da lista fechada', () => {
    const falhas = conferirTopologia(
      'services:\n  api: {}\n  mail:\n    profiles: [dev]\n  metricas:\n    profiles: [dev]\n',
      DECLARADOS,
    );
    assert.equal(falhas.length, 1);
    assert.match(falhas[0] as string, /metricas/);
  });

  // ISCA da outra direção: declaração que envelheceu protege o que não existe.
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
