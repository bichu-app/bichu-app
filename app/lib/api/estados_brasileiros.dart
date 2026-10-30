import '../widgets/seletor_de_lista.dart';

/// Os 27 estados brasileiros (26 + o Distrito Federal), **em ordem de nome**.
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
String? siglaDeEstadoValida(String? sigla) {
  if (sigla == null || sigla.isEmpty) return null;
  for (final ItemDeLista estado in estadosBrasileiros) {
    if (estado.codigo == sigla) return sigla;
  }
  return null;
}
