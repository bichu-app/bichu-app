/**
 * A regra do **apelido (`@`)**, num lugar só.
 *
 * Decisão do cliente de 18/10/2026: *"o apelido esta livre, vai estar no
 * cadastro do usuário e na pagina de edição do perfil"*, e antes dela *"slug
 * não tem relação com informações pessoais, é um id que o usuário escolhe e
 * você deve verificar para garantir que não tem dois iguais"*.
 *
 * O desenho vem fechado do plano `9d99ac0f`
 * (`design/prototipos/conexao-e-vitrine/PLANO.md`, seção 4-C) e **não é
 * reaberto aqui**. Este arquivo o implementa.
 *
 * ## A FAIXA É A MESMA NOS TRÊS LUGARES, E ISSO É A ARMADILHA DO DIA
 *
 * `FORMA_DO_APELIDO` é o mesmo regex do `CHECK` de `handles.handle`
 * (`20261018000005`) e do `pattern` de `Handle` no contrato, e o mesmo de
 * `app/lib/formato/apelido.dart`. Esta casa já pagou pela divergência: o
 * recado do achado aceitava **1000** no contrato e a coluna recusava acima de
 * **500**, e a pessoa recebia erro de servidor em vez de recusa explicada.
 *
 * **O teto de 20 é do apelido NORMALIZADO, e por construção ele é idêntico ao
 * digitado** — conferido, não suposto: o conjunto é ASCII restrito
 * (`[a-z0-9-]`), normalizar é só `toLowerCase` e `trim`, e nessa classe
 * `toLowerCase` é um para um. Não há forma Unicode que mude o comprimento,
 * porque acento foi recusado. O caso que isso mataria é `maxLength` contado no
 * digitado e `CHECK` contado no normalizado.
 *
 * ## O QUE NÃO ESTÁ AQUI, DE PROPÓSITO
 *
 * **Não existe `estaDisponivel()`.** O plano 4-C.5 matou a rota de
 * disponibilidade porque ela deixa varrer a base, e a mesma razão vale para uma
 * função interna que alguém exporia depois: a disponibilidade é decidida **no
 * envio**, pelo índice único, e quem repete recebe `code: 'taken'` traduzido da
 * violação. **Conferir antes e confiar é o defeito** — a janela entre conferir
 * e gravar é onde a corrida mora.
 *
 * ## AS DUAS METADES DAS RESERVADAS, E NENHUMA SUBSTITUI A OUTRA
 *
 * A tabela `handles` já carrega as 51 reservadas com `kind = 'reservado'`, e é
 * ela que impede que sejam **tomadas** — inclusive por `psql` e por script de
 * carga. A lista daqui existe para outra coisa: dar a recusa com o **motivo
 * certo** (`reserved`, e não `taken`) e aplicar a regra de **CONTÉM** do
 * `bichu`, que uma chave primária não sabe expressar.
 */
import { problemas } from '../http/errors.js';

/**
 * A forma do apelido: **5 a 20**, minúsculas latinas, dígitos e hífen.
 *
 * O mesmo regex, caractere a caractere, de `handles.handle` (`CHECK`), de
 * `Handle.pattern` no contrato e de `FormaDoApelido` em
 * `app/lib/formato/apelido.dart`.
 *
 * `{3,18}` no meio e um caractere fixo em cada ponta: é isso que dá 5 a 20 e
 * ao mesmo tempo proíbe hífen no começo e no fim.
 */
export const FORMA_DO_APELIDO = /^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$/;

/** O piso da faixa, para a mensagem dizer o número e não uma aproximação. */
export const MINIMO_DO_APELIDO = 5;

/** O teto da faixa. Do normalizado — que é idêntico ao digitado, ver o topo. */
export const MAXIMO_DO_APELIDO = 20;

/**
 * O mapa dos parecidos, **por GRUPO**, igual ao `translate` de
 * `handle_esqueleto` na migração `20261018000005`.
 *
 * **DIVERGÊNCIA DECLARADA DO PLANO, e ela é deliberada.** O plano `9d99ac0f`
 * escreve o mapa como `0→o`, `1→l`, `5→s`, `3→e`, e **esse mapa sozinho não
 * produz a colisão que o próprio plano exige**: com ele, `mar1a` vira `marla`,
 * `maria` fica `maria`, e os dois coexistiriam — ao contrário do invariante
 * escrito, que diz que `@maria-silva`, `@mariasilva` e `@mar1a-silva` não
 * coexistem.
 *
 * Para o invariante valer, **`i` também colapsa em `l`**. O mapa real é por
 * grupo de parecidos: `{0,o}`, `{1,i,l}`, `{5,s}`, `{3,e}`.
 *
 * **Custo, dito em voz alta:** `@lia`, `@l1a` e `@iia` passam a ser o mesmo
 * apelido, e isso recusa alguns apelidos legítimos a mais do que o plano
 * previa. A alternativa era deixar `@mar1a-silva` coexistir com
 * `@maria-silva`, que é a imitação que o freio existe para impedir.
 */
const PARECIDOS: ReadonlyMap<string, string> = new Map([
  ['0', 'o'],
  ['1', 'l'],
  ['i', 'l'],
  ['5', 's'],
  ['3', 'e'],
]);

/**
 * As palavras reservadas do plano 4-C.6, refeitas para o piso de 5.
 *
 * O piso de 5 matou 24 palavras do rascunho anterior (`t`, `v1`, `me`, `api`,
 * `app`, `web`, `img`, `pet`, `tag`, `oi`, `vip`, `pix`, `sair`, `pets`,
 * `rede`, `loja`, `blog`, `time`, `root`, `selo`, `null`, `true`, `test`,
 * `user`): reservar o que `FORMA_DO_APELIDO` já proíbe é regra morta.
 *
 * **Lida do plano, não reinventada.** A mesma lista está carregada em
 * `handles` pela migração `20261018000005`, e as duas precisam continuar
 * iguais — é por isso que o teste deste módulo conta as 51.
 */
export const RESERVADAS: readonly string[] = [
  // Caminho
  'public',
  'media',
  'static',
  'assets',
  'health',
  'cartaz',
  'login',
  'entrar',
  'conta',
  'perfil',
  'perto',
  'achado',
  'perdido',
  'plaquinha',
  'evento',
  'eventos',
  'diretorio',
  'busca',
  'termos',
  'privacidade',
  'sobre',
  // Plataforma
  'bichu',
  'oficial',
  'equipe',
  'suporte',
  'atendimento',
  'ajuda',
  'moderacao',
  'moderador',
  'seguranca',
  'admin',
  'administrador',
  'sistema',
  'contato',
  'noreply',
  'no-reply',
  // Golpe
  'verificado',
  'validado',
  'premium',
  'premio',
  'recompensa',
  'sorteio',
  'ganhador',
  'pagamento',
  'cobranca',
  // Técnicas
  'false',
  'teste',
  'usuario',
  'anonimo',
  'deleted',
  'excluido',
  'undefined',
];

/**
 * A palavra cuja regra é **CONTÉM**, e não igualdade.
 *
 * `@suporte-bichu` e `@oi-bichu` são a forma real do golpe, e nenhum dos dois é
 * igual a `bichu`. A igualdade não dá conta disso, e é por isso que esta
 * palavra sai da lista geral e tem regra própria.
 *
 * **Custo aceito:** um `@bichuchi` legítimo é recusado. É raro, e a saída é por
 * administrador.
 */
const CONTIDA_PROIBIDA = 'bichu';

/** O campo, como o contrato o nomeia. Uma string só, para as recusas não divergirem. */
const CAMPO = 'handle';

/**
 * O apelido normalizado: minúsculo e aparado, e nada mais.
 *
 * Nada mais porque nada mais é necessário: o conjunto aceito é ASCII restrito,
 * então não há acento a decompor nem forma Unicode a escolher. Acrescentar uma
 * normalização Unicode aqui faria o comprimento do normalizado deixar de ser
 * igual ao do digitado, que é a propriedade que o teto de 20 depende.
 */
export function normalizarApelido(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/**
 * O **esqueleto** de um apelido: sem hífen e com os parecidos colapsados.
 *
 * Igual a `handle_esqueleto(text)` da migração `20261018000005`, e as duas
 * precisam continuar iguais — o teste deste módulo compara as duas saídas para
 * os mesmos casos. Se divergirem, o índice do banco e a recusa da aplicação
 * passam a discordar sobre o que é parecido, e o furo aparece como "o servidor
 * aceitou e o banco recusou".
 */
export function esqueletoDoApelido(bruto: string): string {
  const semHifen = normalizarApelido(bruto).replaceAll('-', '');
  let saida = '';
  for (const caractere of semHifen) {
    saida += PARECIDOS.get(caractere) ?? caractere;
  }
  return saida;
}

/**
 * `true` quando o apelido cai numa palavra reservada.
 *
 * **A conferência é sobre o ESQUELETO**, dos dois lados, e não sobre o texto:
 * senão `@b1chu-suporte` passa pela lista inteira, e `@5uporte` também.
 */
export function apelidoEhReservado(bruto: string): boolean {
  const esqueleto = esqueletoDoApelido(bruto);

  // CONTÉM, em qualquer posição. `@suporte-bichu` e `@oi-bichu` são a forma
  // real do golpe, e nenhum começa com `bichu`.
  if (esqueleto.includes(esqueletoDoApelido(CONTIDA_PROIBIDA))) return true;

  return RESERVADAS.some((palavra) => esqueletoDoApelido(palavra) === esqueleto);
}

/**
 * Três sugestões derivadas do que a pessoa digitou.
 *
 * Existem porque **não há rota de disponibilidade** (plano 4-C.5): sem
 * conferência a cada tecla, a pessoa só descobre no envio, e a mitigação que
 * não custa nada é oferecer saídas em vez de explicar a regra num parágrafo.
 * É isso que resolve o nome curto legítimo — Ana, Léo, Zé — por exemplo e não
 * por explicação.
 *
 * **Elas NÃO são conferidas contra o banco, e isso é de propósito.** Conferir
 * aqui seria reintroduzir a consulta de disponibilidade por outra porta, com o
 * mesmo dano de enumeração. Uma sugestão pode estar tomada; a pessoa descobre
 * ao enviar, como em qualquer outra escolha.
 */
export function sugestoesDeApelido(bruto: string): readonly string[] {
  // Só o que é aceito pela forma, para a sugestão não nascer inválida. O que
  // sobra pode ser curto ou vazio, e os sufixos abaixo cuidam disso.
  const base = normalizarApelido(bruto)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAXIMO_DO_APELIDO - 3);

  // `pessoa` quando não sobrou nada em que apoiar. Ela nunca é sugerida
  // sozinha: os sufixos abaixo a tornam distinta, e `usuario` não serve porque
  // está na lista de reservadas.
  const semente = base.length > 0 ? base : 'pessoa';

  const sufixos = ['-bichu-1', '-01', '-oi'];
  const candidatas: string[] = [];
  for (const sufixo of sufixos) {
    let candidata = `${semente}${sufixo}`.slice(0, MAXIMO_DO_APELIDO);
    // Hífen no fim é recusado pela forma, e cortar no teto pode deixar um.
    candidata = candidata.replace(/-+$/g, '');
    // Piso de 5: `ze-01` já passa, mas `ze` + um sufixo cortado pode não.
    while (candidata.length < MINIMO_DO_APELIDO) candidata += '0';
    if (FORMA_DO_APELIDO.test(candidata) && !apelidoEhReservado(candidata)) {
      candidatas.push(candidata);
    }
  }

  // `-bichu-1` cai em `apelidoEhReservado` pela regra de CONTÉM — é um caso
  // que o teste deste módulo cobre, e é por isso que há mais sufixos de
  // reserva abaixo do que sugestões pedidas.
  for (const extra of ['-10', '-20', '-30', '-40', '-50']) {
    if (candidatas.length >= 3) break;
    let candidata = `${semente}${extra}`.slice(0, MAXIMO_DO_APELIDO).replace(/-+$/g, '');
    while (candidata.length < MINIMO_DO_APELIDO) candidata += '0';
    if (
      FORMA_DO_APELIDO.test(candidata) &&
      !apelidoEhReservado(candidata) &&
      !candidatas.includes(candidata)
    ) {
      candidatas.push(candidata);
    }
  }

  return candidatas.slice(0, 3);
}

/**
 * Confere o apelido recebido e devolve o **normalizado**.
 *
 * Lança `problemas.validacao` em cada recusa. A ordem é a ordem em que as
 * recusas ajudam: presença, faixa, forma e só então reservada.
 *
 * **Não confere disponibilidade** — ver o topo deste arquivo. Quem decide isso
 * é o índice único, no envio.
 *
 * `codigos` usados, e nenhum deles é inventado neste arquivo: `required`,
 * `too_short`, `too_long` e `format` já são usados neste repositório.
 * `reserved` é novo e está declarado na descrição de `Handle` no contrato.
 */
export function verificarApelido(bruto: unknown): string {
  if (typeof bruto !== 'string' || bruto.trim().length === 0) {
    throw problemas.validacao([
      { field: CAMPO, code: 'required', message: 'Escolha um apelido.' },
    ]);
  }

  const apelido = normalizarApelido(bruto);

  // A FAIXA ANTES DA FORMA, porque a mensagem é diferente e mais útil. Quem
  // digitou `ze` precisa ler "mínimo de 5", e não a lista de caracteres
  // aceitos — o problema dele não é o alfabeto.
  if (apelido.length < MINIMO_DO_APELIDO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_short',
        message: `Use no mínimo ${MINIMO_DO_APELIDO} caracteres no apelido.`,
      },
    ]);
  }
  if (apelido.length > MAXIMO_DO_APELIDO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_long',
        message: `Use no máximo ${MAXIMO_DO_APELIDO} caracteres no apelido.`,
      },
    ]);
  }

  if (!FORMA_DO_APELIDO.test(apelido)) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'format',
        // DIZ A FAIXA, E SÓ. Sem parágrafo de apoio: o cliente mandou remover
        // textos de apoio das telas em 18/10, e a orientação de verdade vem
        // das três sugestões.
        message: `De ${MINIMO_DO_APELIDO} a ${MAXIMO_DO_APELIDO} caracteres: letras minúsculas, números e hífen.`,
      },
    ]);
  }

  if (apelidoEhReservado(apelido)) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'reserved',
        // **A FRASE DIZ SÓ A FAIXA, e as três sugestões são da TELA.**
        // `ProblemFieldError` tem `field`, `code` e `message`, e nada mais:
        // acrescentar `suggestions` mudaria o schema `Problem` do contrato, que
        // é compartilhado por toda operação deste repositório — mudança larga
        // para resolver um caso. A tela deriva as três com a MESMA regra, de
        // `app/lib/formato/apelido.dart`, e `sugestoesDeApelido` abaixo existe
        // para o teste de paridade entre os dois lados.
        message: `De ${MINIMO_DO_APELIDO} a ${MAXIMO_DO_APELIDO} caracteres: letras minúsculas, números e hífen.`,
      },
    ]);
  }

  return apelido;
}

/**
 * Traduz a violação de unicidade do banco em recusa de campo.
 *
 * **É aqui que a disponibilidade é decidida**, e não numa consulta anterior: as
 * duas escritas concorrentes vão ao banco, uma viola o índice, e esta função
 * transforma o erro do Postgres no `code: 'taken'` que a tela trata. É o que
 * fecha a corrida que um "conferir antes" deixaria aberta.
 *
 * Devolve `undefined` quando o erro **não** é de apelido tomado — quem chama
 * precisa deixar esse passar, porque engolir erro de banco desconhecido é como
 * um defeito de escrita vira "apelido indisponível" para sempre.
 */
export function recusaDeApelidoTomado(erro: unknown): unknown {
  const comCodigo = erro as { code?: string; constraint?: string; message?: string };
  if (comCodigo.code !== '23505') return undefined;

  const alvo = `${comCodigo.constraint ?? ''} ${comCodigo.message ?? ''}`;
  const ehApelido =
    alvo.includes('handles_pkey') ||
    alvo.includes('handles_esqueleto_unico') ||
    alvo.includes('handles_uma_pessoa_um_apelido') ||
    alvo.includes('handle');
  if (!ehApelido) return undefined;

  return problemas.validacao([
    {
      field: CAMPO,
      code: 'taken',
      // NÃO DIZ DE QUEM É, e isso importa: o que pode vazar é que um apelido
      // está tomado, nunca **quem** o tem — e como o apelido não deriva de
      // identidade, `@maria` existir não diz que a Maria Silva tem conta.
      //
      // As três sugestões são da tela, pela mesma razão do `reserved` acima.
      message: 'Esse apelido já está em uso. Escolha outro.',
    },
  ]);
}
