/** **PORTÃO: A RÉGUA DE "VALIDADO" NÃO VOLTA A SER COPIADA.** */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

/** A FONTE ÚNICA. O único arquivo onde a condição pode aparecer em código. */
const FONTE = join('src', 'shared', 'db', 'canal-de-contato-confirmado.ts');

/** O que a varredura NÃO conta como cópia, e cada exclusão tem motivo: */
function ehIsento(caminho: string): boolean {
  return (
    caminho === FONTE ||
    caminho.includes(join('shared', 'types', 'generated')) ||
    caminho.endsWith('.test.ts')
  );
}

function arquivosTs(raiz: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosTs(caminho));
    else if (entrada.name.endsWith('.ts')) achados.push(caminho);
  }
  return achados;
}

/** Uma linha é **prosa** quando o texto dela começa com `*`, `/*` ou `//`. */
function ehProsa(linha: string): boolean {
  const t = linha.trim();
  return t.startsWith('*') || t.startsWith('/*') || t.startsWith('//');
}

/** O par de colunas na mesma linha de código é a assinatura da cópia. */
function copiasEmCodigo(caminho: string): number[] {
  const linhas = readFileSync(caminho, 'utf8').split('\n');
  const achadas: number[] = [];
  linhas.forEach((linha, i) => {
    if (ehProsa(linha)) return;
    if (linha.includes('email_verified_at') && linha.includes('phone_verified_at')) {
      achadas.push(i + 1);
    }
  });
  return achadas;
}

void describe('a régua de "validado" tem uma fonte só', () => {
  void it('nenhuma linha de código em `src/` escreve a condição fora da fonte', () => {
    const culpados: string[] = [];
    for (const caminho of arquivosTs('src')) {
      if (ehIsento(caminho)) continue;
      for (const linha of copiasEmCodigo(caminho)) culpados.push(`${caminho}:${linha}`);
    }
    assert.deepEqual(
      culpados,
      [],
      `estes lugares escrevem a régua de "validado" à mão em vez de usar ` +
        `\`canalDeContatoConfirmadoNoSql\` / \`canalDeContatoConfirmado\` ` +
        `(${FONTE}). Duas definições de "validado" são duas réguas, e a mesma ` +
        `conta sai validada numa tela e não na outra — foi exatamente o que ` +
        `aconteceu com \`Me.email_verified\`:\n${culpados.join('\n')}`,
    );
  });

  void it('ISCA DA ISCA: a varredura ENXERGA uma cópia em código', () => {
    const naFonte = copiasEmCodigo(FONTE);
    assert.ok(
      naFonte.length > 0,
      'a varredura não achou a condição na PRÓPRIA fonte: ela não mede nada',
    );
    assert.ok(ehProsa(' * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`'));
    assert.ok(ehProsa('// email_verified_at e phone_verified_at'));
    assert.ok(!ehProsa("  const x = sql`a.email_verified_at ... a.phone_verified_at`;"));
  });

  void it('o contrato usa o MESMO nome de campo nas quatro superfícies', () => {
    const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    for (const esquema of ['Me', 'PublicationAuthor', 'PersonProfile', 'ConnectionPerson']) {
      const props = spec.components.schemas[esquema]?.properties ?? {};
      assert.ok(
        'contact_channel_verified' in props,
        `${esquema} não declara \`contact_channel_verified\`: o selo tem de ter ` +
          `UM nome de campo nas quatro superfícies`,
      );
    }
  });

  void it('`Me.email_verified` CONTINUA existindo e falando de e-mail', () => {
    const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
      components: {
        schemas: Record<string, { properties?: Record<string, { description?: string }> }>;
      };
    };
    const campo = spec.components.schemas['Me']?.properties?.['email_verified'];
    assert.ok(campo !== undefined, '`Me.email_verified` saiu do contrato');
    const prosa = (campo.description ?? '').toLowerCase();
    assert.ok(
      prosa.includes('nao e o selo') || prosa.includes('não é o selo'),
      '`Me.email_verified` não diz mais que NÃO é o selo de validado. A frase ' +
        'é o que impede que ele volte a fazer os dois papéis.',
    );
  });
});
