/**
 * **PORTÃO: A RÉGUA DE "VALIDADO" NÃO VOLTA A SER COPIADA.**
 *
 * Decisão do cliente, 21/10/2026: *"Unificar agora, nas duas — a mesma régua
 * (e-mail OU telefone) nos dois lugares, antes de telefone existir."*
 *
 * ## Por que um portão, e não só a fonte única
 *
 * A régua estava escrita em **oito** lugares no SQL e em **dois** no
 * TypeScript, e cada cópia trazia um comentário explicando que a cópia era
 * deliberada *"porque duas definições de validado são duas réguas"*. O
 * raciocínio estava certo; a execução era o próprio risco. E o risco se
 * cumpriu: `Me.email_verified` — o selo que o DONO vê de si — ficou só com
 * e-mail, enquanto `contact_channel_verified` — o selo que os OUTROS veem — é
 * e-mail **OU** telefone.
 *
 * Unificar sem portão é esperar que a próxima pessoa que precise da condição
 * não a escreva à mão, com um comentário igualmente bem-intencionado. O que
 * este arquivo cobra é o que nenhuma revisão lembra de cobrar: **nenhuma linha
 * de CÓDIGO em `src/` escreve a condição**, fora da fonte única.
 *
 * ## Mora em `src/tools/` porque lê arquivo
 *
 * `node:fs` é recusado pelo `eslint` em `domain/`, e com razão. Os vizinhos
 * deste diretório fazem o mesmo.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

/** A FONTE ÚNICA. O único arquivo onde a condição pode aparecer em código. */
const FONTE = join('src', 'shared', 'db', 'canal-de-contato-confirmado.ts');

/**
 * O que a varredura NÃO conta como cópia, e cada exclusão tem motivo:
 *
 * - **`src/shared/types/generated/`** é saída de `openapi-typescript`: a
 *   condição aparece lá dentro da PROSA do contrato, e editar o arquivo à mão é
 *   que seria o defeito;
 * - **`*.test.ts`** pode conter a condição em código por um motivo legítimo e
 *   oposto ao da cópia: os dois `autorizacao-na-clausula-where.test.ts` cobram
 *   a expressão COMPILADA pelo nome completo das duas colunas, e é exatamente
 *   essa conferência que prende a fonte única ao SQL que sai. Um portão que
 *   proibisse isso proibiria a própria medição.
 */
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

/**
 * Uma linha é **prosa** quando o texto dela começa com `*`, `/*` ou `//`.
 *
 * A distinção importa e não é cosmética: a condição aparece escrita em dezenas
 * de cabeçalhos, e ela **deve** aparecer lá — é assim que quem lê o arquivo
 * descobre qual é a régua. O que não pode voltar é a condição EXECUTADA fora da
 * fonte.
 */
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
    // Sem este caso o de cima ficaria verde se a varredura parasse de casar —
    // e ela casa por substring em duas colunas, que é o tipo de conferência que
    // envelhece calada. A fonte única, que a varredura ISENTA, é o material:
    // ela contém a condição em código, e por isso serve de positivo.
    const naFonte = copiasEmCodigo(FONTE);
    assert.ok(
      naFonte.length > 0,
      'a varredura não achou a condição na PRÓPRIA fonte: ela não mede nada',
    );
    // E a prosa não conta como cópia, senão o portão reprovaria todo cabeçalho
    // que explica a régua.
    assert.ok(ehProsa(' * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`'));
    assert.ok(ehProsa('// email_verified_at e phone_verified_at'));
    assert.ok(!ehProsa("  const x = sql`a.email_verified_at ... a.phone_verified_at`;"));
  });

  void it('o contrato usa o MESMO nome de campo nas quatro superfícies', () => {
    // Dois nomes para a mesma régua são o caminho de volta para duas réguas: é
    // assim que `Me.email_verified` virou o selo do dono sem ninguém decidir
    // isso. O nome é um só, e o selo do DONO entrou nele em 21/10/2026.
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
    // A metade que impede "unificar" de virar licença para o campo mentir.
    // Campo de contrato com nome que fala de e-mail tem de responder sobre
    // e-mail: a tela usa este booleano na linha "E-mail confirmado / E-mail
    // ainda não confirmado" ao lado do endereço, e a pendência
    // `email_verification` sai dele.
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
