import '../widgets/seletor_de_lista.dart';

/// Os 27 estados brasileiros (26 + o Distrito Federal), **em ordem de nome**.
///
/// ## Por que a lista mora no app, e nao no servidor
///
/// Medido em 17/10/2026 contra `api/openapi.yaml`: `Area.state` e
/// `{ type: string, minLength: 2, maxLength: 2 }` -- **sem `enum` e sem
/// `pattern`** --, e o servidor nao tem lista de siglas em lugar nenhum (o
/// unico uso e `upper(state) = upper(?)`, um filtro do diretorio). Nao ha,
/// portanto, uma segunda fonte com que divergir: esta e a unica, e e por isso
/// que ela pode viver aqui sem criar o par de "duas verdades".
///
/// **No dia em que o contrato ganhar um `enum`**, esta lista passa a ser a
/// copia e o lugar certo dela e o contrato -- e este comentario e o aviso.
///
/// ## O rotulo e o nome; o valor e a sigla
///
/// A pessoa escolhe "São Paulo"; o que viaja em `Area.state` continua sendo
/// `SP`. Trocar o valor enviado quebraria o contrato (dois caracteres) e
/// brigaria com o que ja esta gravado.
///
/// A ordem e **alfabetica por nome**, que e como se procura numa lista de 27 —
/// e nao por sigla, que ordenaria "Espírito Santo" antes de "Distrito
/// Federal".
const List<ItemDeLista> estadosBrasileiros = <ItemDeLista>[
  ItemDeLista(codigo: 'AC', rotulo: 'Acre'),
  ItemDeLista(codigo: 'AL', rotulo: 'Alagoas'),
  ItemDeLista(codigo: 'AP', rotulo: 'Amapá'),
  ItemDeLista(codigo: 'AM', rotulo: 'Amazonas'),
  ItemDeLista(codigo: 'BA', rotulo: 'Bahia'),
  ItemDeLista(codigo: 'CE', rotulo: 'Ceará'),
  ItemDeLista(codigo: 'DF', rotulo: 'Distrito Federal'),
  ItemDeLista(codigo: 'ES', rotulo: 'Espírito Santo'),
  ItemDeLista(codigo: 'GO', rotulo: 'Goiás'),
  ItemDeLista(codigo: 'MA', rotulo: 'Maranhão'),
  ItemDeLista(codigo: 'MT', rotulo: 'Mato Grosso'),
  ItemDeLista(codigo: 'MS', rotulo: 'Mato Grosso do Sul'),
  ItemDeLista(codigo: 'MG', rotulo: 'Minas Gerais'),
  ItemDeLista(codigo: 'PA', rotulo: 'Pará'),
  ItemDeLista(codigo: 'PB', rotulo: 'Paraíba'),
  ItemDeLista(codigo: 'PR', rotulo: 'Paraná'),
  ItemDeLista(codigo: 'PE', rotulo: 'Pernambuco'),
  ItemDeLista(codigo: 'PI', rotulo: 'Piauí'),
  ItemDeLista(codigo: 'RJ', rotulo: 'Rio de Janeiro'),
  ItemDeLista(codigo: 'RN', rotulo: 'Rio Grande do Norte'),
  ItemDeLista(codigo: 'RS', rotulo: 'Rio Grande do Sul'),
  ItemDeLista(codigo: 'RO', rotulo: 'Rondônia'),
  ItemDeLista(codigo: 'RR', rotulo: 'Roraima'),
  ItemDeLista(codigo: 'SC', rotulo: 'Santa Catarina'),
  ItemDeLista(codigo: 'SP', rotulo: 'São Paulo'),
  ItemDeLista(codigo: 'SE', rotulo: 'Sergipe'),
  ItemDeLista(codigo: 'TO', rotulo: 'Tocantins'),
];

/// A sigla, quando ela esta entre as 27; **nulo em qualquer outro caso**.
///
/// ## Por que esta funcao existe, e por que ela nao mora em cada tela
///
/// Em 21/10/2026 as tres telas que ainda DIGITAVAM a sigla passaram a escolher
/// na lista (`perdido/tela_onde_e_quando`, `rede/criar_encontro`,
/// `perto/sugerir_profissional`), e as tres recebem sigla de fora para
/// pre-preencher o seletor: da regiao de referencia do tutor
/// (`Me.reference_area.state`), da busca de CEP (o `uf` do ViaCEP) e, numa
/// delas, do rascunho que sobrevive ao app fechar.
///
/// **Nenhuma dessas tres fontes e a lista.** `Me.reference_area.state` e
/// `maxLength: 2` sem `pattern`, o servico de CEP e de terceiro, e o rascunho
/// pode ter sido gravado pela versao de campo digitado -- com `SAO` dentro.
///
/// **O que acontece se a sigla entrar sem passar por aqui e um defeito mudo:**
/// `SeletorDeLista` nao tem opcao para desenhar e mostra o estado inicial
/// ("Escolher na lista"), enquanto o valor sujo continua no estado da tela
/// esperando o envio. A tela pareceria vazia e o corpo nao estaria -- o pior
/// dos dois mundos, porque nem a pessoa nem o portao de contrato veem nada.
///
/// `length == 2` **nao** basta, e era o que as telas faziam antes: `SA`, `XX`
/// e `S.` tem dois caracteres e passam por aquela regua. Quem decide e a
/// lista.
String? siglaDeEstadoValida(String? sigla) {
  if (sigla == null || sigla.isEmpty) return null;
  for (final ItemDeLista estado in estadosBrasileiros) {
    if (estado.codigo == sigla) return sigla;
  }
  return null;
}
