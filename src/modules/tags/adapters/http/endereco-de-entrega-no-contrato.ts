/**
 * `DeliveryAddress` do contrato para [EnderecoDeEntrega] do dominio, e de volta
 * -- **uma traducao so, nas duas direcoes**.
 *
 * ## Por que este arquivo nasceu
 *
 * As duas direcoes existiam, cada uma escrita onde fez falta primeiro:
 *
 * - **contrato para dominio** era `comoEnderecoDeEntrega`, privada em
 *   `pedido-de-plaquinha-routes.ts`;
 * - **dominio para contrato** era um literal de nove linhas, dentro de
 *   `comoAdminCollarTagRequest` em `admin-pedido-de-plaquinha-routes.ts`.
 *
 * O endereco guardado na conta (cliente, 21/10/2026) precisa das DUAS, e sem
 * este arquivo ele produziria a terceira e a quarta copia. O cliente reclamou
 * dessa exata classe de coisa nesta semana: *"voce nao esta criando um sistema
 * de upload por cada recurso ne? Voce deveria estar reaproveitando esse
 * codigo."*
 *
 * Nove campos copiados a mao em quatro lugares divergem de um jeito
 * especifico e caro: alguem acrescenta um campo e esquece um dos lados, e o
 * endereco chega incompleto numa superficie sem nada ter dado erro. Uma funcao
 * por direcao nao tem esse modo de falhar.
 *
 * ## A NORMALIZACAO E A UNICA REGRA AQUI, e ela e de formato
 *
 * `trim` nas bordas, CEP sem mascara, UF em maiuscula, complemento vazio virando
 * nulo. **Nada de conteudo e tocado**: o CEP nao completa o bairro, a UF nao
 * deduz a cidade e nada e geocodificado (ADR-0006). O servidor nao participa da
 * busca de CEP -- ela acontece no app, por servico publico, e o que chega aqui
 * e texto ja digitado ou ja corrigido.
 *
 * O CEP perde a mascara porque guardar `01311-000` e `01311000` na mesma coluna
 * daria dois enderecos iguais com dois valores diferentes. A UF vai para
 * maiuscula pelo mesmo motivo. **Nao ha lista de UF aqui**: o conjunto das 27
 * siglas vive no app (`app/lib/api/estados_brasileiros.dart`), e uma segunda
 * lista deste lado seria a segunda fonte para divergir -- o contrato tambem so
 * cobra dois caracteres.
 */
import type { EnderecoDeEntrega } from '../../ports/pedido-de-plaquinha.js';

/** `DeliveryAddress` como o schema do contrato ja o validou. */
export interface DeliveryAddressDoContrato {
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly postal_code: string;
  readonly street: string;
  readonly street_number: string;
  readonly complement?: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

/**
 * O corpo para o dominio.
 *
 * `complement` e o unico opcional do endereco, e vazio vira **nulo** e nao
 * texto vazio: guardar `''` e guardar "tem complemento" sobre um complemento
 * que nao existe.
 */
export function comoEnderecoDeEntrega(endereco: DeliveryAddressDoContrato): EnderecoDeEntrega {
  return {
    destinatario: endereco.recipient_name.trim(),
    // Ja em E.164 quando chega: o schema do contrato cobra `^\+55\d{10,11}$`,
    // e o app converte antes de enviar.
    telefone: endereco.recipient_phone.trim(),
    cep: endereco.postal_code.replace(/\D/gu, ''),
    logradouro: endereco.street.trim(),
    numero: endereco.street_number.trim(),
    complemento:
      endereco.complement === undefined || endereco.complement.trim() === ''
        ? null
        : endereco.complement.trim(),
    bairro: endereco.neighborhood.trim(),
    cidade: endereco.city.trim(),
    uf: endereco.state.trim().toUpperCase(),
  };
}

/**
 * O dominio para o corpo de resposta.
 *
 * **`complement` sai explicitamente nulo, e nao omitido.** O schema o declara
 * opcional, e omitir faria quem le distinguir "sem complemento" de "campo que
 * sumiu" -- duas coisas diferentes com a mesma aparencia.
 *
 * **Campo a campo, nunca por espalhamento.** `...endereco` publicaria cada
 * campo novo do tipo do dominio por omissao, e e assim que um dado atravessa a
 * borda sem ninguem ter decidido nada.
 */
export function comoDeliveryAddress(endereco: EnderecoDeEntrega): Record<string, unknown> {
  return {
    recipient_name: endereco.destinatario,
    recipient_phone: endereco.telefone,
    postal_code: endereco.cep,
    street: endereco.logradouro,
    street_number: endereco.numero,
    complement: endereco.complemento,
    neighborhood: endereco.bairro,
    city: endereco.cidade,
    state: endereco.uf,
  };
}
