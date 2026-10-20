/**
 * A VITRINE esta ligada ao registrador de intencao DELA, em `src/bin/api.ts`.
 *
 * ## POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE LE O FONTE
 *
 * O defeito de 18/10/2026 nao estava em nenhuma funcao: estava na FIACAO.
 * `api.ts` passava `registrarIntencaoDeCapaDaComunidade` para
 * `new VitrineDeFotos({...})`, e aquela funcao grava
 * `purpose = 'network_event'` literal. As duas funcoes tinham a mesma
 * assinatura, entao a troca compilou.
 *
 * Medido contra a pilha efemera de integracao no commit `f8c74714` (o mesmo de
 * homologacao): `POST /v1/me/showcase/photo-intents` devolvia `201` com a chave
 * de pessoa (`people/original/...`) e `PUT /v1/me/showcase` devolvia `404` para
 * a MESMA `upload_id`, porque a confirmacao procura o envio com
 * `purpose = 'user_showcase'`. **Nenhuma foto de vitrine podia ser salva.**
 *
 * O caso de uso e a funcao de persistencia sao medidos em
 * `src/modules/showcase/adapters/persistence/intencao-da-vitrine-grava-user-showcase.test.ts`.
 * Aquele arquivo passava verde no dia do defeito, porque ele exercita a funcao
 * que a fiacao NAO estava usando. Este mede o unico lugar onde o defeito
 * morava, e ele e um arquivo de fonte -- por isso mora em `src/tools/`, ao lado
 * dos outros portoes que leem arquivo do disco (o `eslint` deste repositorio
 * recusa `node:fs` em `domain/`, e com razao).
 *
 * ## A ALTERNATIVA QUE NAO FUNCIONA, E ELA FOI CONSIDERADA
 *
 * Fechar o furo no TIPO -- `purpose` literal na porta -- ja esta feito
 * (`DependenciasDaVitrine.registrarIntencao`), e nao basta: uma funcao cujo
 * parametro tem MENOS campos continua sendo atribuivel a um lugar que passa
 * mais. E exatamente o caso de `registrarIntencaoDeCapaDaComunidade`, que nao
 * declara `purpose` nenhum. O compilador nao reclama, e por isso a conferencia
 * precisa ser esta.
 *
 * ## ISCA CONFERIDA
 *
 * Em 18/10/2026, devolvendo `registrarIntencao:
 * registrarIntencaoDeCapaDaComunidade` ao bloco da vitrine em `api.ts` (a
 * reproducao exata do defeito), os dois casos abaixo reprovam pelo nome.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const api = readFileSync('src/bin/api.ts', 'utf8');

/**
 * O bloco `new VitrineDeFotos({ ... })`, recortado pelo fecho do construtor.
 *
 * O recorte importa: `api.ts` tem outros tres blocos que passam
 * `registrarIntencao`, e procurar o nome no arquivo inteiro acharia o da capa
 * do encontro -- que esta certo onde esta -- e daria verde com o defeito de pe.
 */
function blocoDaVitrine(): string {
  const inicio = api.indexOf('new VitrineDeFotos({');
  assert.ok(
    inicio > 0,
    '`new VitrineDeFotos({` nao esta em `src/bin/api.ts`. Se a construcao mudou de ' +
      'forma, este portao precisa acompanhar em vez de passar por nao achar nada.',
  );
  const fim = api.indexOf('\n    }),', inicio);
  assert.ok(fim > inicio, 'nao achei o fecho do construtor da vitrine');
  return api.slice(inicio, fim);
}

void describe('a vitrine de fotos esta ligada ao registrador de intencao dela (api.ts)', () => {
  void it('ISCA: o bloco da vitrine usa `registrarIntencaoDaVitrineDoUsuario`', () => {
    assert.match(
      blocoDaVitrine(),
      /registrarIntencao:\s*registrarIntencaoDaVitrineDoUsuario\b/,
      'a vitrine precisa gravar a intencao com `purpose = user_showcase`. Com outro ' +
        'registrador, `POST /v1/me/showcase/photo-intents` devolve 201 e ' +
        '`PUT /v1/me/showcase` devolve 404 para a mesma `upload_id` -- o defeito que o ' +
        'cliente relatou em 18/10/2026 como "subir a foto esta dando erro".',
    );
  });

  void it('ISCA: o bloco da vitrine NAO usa o registrador da capa do encontro', () => {
    // A ATRIBUICAO, e nao a mencao: o bloco cita o nome num comentario, que e o
    // registro do defeito e precisa continuar la. Procurar o nome solto faria
    // este caso reprovar pelo proprio comentario -- e um portao que reprova a
    // documentacao da causa e um portao que alguem apaga.
    assert.ok(
      !/registrarIntencao:\s*registrarIntencaoDeCapaDaComunidade\b/.test(blocoDaVitrine()),
      'o registrador da capa do encontro grava `purpose = network_event` literal. Na ' +
        'vitrine ele produz uma intencao que a confirmacao nunca acha, e o efeito nao ' +
        'e uma foto errada: e nenhuma foto salva.',
    );
  });
});
