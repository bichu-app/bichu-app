/**
 * A busca de CEP contra servico publico: **ViaCEP principal, BrasilAPI de
 * reserva**.
 *
 * ## Isto e a TRADUCAO de um comportamento ja medido, e nao uma regra nova
 *
 * Cada linha deste arquivo espelha `app/lib/api/busca_de_cep.dart`, escrito e
 * medido em 17/10/2026 contra os dois servicos de verdade. O que mudou em
 * 18/10 foi **de onde a chamada sai**, por decisao do cliente
 * (*"reaproveitamento dos nossos endpoints"*): o aparelho deixa de falar com o
 * terceiro e passa a falar com a nossa rota, e a integracao passa a existir
 * **uma vez**, aqui.
 *
 * Nada foi reinterpretado na mudanca de casa. As quatro peculiaridades abaixo
 * sao as que a medicao daquele dia encontrou, e as quatro continuam tratadas:
 *
 * 1. **`erro` vem como a STRING `"true"`**, e nao como booleano. Conferir so
 *    `=== true` deixaria o CEP inexistente passar como endereco VAZIO -- e um
 *    endereco vazio tratado como achado apagaria o que a pessoa digitou.
 * 2. **CEP malformado devolve HTML com status 400**, e nao JSON. `JSON.parse`
 *    nele **estoura**, e e por isso que o status vem antes de qualquer leitura
 *    de corpo.
 * 3. **A BrasilAPI devolve `location.coordinates`**, com latitude e longitude.
 *    Quatro campos sao lidos e o resto e ignorado DE PROPOSITO: ler `location`
 *    transformaria esta busca num geocodificador, que e o que a ADR-0006
 *    proibe.
 * 4. **`complemento` do ViaCEP NAO e o complemento de quem preenche.** Ele vem
 *    como "ate 609 - lado impar", que descreve a FAIXA da rua; jogar isso no
 *    campo de complemento poria o conjunto de ninguem no endereco de uma
 *    clinica.
 *
 * ## Por que os dois hostnames podem ser literais aqui
 *
 * `infra/verificacao/verificar_portabilidade.py` reprova hostname literal em
 * `src/` e isenta `src/*&#47;adapters/external/` -- e e o mesmo lugar onde o
 * adaptador do Postmark sabe que o Postmark existe. A razao esta escrita la e
 * vale igual aqui: estes nao sao enderecos de infraestrutura nossa, que mudam
 * de dominio e pedem linha de configuracao. Sao os enderecos dos servicos
 * ESCOLHIDOS, e torna-los variavel de ambiente daria a quem edita o `.env` o
 * poder de redirecionar toda busca de CEP do produto para um servidor
 * qualquer. Trocar de servico e trocar este arquivo.
 *
 * **Nem um nem outro e pago, e nenhum pede chave ou cadastro** -- medido em
 * 17/10/2026, e e por isso que os dois podem ser chamados sem segredo nenhum
 * (ADR-0022: nao ha o que vazar porque nao ha credencial).
 *
 * ## O que sai desta casa na chamada
 *
 * **So o CEP.** Oito digitos, que sao um codigo postal publico e nao o
 * endereco de ninguem: sem numero e sem nome, ele aponta para um trecho de
 * rua. Nenhuma conta, nenhuma sessao, nenhum `Authorization`, nenhum
 * identificador nosso. O que o terceiro aprende e o par (IP do nosso
 * servidor, CEP), e isso esta dito e nao escondido.
 *
 * ## O preco de a chamada sair daqui, dito em voz alta
 *
 * Do aparelho, a carga se espalhava por milhares de IPs. Do servidor, ela sai
 * de poucos -- que e a forma mais rapida de ser bloqueado por um servico
 * gratuito, e aí a busca quebra para todo mundo de uma vez. **Foi uma escolha
 * de arquitetura do cliente, consciente**, e a contencao que ela exige e o
 * teto por conta declarado na rota (`x-rate-limit`). Nada neste arquivo
 * dispensa aquele teto.
 */
import type {
  BuscaDeCep,
  EnderecoDoCep,
  RespostaDaBuscaDeCep,
} from '../../ports/busca-de-cep.js';

/**
 * **Principal, por pedido do cliente de 17/10** (*"pode implementar o via
 * cep"*). Medido no mesmo dia: sem chave, sem cadastro, e nenhum cabecalho de
 * limite na resposta.
 */
const VIA_CEP = 'https://viacep.com.br/ws';

/**
 * Reserva, consultada **so quando a principal falha, nao responde ou diz que o
 * CEP nao existe**. As duas bases divergem, e perguntar a segunda custa menos
 * que mandar a pessoa digitar o que ela teria de graca. Em nenhum caminho ela
 * e consultada antes do ViaCEP.
 */
const BRASIL_API = 'https://brasilapi.com.br/api/cep/v2';

/**
 * Quatro segundos, **por servico**.
 *
 * Medido em 17/10/2026: a BrasilAPI respondeu em ~60 ms e o ViaCEP em ~430 ms.
 * Quatro segundos e cerca de dez vezes o mais lento dos dois, o que deixa
 * folga para rede ruim sem transformar um campo de CEP em espera. O prazo vale
 * por servico, entao o pior caso da cadeia inteira e oito segundos -- e mesmo
 * nele a resposta e `503` e o formulario continua inteiro.
 */
export const PRAZO_POR_SERVICO_MS = 4_000;

const SO_DIGITOS = /[^0-9]/g;

/** `''` para qualquer coisa que nao seja texto: numero, nulo e objeto nao sao endereco. */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Endereco completo o bastante para valer, ou `null`.
 *
 * Sem cidade ou sem UF de dois caracteres, a resposta **nao e um achado**: um
 * endereco pela metade entregue como achado faria a tela limpar campo que a
 * pessoa havia preenchido, e um campo apagado em silencio e pior que um campo
 * nao preenchido.
 */
function enderecoValido(bruto: EnderecoDoCep): EnderecoDoCep | null {
  if (bruto.city === '' || bruto.state.length !== 2) return null;
  return bruto;
}

export interface OpcoesDaBuscaDeCep {
  /**
   * Injetavel para a bancada. Sem ela, o `fetch` global -- e nao o cliente da
   * nossa API: esta chamada nao leva `Authorization` e nao conhece o nosso
   * contrato.
   */
  readonly buscarNaRede?: typeof globalThis.fetch;
  readonly prazoMs?: number;
}

export function criarBuscaDeCep(opcoes: OpcoesDaBuscaDeCep = {}): BuscaDeCep {
  const chamar = opcoes.buscarNaRede ?? globalThis.fetch;
  const prazoMs = opcoes.prazoMs ?? PRAZO_POR_SERVICO_MS;

  /**
   * Roda uma tentativa e **engole tudo o que der errado**.
   *
   * Engolir e o comportamento correto aqui, e nao descuido: rede, DNS, TLS,
   * JSON torto e prazo estourado significam a mesma coisa para quem esta
   * preenchendo o formulario, que e "digite voce mesmo". `null` quer dizer
   * "pergunte ao proximo".
   */
  const tentar = async (
    tentativa: () => Promise<RespostaDaBuscaDeCep | null>,
  ): Promise<RespostaDaBuscaDeCep | null> => {
    try {
      return await tentativa();
    } catch {
      return null;
    }
  };

  const doViaCep = async (cep: string): Promise<RespostaDaBuscaDeCep | null> => {
    const resposta = await chamar(`${VIA_CEP}/${cep}/json/`, {
      signal: AbortSignal.timeout(prazoMs),
    });
    // **O STATUS VEM ANTES DO CORPO, e esta ordem e a peculiaridade 2.** CEP
    // malformado devolve HTML com 400: ler o corpo como JSON antes de olhar o
    // status estoura, e a excecao viraria `indisponivel` -- um servico no ar
    // relatado como fora.
    if (resposta.status !== 200) return null;

    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo)) return null;

    // **A peculiaridade 1.** `erro` vem como a STRING `"true"`. As duas formas
    // sao aceitas porque a base pode normalizar um dia, e aceitar as duas nao
    // custa nada; aceitar so o booleano custaria um endereco vazio tratado
    // como achado.
    const erro = corpo['erro'];
    if (erro === true || erro === 'true') return { desfecho: 'naoEncontrado' };

    // `complemento` do ViaCEP NAO entra: ver a peculiaridade 4 no cabecalho.
    const endereco = enderecoValido({
      street: texto(corpo['logradouro']),
      neighborhood: texto(corpo['bairro']),
      city: texto(corpo['localidade']),
      state: texto(corpo['uf']).toUpperCase(),
    });
    return endereco === null ? null : { desfecho: 'encontrado', endereco };
  };

  const daBrasilApi = async (cep: string): Promise<RespostaDaBuscaDeCep | null> => {
    const resposta = await chamar(`${BRASIL_API}/${cep}`, {
      signal: AbortSignal.timeout(prazoMs),
    });
    // 404 aqui e "nao existe NA BASE DELA". Como ela e a ultima da cadeia, a
    // palavra final sobre "nao existe" e dela.
    if (resposta.status === 404) return { desfecho: 'naoEncontrado' };
    if (resposta.status !== 200) return null;

    const corpo: unknown = await resposta.json();
    if (!ehObjeto(corpo)) return null;

    // **QUATRO CAMPOS, e o resto e ignorado de proposito** (peculiaridade 3).
    // A resposta traz `location.coordinates` com latitude e longitude; ler
    // isso e o que a ADR-0006 proibe. `ibge`, `timezoneName` e `service`
    // tambem ficam de fora: nenhum tem campo em formulario nenhum, e guardar
    // dado sem finalidade e o oposto da minimizacao.
    const endereco = enderecoValido({
      street: texto(corpo['street']),
      neighborhood: texto(corpo['neighborhood']),
      city: texto(corpo['city']),
      state: texto(corpo['state']).toUpperCase(),
    });
    return endereco === null ? null : { desfecho: 'encontrado', endereco };
  };

  return {
    async buscar(cepBruto: string): Promise<RespostaDaBuscaDeCep> {
      const cep = cepBruto.replace(SO_DIGITOS, '');
      // Oito digitos ou nada. A rota ja recusa com 400 pelo `pattern` do
      // contrato; esta guarda existe porque a porta e chamavel de outro lugar
      // amanha, e uma chamada torta nao deve virar requisicao de saida.
      if (cep.length !== 8) return { desfecho: 'naoEncontrado' };

      // ViaCEP primeiro: e o servico que o cliente nomeou.
      const principal = await tentar(() => doViaCep(cep));
      if (principal !== null && principal.desfecho === 'encontrado') return principal;

      const reserva = await tentar(() => daBrasilApi(cep));
      if (reserva !== null) return reserva;

      // A principal respondeu "nao existe" e a reserva nao desmentiu.
      if (principal !== null) return principal;

      return { desfecho: 'indisponivel' };
    },
  };
}
