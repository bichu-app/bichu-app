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
      nome: 'GET administrativo com x-audit',
      regra: /getAdminSession: GET com x-audit/,
      alterar: (s) =>
        void (operacao(s, '/admin/session', 'get')['x-audit'] = { action: 'admin.session.opened', resource_kind: 'x' }),
    },
    {
      nome: 'terceira operacao sob /admin/ sem sessao (so login e "nao fui eu" podem)',
      regra: /closeAdminSession: operacao sob \/admin\/ sem sessao fora da lista fechada/,
      alterar: (s) => {
        const op = operacao(s, '/admin/auth/logout', 'post');
        op['security'] = [];
        delete op['x-admin-roles'];
      },
    },
    {
      nome: 'o "nao fui eu" declarando sessao, como se nao fosse da lista',
      regra: /disavowAdminSessionAlert: operacao sem sessao da lista fechada; nao declara security/,
      alterar: (s) => void (operacao(s, '/admin/auth/disavow', 'post')['security'] = [{ adminSession: [] }]),
    },
    {
      nome: 'operacao administrativa que recebe password no corpo (definir senha pelo contrato)',
      regra: /closeAllAdminSessions: recebe password no corpo/,
      alterar: (s) =>
        void (operacao(s, '/admin/auth/logout-all', 'post')['requestBody'] = {
          content: { 'application/json': { schema: { type: 'object', properties: { password: { type: 'string' } } } } },
        }),
    },
    {
      nome: 'o 403 password-reset-required de volta no login',
      regra: /openAdminSession: cita password-reset-required/,
      alterar: (s) => {
        const respostas = operacao(s, '/admin/auth/login', 'post')['responses'] as Record<string, unknown>;
        respostas['403'] = {
          description: 'senha vazada',
          content: { 'application/problem+json': { example: { type: 'https://x/problems/password-reset-required' } } },
        };
      },
    },
    {
      nome: 'password-reset-required de volta no catalogo de problemas',
      regra: /x-problem-types declara password-reset-required/,
      alterar: (s) => {
        const spec = s as unknown as { 'x-problem-types': unknown[] };
        spec['x-problem-types'].push({ slug: 'password-reset-required', status: 403 });
      },
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
