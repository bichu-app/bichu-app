/**
 * ISCA (b): **O DENUNCIADO NÃO RECEBE NADA E NÃO DESCOBRE PELA RESPOSTA.**
 *
 * Duas afirmações, e as duas são AUSÊNCIAS — o que é exatamente o tipo de
 * afirmação que um teste de comportamento não consegue sustentar: ele prova que
 * aquele caminho não avisou, e não que nenhum caminho avisa.
 *
 * Então este arquivo prova por ESTRUTURA, em três conferências que reprovam
 * sozinhas:
 *
 * 1. **nenhum arquivo do módulo nomeia aviso ao denunciado** — a varredura é
 *    pelo nome literal, inclusive em comentário, e é a mesma forma de
 *    `portao-colunas-que-nao-saem`;
 * 2. **nenhum arquivo do módulo nomeia prazo** — não existe prazo, e o campo
 *    que o prometeria não pode nascer;
 * 3. **a resposta ao denunciante é a MESMA na primeira denúncia e na
 *    repetição** — se ela mudasse, a diferença seria o canal por onde alguém
 *    descobriria o estado da própria denúncia, e daí sairia o prazo.
 *
 * ## Por que a varredura é do MÓDULO e não só deste arquivo
 *
 * Porque o defeito que se quer impedir é o de amanhã: alguém acrescenta uma
 * porta de notificação ao caso de uso porque "seria educado avisar". A
 * varredura pega isso no dia, e não quando a primeira pessoa for retaliada.
 *
 * ## Por que este arquivo está em `adapters/` e não ao lado do que ele guarda
 *
 * Porque ele LÊ O DISCO, e `domain/` não conhece sistema de arquivos — a regra
 * de fronteira do ESLint reprova `node:fs` em `domain/` e em `application/`, e
 * com razão. O assunto também encaixa aqui: metade do que este arquivo afirma é
 * sobre a RESPOSTA, que é da borda.
 *
 * A ISCA POR DESLIGAMENTO está no fim: o mesmo varredor, apontado para um texto
 * que CONTÉM o nome proibido, precisa reprovar. Sem ela, um varredor que
 * deixasse de enxergar aprovaria tudo em silêncio — que é o pior modo de falha
 * de um portão de ausência.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AVISOS_PROIBIDOS,
  PRAZOS_PROIBIDOS,
  O_QUE_O_DENUNCIANTE_RECEBE,
} from '../../domain/o-denunciado-nao-e-avisado.js';

const MODULO = join('src', 'modules', 'safety');

/** Todo `.ts` do módulo, menos este arquivo — que nomeia os proibidos de propósito. */
function arquivosDoModulo(dir = MODULO): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosDoModulo(caminho));
    else if (entrada.name.endsWith('.ts') && !entrada.name.startsWith('o-denunciado-nao-e-avisado'))
      achados.push(caminho);
  }
  return achados;
}

/**
 * O arquivo SEM COMENTÁRIO, que é o que a varredura olha.
 *
 * A distinção é a regra e não uma concessão: o que não pode existir é o
 * MECANISMO, e a prosa que explica por que ele não existe tem de poder nomeá-lo
 * — este módulo escreve "o denunciado não é avisado" em meia dúzia de lugares
 * de propósito, e uma varredura que reprovasse isso obrigaria a apagar a
 * explicação para passar no portão que a explicação existe para sustentar.
 *
 * Então: fora `//` e `/* ... *\/`, e o que sobra é código.
 */
function semComentario(texto: string): readonly { linha: number; codigo: string }[] {
  const linhas = texto.split('\n');
  const limpas: { linha: number; codigo: string }[] = [];
  let emBloco = false;
  linhas.forEach((bruta, i) => {
    let linha = bruta;
    if (emBloco) {
      const fim = linha.indexOf('*/');
      if (fim < 0) return;
      linha = linha.slice(fim + 2);
      emBloco = false;
    }
    for (;;) {
      const abre = linha.indexOf('/*');
      if (abre < 0) break;
      const fecha = linha.indexOf('*/', abre + 2);
      if (fecha < 0) {
        linha = linha.slice(0, abre);
        emBloco = true;
        break;
      }
      linha = linha.slice(0, abre) + linha.slice(fecha + 2);
    }
    const barra = linha.indexOf('//');
    if (barra >= 0) linha = linha.slice(0, barra);
    if (linha.trim() !== '') limpas.push({ linha: i + 1, codigo: linha });
  });
  return limpas;
}

/**
 * Onde o nome proibido aparece NO CÓDIGO, com arquivo e linha. Vazio é o
 * esperado.
 *
 * A comparação é por PALAVRA e não por trecho: `sla` dentro de uma palavra
 * portuguesa qualquer não é uma promessa de prazo, e um varredor que reprovasse
 * por isso seria desligado na primeira semana — que é a pior coisa que pode
 * acontecer a um portão de ausência.
 */
function ocorrencias(nomes: readonly string[], arquivos: readonly string[]): readonly string[] {
  const achados: string[] = [];
  for (const arquivo of arquivos) {
    for (const { linha, codigo } of semComentario(readFileSync(arquivo, 'utf8'))) {
      for (const nome of nomes) {
        const padrao = new RegExp(`(^|[^\\p{L}\\p{N}_])${nome.replace(/ /gu, '[ _]')}($|[^\\p{L}\\p{N}_])`, 'iu');
        if (padrao.test(codigo)) achados.push(`${arquivo}:${String(linha)} — ${nome}`);
      }
    }
  }
  return achados;
}

void describe('o denunciado não é avisado', () => {
  const arquivos = arquivosDoModulo();

  void it('o módulo tem arquivo: varredura sobre pasta vazia não aprova nada', () => {
    // Sem isto, apagar o módulo deixaria os dois casos abaixo verdes por vazio,
    // que é o modo de falha mais perigoso de um portão de ausência.
    assert.ok(arquivos.length >= 5, `só ${String(arquivos.length)} arquivos varridos em ${MODULO}`);
  });

  void it('nenhum arquivo do módulo nomeia aviso ao denunciado', () => {
    assert.deepEqual(
      ocorrencias(AVISOS_PROIBIDOS, arquivos),
      [],
      'alguém acrescentou um caminho de aviso ao denunciado. Avisar o denunciado é ' +
        'RETALIAÇÃO: quem denuncia um assediador e vê o assediador receber "você foi ' +
        'denunciado" acaba de entregar a ele a informação de que reagiu. O lugar do ' +
        'conserto é apagar o aviso, não esta lista.',
    );
  });

  void it('nenhum arquivo do módulo promete prazo', () => {
    assert.deepEqual(
      ocorrencias(PRAZOS_PROIBIDOS, arquivos),
      [],
      'alguém prometeu prazo. NÃO EXISTE PRAZO: não há equipe de moderação de plantão, ' +
        'e o que faz a denúncia valer sem prazo é a ocultação imediata, que é filtro de ' +
        'leitura no banco.',
    );
  });

  void it('a porta do módulo não tem método de aviso, e por isso avisar não é exprimível', () => {
    // A varredura é do CÓDIGO da porta, e não do texto: a porta explica a
    // ausência em português e precisa poder nomear os canais para isso.
    //
    // A lista é curta de propósito: são os canais de saída que o produto tem.
    const canais = ['push', 'notificar', 'notification', 'sendMail', 'enviarEmail', 'notificacao'];
    assert.deepEqual(
      ocorrencias(canais, [join(MODULO, 'ports', 'safety-repository.ts')]),
      [],
      'a porta ganhou um canal de saída: avisar o denunciado passou a ser exprimível, e ' +
        'avisar o denunciado é RETALIAÇÃO. O lugar do conserto é apagar o método.',
    );
    // E o caso de uso também não tem: é lá que a dependência entraria.
    assert.deepEqual(
      ocorrencias(canais, [join(MODULO, 'application', 'seguranca-da-comunidade.ts')]),
      [],
      'o caso de uso ganhou uma porta de aviso',
    );
  });

  void it('a resposta ao denunciante é tudo o que ele recebe, e não carrega estado', () => {
    // `202` com `status: accepted`, e NADA MAIS. Sem identificador de denúncia
    // (que convidaria a uma rota de consulta, onde o prazo nasceria), sem
    // estado e sem posição na fila.
    assert.deepEqual(O_QUE_O_DENUNCIANTE_RECEBE, { status: 'accepted' });
    assert.deepEqual(Object.keys(O_QUE_O_DENUNCIANTE_RECEBE), ['status']);
  });

  void it('ISCA POR DESLIGAMENTO: o varredor acha o nome proibido NO CÓDIGO', () => {
    // Um varredor que deixou de enxergar aprova tudo em silêncio, e este caso é
    // o que separa "conferi e está limpo" de "não achei nada".
    //
    // A isca é um arquivo de verdade do módulo, pedindo um nome que ele TEM no
    // código: se a varredura parar de funcionar, este caso reprova antes dos
    // dois acima ficarem verdes por engano.
    const real = join(MODULO, 'domain', 'motivos-da-denuncia.ts');
    assert.ok(
      ocorrencias(['MOTIVOS_DE_PERFIL'], [real]).length > 0,
      'o varredor não achou `MOTIVOS_DE_PERFIL` no código de `motivos-da-denuncia.ts`: ' +
        'ele deixou de enxergar, e os casos acima estão verdes por isso.',
    );
    // E a segunda metade da isca: ele IGNORA o que está em comentário, que é a
    // única razão de este módulo poder explicar a regra em português.
    assert.deepEqual(
      ocorrencias(['notified_at'], [join(MODULO, 'ports', 'safety-repository.ts')]),
      [],
      'a porta ganhou `notified_at` no código',
    );
  });
});
