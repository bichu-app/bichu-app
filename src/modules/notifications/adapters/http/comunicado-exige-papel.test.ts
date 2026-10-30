/** A TRAVA DO COMUNICADO, conferida na DECLARACAO da rota. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACOES_ADMINISTRATIVAS } from '../../../audit/ports/audit-log.js';
import {
  rotaDeDispararComunicado,
  rotaDeListarComunicados,
  rotaDaJanelaDeDisparo,
} from './admin-comunicado-routes.js';

/** A forma LARGA da declaracao de rota. */
interface RotaConferivel {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly effects: readonly string[];
  readonly adminRoles?: readonly string[] | undefined;
  readonly audit?: { readonly action: string; readonly resourceKind: string } | undefined;
  readonly adminReauthScope?: string | undefined;
}

const TODAS: readonly RotaConferivel[] = [
  rotaDeListarComunicados,
  rotaDaJanelaDeDisparo,
  rotaDeDispararComunicado,
];

const JANELA: RotaConferivel = rotaDaJanelaDeDisparo;

void describe('a trava do comunicado', () => {
  void it('1. as tres rotas moram sob /admin e exigem papel de administrador', () => {
    for (const rota of TODAS) {
      assert.ok(
        rota.path.startsWith('/admin/'),
        `REPROVA: ${rota.operationId} nao esta sob /admin. Fora do prefixo ela precisaria de ` +
          'handle explicito na borda, e sem ele o painel chama um endereco que a borda nao serve',
      );
      assert.deepEqual(
        rota.adminRoles,
        ['admin'],
        `REPROVA: ${rota.operationId} nao exige papel de administrador. A guarda do prefixo ` +
          'nao tem o que aplicar sobre uma rota que nao declara papel',
      );
    }
  });

  void it('2. o disparo DEIXA TRILHA, com acao que existe em ACOES_ADMINISTRATIVAS', () => {
    assert.ok(
      rotaDeDispararComunicado.audit !== undefined,
      'REPROVA: o disparo do comunicado nao declara x-audit. Megafone sem trilha e o que vira ' +
        'incidente: o comunicado chega a toda caixa e nao deixa em nenhuma delas quem o mandou',
    );
    assert.equal(
      rotaDeDispararComunicado.audit.action,
      'admin.broadcast.dispatched',
      'REPROVA: a acao da trilha do disparo nao e a esperada',
    );
    assert.ok(
      (ACOES_ADMINISTRATIVAS as readonly string[]).includes(
        rotaDeDispararComunicado.audit.action,
      ),
      'REPROVA: a acao nao esta em ACOES_ADMINISTRATIVAS. `eventoAdministrativo` lanca em ' +
        'tempo de execucao para acao fora da lista, entao a rota subiria e o disparo quebraria',
    );
  });

  void it('3. o disparo e irreversivel e notifica, e a janela de disparo nao e nenhum dos dois', () => {
    assert.deepEqual(
      [...rotaDeDispararComunicado.effects].sort(),
      ['irreversible_write', 'notifies'],
      'REPROVA: o disparo nao se declara como escrita irreversivel que notifica. Sao as duas ' +
        'marcas que fazem o catalogo do ADR-0016 trata-lo pelo que ele e',
    );
    assert.deepEqual(
      JANELA.effects,
      [],
      'REPROVA: a janela de disparo declarou efeito. Ela nao grava nada e nao alcanca caixa nenhuma',
    );
    assert.equal(
      JANELA.audit,
      undefined,
      'REPROVA: a janela de disparo declarou trilha. Ela e GET e nao le pessoa -- would_reach e ' +
        'uma CONTAGEM de contas e nunca uma lista delas (regra 5 do portao, D55/D56). E uma ' +
        'trilha por tecla digitada afogaria a do disparo, que e a que importa',
    );
  });

  void it('4. NENHUMA das tres pede senha -- ADR-0027 emenda do item 23', () => {
    for (const rota of TODAS) {
      assert.equal(
        rota.adminReauthScope,
        undefined,
        `REPROVA: ${rota.operationId} pede reautenticacao. A emenda do item 23 do ADR-0027 ` +
          '(07/10/2026) tirou a senha de TODA escrita do painel, por decisao do cliente e com o ' +
          'risco de sessao sequestrada aceito. Acrescenta-la aqui contraria ADR em vigor, ' +
          'mesmo parecendo endurecer a trava. Se a decisao mudar, este caso cai com ela',
      );
    }
  });

  void it('4b. a janela de disparo e GET, e por isso nao precisa de trilha', () => {
    assert.equal(
      JANELA.method,
      'get',
      'REPROVA: a janela de disparo deixou de ser GET. Sob /admin, metodo nao seguro E escrita ' +
        'e exige x-audit (regra 2 do portao-contrato-administrativo). Se ela precisar de corpo ' +
        'um dia, a pergunta certa e por que o servidor precisa do texto -- hoje ele nao precisa',
    );
  });

  void it('5. nao existe rota de APAGAR comunicado neste modulo', () => {
    for (const rota of TODAS) {
      assert.notEqual(
        rota.method,
        'delete',
        `REPROVA: ${rota.operationId} e um DELETE. Comunicado disparado fica registrado: ` +
          'nao ha rota de apagar, nao ha no contrato e nao ha coluna de exclusao na tabela',
      );
    }
  });
});
