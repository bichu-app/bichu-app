/**
 * O portao do contrato administrativo contra o contrato real, e contra uma isca
 * por regra. Cada isca e o contrato real com UMA alteracao; se o portao deixar
 * de acusar qualquer uma, ele deixou de verificar aquilo, e este arquivo
 * reprova dizendo qual.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';

import { conferirContratoAdministrativo } from './portao-contrato-administrativo.js';

const TEXTO = readFileSync(resolve(process.cwd(), 'api/openapi.yaml'), 'utf8');

type Spec = { paths: Record<string, Record<string, Record<string, unknown>>> };

function comAlteracao(alterar: (spec: Spec) => void): string {
  const spec = parseYaml(TEXTO) as Spec;
  alterar(spec);
  return stringify(spec);
}

function operacao(spec: Spec, caminho: string, metodo: string): Record<string, unknown> {
  const achada = spec.paths[caminho]?.[metodo];
  assert.ok(achada !== undefined, `isca aponta para ${metodo} ${caminho}, que o contrato nao tem mais`);
  return achada;
}

void describe('portao do contrato administrativo', () => {
  void it('o contrato real passa, e tem operacoes administrativas para conferir', () => {
    const { operacoesAdministrativas, violacoes } = conferirContratoAdministrativo(TEXTO);
    assert.deepEqual(violacoes, []);
    assert.ok(operacoesAdministrativas >= 5, `so ${String(operacoesAdministrativas)} operacoes sob /admin/`);
  });

  void it('a fila de pedidos e a leitura auditada que a regra 5 aceita: GET com x-audit de leitura', () => {
    const spec = parseYaml(TEXTO) as Spec;
    const fila = operacao(spec, '/admin/network/join-requests', 'get');
    assert.deepEqual(fila['x-audit'], {
      action: 'admin.network_join_request.listed',
      resource_kind: 'network_join_request',
    });
  });

  const iscas: readonly { nome: string; regra: RegExp; alterar: (spec: Spec) => void }[] = [
    {
      nome: 'leitura administrativa sem x-admin-roles',
      regra: /getAdminSession: sem x-admin-roles/,
      alterar: (s) => void delete operacao(s, '/admin/session', 'get')['x-admin-roles'],
    },
    {
      nome: 'x-admin-roles com papel fora de AdminRole',
      regra: /getAdminSession: x-admin-roles com valor fora de AdminRole/,
      alterar: (s) => void (operacao(s, '/admin/session', 'get')['x-admin-roles'] = ['moderator']),
    },
    {
      nome: 'operacao administrativa sem adminSession',
      regra: /closeAdminSession: sem adminSession/,
      alterar: (s) => void (operacao(s, '/admin/auth/logout', 'post')['security'] = [{ adminCsrf: [] }]),
    },
    {
      nome: 'escrita administrativa sem x-audit',
      regra: /closeAllAdminSessions: escrita sem x-audit/,
      alterar: (s) => void delete operacao(s, '/admin/auth/logout-all', 'post')['x-audit'],
    },
    {
      nome: 'escrita administrativa sem adminCsrf',
      regra: /reauthenticateAdmin: escrita sem adminCsrf/,
      alterar: (s) => void (operacao(s, '/admin/auth/reauth', 'post')['security'] = [{ adminSession: [] }]),
    },
    {
      nome: 'operacao do app declarando adminSession',
      regra: /getMe: fora de \/admin\/ e declara adminSession/,
      alterar: (s) => void (operacao(s, '/me', 'get')['security'] = [{ bearerAuth: [], adminSession: [] }]),
    },
    {
      nome: 'adminReauth sem x-admin-reauth-scope',
      regra: /adminReauth e x-admin-reauth-scope precisam andar juntos/,
      alterar: (s) => {
        for (const item of Object.values(s.paths)) {
          for (const op of Object.values(item)) {
            if (typeof op === 'object' && op !== null && 'x-admin-reauth-scope' in op) {
              delete op['x-admin-reauth-scope'];
              return;
            }
          }
        }
        assert.fail('o contrato nao tem operacao com x-admin-reauth-scope para a isca');
      },
    },
    {
      nome: 'GET administrativo com x-audit de verbo de escrita',
      regra: /getAdminSession: GET com x-audit de verbo que nao e de leitura/,
      alterar: (s) =>
        void (operacao(s, '/admin/session', 'get')['x-audit'] = { action: 'admin.session.opened', resource_kind: 'x' }),
    },
    {
      nome: 'GET administrativo com x-audit de leitura, mas sem teto por linhas (nao e leitura de pessoa)',
      regra: /getAdminSession: GET com x-audit sem teto por rows_returned/,
      alterar: (s) =>
        void (operacao(s, '/admin/session', 'get')['x-audit'] = { action: 'admin.session.listed', resource_kind: 'x' }),
    },
    {
      nome: 'a fila de pedidos perde o teto por linhas e fica com x-audit',
      regra: /listAdminNetworkJoinRequests: GET com x-audit sem teto por rows_returned/,
      alterar: (s) => void delete operacao(s, '/admin/network/join-requests', 'get')['x-rate-limit'],
    },
    {
      nome: 'a fila de pedidos perde o x-audit (leitura de pessoa sem trilha)',
      regra: /listAdminNetworkJoinRequests: GET com teto por rows_returned e sem x-audit/,
      alterar: (s) => void delete operacao(s, '/admin/network/join-requests', 'get')['x-audit'],
    },
    {
      nome: 'contrato sem nenhuma operacao administrativa',
      regra: /nenhuma operacao sob \/admin\//,
      alterar: (s) => {
        for (const caminho of Object.keys(s.paths)) if (caminho.startsWith('/admin/')) delete s.paths[caminho];
      },
    },
  ];

  for (const isca of iscas) {
    void it(`isca que precisa reprovar: ${isca.nome}`, () => {
      const { violacoes } = conferirContratoAdministrativo(comAlteracao(isca.alterar));
      assert.ok(
        violacoes.some((v) => isca.regra.test(v)),
        `o portao nao acusou a isca '${isca.nome}'. Violacoes: ${JSON.stringify(violacoes)}`,
      );
    });
  }
});
