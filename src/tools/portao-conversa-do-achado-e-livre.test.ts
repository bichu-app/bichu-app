import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { EXIGENCIA_DE_CANAL } from '../shared/autorizacao/matriz-de-capacidades.js';

/**
 * **O PORTAO DA CONVERSA QUE DEVOLVE O PET.**
 *
 * O cliente decidiu em 02/11/2026 que a conversa do achado e livre -- *"ele so
 * pode entrar em um pet perdido, e clicar em enviar mensagem ao tutor"* -- e que
 * a conversa GERAL entre pessoas exige verificacao.
 *
 * **Medindo para ligar a segunda, descobriu-se que a primeira e a unica que
 * existe:** `conversations.found_report_id` e `NOT NULL UNIQUE` e
 * `abrirPorAviso` e o unico caminho de criacao, entao TODA conversa deste produto
 * e conversa de achado. A trava chegou a ser ligada e reprovou 7 casos de
 * integracao com `409 !== 200`, travando o tutor e o achador com conta na
 * conversa do pet achado. Ela foi retirada e a capacidade ficou declarada e nao
 * ligada -- ver `conversa_entre_pessoas` na matriz.
 *
 * **Este portao e o que impede a trava de voltar por engano.** Ele mede, em
 * codigo e nao em prosa, que nenhuma das duas superficies de conversa consulta a
 * matriz enquanto a conversa entre pessoas nao existir.
 *
 * Mora em `src/tools/` porque le arquivo, e `application/` nao conhece
 * `node:fs` -- a regra de camada do ESLint reprova, e reprovou a primeira versao
 * deste arquivo. O precedente e `portao-regua-do-canal-de-contato`.
 */
const SERVICO_GERAL = join('src', 'modules', 'messaging', 'application', 'conversation-service.ts');
const SERVICO_DO_ACHADOR = join('src', 'modules', 'messaging', 'application', 'conversa-do-achador.ts');
const ROTAS_DO_ACHADOR = join(
  'src',
  'modules',
  'messaging',
  'adapters',
  'http',
  'finder-conversation-routes.ts',
);

/** A fonte **sem a prosa**: a medicao e sobre o que o compilador le. */
function apenasCodigo(caminho: string): string {
  return readFileSync(caminho, 'utf8')
    .split('\n')
    .filter((linha) => {
      const t = linha.trim();
      return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
    })
    .join('\n');
}

const NOMES_DA_MATRIZ = [
  'matriz-de-capacidades',
  'recusaDaCapacidade',
  'recusaPorExigenciaDeCanal',
  'recusaPorPrazoDoTelefone',
];

void describe('a conversa do achado e livre, e nenhuma das duas superficies e gateada', () => {
  void it('ISCA DA ISCA: a varredura le os tres arquivos e acha o que eles declaram', () => {
    assert.ok(apenasCodigo(SERVICO_GERAL).includes('abrirPorAviso'));
    assert.ok(apenasCodigo(SERVICO_DO_ACHADOR).includes('class ConversaDoAchadorService'));
    assert.ok(apenasCodigo(ROTAS_DO_ACHADOR).includes('finder_token'));
  });

  void it('a capacidade da conversa do achado e `nenhuma`', () => {
    assert.equal(
      EXIGENCIA_DE_CANAL.conversa_do_achado,
      'nenhuma',
      'a conversa do achado passou a exigir verificacao. Ela e LIVRE DO INICIO AO FIM ' +
        '(cliente, 02/11/2026): ler, responder, bloquear e denunciar sao quatro operacoes, e ' +
        'travar qualquer uma que nao seja a primeira mata a conversa que devolve o pet.',
    );
  });

  void it('o caso de uso do ACHADOR nao consulta a matriz, em ponto nenhum', () => {
    const codigo = apenasCodigo(SERVICO_DO_ACHADOR);
    for (const nome of NOMES_DA_MATRIZ) {
      assert.ok(
        !codigo.includes(nome),
        `a conversa do ACHADOR passou a consultar a matriz (\`${nome}\`). A superficie e por ` +
          '`finder_token` e alcanca quem NAO TEM CONTA: nao ha `UserId` de onde ler evidencia, ' +
          'e travar ali mata a conversa que devolve o pet. Se a decisao mudou, mude a ' +
          'decisao -- e nao o `import`.',
      );
    }
  });

  /**
   * **O caso que impede a trava de voltar antes de haver o que travar.**
   *
   * `conversa_entre_pessoas` esta declarada na matriz e **nao ligada**, porque
   * nao existe conversa entre pessoas: toda conversa deste produto vem de um
   * aviso de achado. Ligar a trava aqui hoje reprova 7 casos de integracao e
   * trava o tutor na conversa do proprio pet.
   */
  void it('o servico GERAL tambem nao consulta a matriz -- a mesma conversa, vista por quem tem conta', () => {
    const codigo = apenasCodigo(SERVICO_GERAL);
    for (const nome of NOMES_DA_MATRIZ) {
      assert.ok(
        !codigo.includes(nome),
        `\`conversation-service.ts\` passou a consultar a matriz (\`${nome}\`).\n` +
          'MEDIDO em 02/11/2026: `conversations.found_report_id` e NOT NULL UNIQUE e ' +
          '`abrirPorAviso` e o unico caminho de criacao, entao TODA conversa deste produto e ' +
          'conversa de achado -- a superficie "geral" e a MESMA conversa vista por quem tem ' +
          'conta (o tutor, e o achador que tenha conta).\n' +
          'Ligar a trava aqui nao trava amizade nenhuma: trava o tutor e o achador com conta ' +
          'lendo e respondendo a conversa do pet achado. Foi medido ligando -- 7 casos de ' +
          '`foto-na-conversa-entre-conexoes.test.ts` reprovaram com `409 !== 200`.\n' +
          'Leia `conversa_entre_pessoas` na matriz antes de religar: falta a conversa que a ' +
          'trava deveria cobrir, e o banco ainda nao sabe representar a outra.',
      );
    }
  });

  void it('as quatro operacoes do achador seguem de pe, e o teto delas e por token', () => {
    const rotas = readFileSync(ROTAS_DO_ACHADOR, 'utf8');
    for (const operacao of ['getFinderConversation', 'postFinderMessage']) {
      assert.ok(
        rotas.includes(operacao),
        `\`${operacao}\` saiu da superficie do achador. LER e RESPONDER nao podem sair: a ` +
          'conversa do achado e livre DO INICIO AO FIM, e sem a resposta ela morre no ' +
          'primeiro turno.',
      );
    }
    for (const operacao of ['blockFinderConversation', 'reportFinderConversation']) {
      assert.ok(
        rotas.includes(operacao),
        `\`${operacao}\` saiu da superficie do achador.\n` +
          'ELA ESTA DECIDIDA PARA SAIR pelo cliente (02/11/2026: "o achador nao deve bloquear ' +
          'e nem denunciar... ele e praticamente um usuario anonimo"), MAS a retirada reprova ' +
          'o portao de compatibilidade com `api-path-removed-without-deprecation` em nivel ' +
          'ERR. Se voce a fez por essa decisao, tire esta assercao junto -- e leia ' +
          '`conversa_do_achado` na matriz primeiro, porque a saida pode ser a rota RECUSAR em ' +
          'vez de deixar de existir.',
      );
    }
    assert.ok(
      rotas.includes('finder_token'),
      'a superficie do achador deixou de contar por `finder_token`. Ela e desenhada para quem ' +
        'NAO TEM CONTA, e e isso que torna impossivel exigir verificacao ali.',
    );
  });
});
