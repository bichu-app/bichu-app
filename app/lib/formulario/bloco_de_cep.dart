/// O BLOCO DE CEP das **seis** telas que o tem, em um lugar so.
///
/// ---------------------------------------------------------------------------
/// POR QUE ESTE ARQUIVO EXISTE, E O QUE A DUPLICACAO ESCONDIA
/// ---------------------------------------------------------------------------
/// Em 30/10/2026 o mesmo bloco estava escrito SEIS vezes:
/// `localizacao/captura_de_localizacao`, `perfil/tela_dados_pessoais`,
/// `perfil/tela_endereco_de_entrega`, `perto/sugerir_profissional`,
/// `pet/tela_solicitar_plaquinha` e `rede/criar_encontro`. Cada copia tinha os
/// tres mesmos campos de estado (`_buscaDoCep`, `_buscandoOCep`,
/// `_cepJaBuscado`), o mesmo `_buscarOCep`, o mesmo `_preencherSeVazio` e a
/// mesma `_linhaDaBusca`.
///
/// **OS NOMES DA LINHA ACIMA SAO CONTRATO, e nao enfeite de prosa.** O portao
/// `app/test/telas/bloco_de_cep_unico_test.dart` reprova quem escrever
/// `_buscarOCep`, `_buscandoOCep`, `_cepJaBuscado` ou `_buscaDoCep` dentro de
/// `app/lib/telas` -- e, porque isso e assercao de AUSENCIA, ele tem controle
/// positivo: cada um dos quatro tem de ser achado em algum lugar de `app/lib`
/// FORA de `app/lib/telas`, e o unico lugar onde eles sobraram e esta prosa.
/// Apagar os quatro nomes daqui nao deixa o portao verde por vazio: derruba o
/// controle positivo, que e o caso que diz que a agulha nao tem erro de
/// digitacao. Reescrever este paragrafo e permitido; apagar os quatro nomes
/// exige mover o controle para outro lugar, de proposito.
///
/// **A repeticao nao era so custo: ela escondia um defeito.** Tres das seis
/// aceitavam uma sigla de estado que NAO EXISTE -- elas conferiam
/// `endereco.uf.length == 2` em vez de chamar [siglaDeEstadoValida], que mora
/// em `api/estados_brasileiros.dart` desde sempre e que as outras tres
/// chamavam. Uma base de CEP que devolvesse `XX` punha `XX` no formulario de
/// dados pessoais, de endereco de entrega e do pedido da plaquinha; nas outras
/// tres, nao punha nada. Com UMA copia a pergunta "esta tela valida a sigla?"
/// deixa de existir.
///
/// ---------------------------------------------------------------------------
/// A FRONTEIRA DE PRIVACIDADE, QUE ESTE ARQUIVO NAO ATRAVESSA
/// ---------------------------------------------------------------------------
/// **O bloco de CEP so faz `CEP -> texto`.** Ele nao le posicao, nao pede
/// permissao e nao conhece o aparelho -- e por isso nao importa
/// `dispositivo/localizacao.dart` nem pacote de geocodificacao.
///
/// A emenda 1 do ADR-0006 (19/10/2026) autorizou UM sentido,
/// `coordenada -> nome de CIDADE`, e **so cidade**: nunca bairro, nunca
/// estado, nunca rua. Esse caminho vive em `captura_de_localizacao`, que o
/// chama pela porta do aparelho e escreve **somente no campo de cidade**.
/// Trazer aquele preenchimento para dentro desta peca, ou dar a esta peca um
/// botao de localizacao, violaria a emenda nas outras cinco telas -- e os
/// botoes de localizacao foram REMOVIDOS de proposito das telas de achado em
/// 29/10/2026. Esta peca nao os tem, e nao e esquecimento.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/busca_de_cep.dart';
import '../api/estados_brasileiros.dart';
import '../formato/cep.dart';
import 'origem_dos_valores.dart';

/// Os formatadores do campo de CEP, iguais nas seis telas.
const List<TextInputFormatter> formatadoresDeCep = <TextInputFormatter>[
  MascaraDeCep(),
];

/// ONDE o endereco que o CEP devolveu aterriza, em cada tela.
///
/// Os NOMES das chaves sao da tela, e nao desta peca: o servidor nomeia
/// `neighborhood` num corpo e `place.neighborhood` noutro, e e a tela que sabe
/// qual dos dois marca o campo dela.
class DestinoDoCep {
  const DestinoDoCep({
    required this.bairro,
    required this.chaveDoBairro,
    required this.cidade,
    required this.chaveDaCidade,
    required this.chaveDoEstado,
    required this.estadoEscolhido,
    required this.aoEscolherEstado,
    this.logradouro,
    this.chaveDoLogradouro,
    this.aoPreencher,
  });

  final TextEditingController bairro;
  final String chaveDoBairro;

  final TextEditingController cidade;
  final String chaveDaCidade;

  /// A RUA, que so existe nas duas telas de entrega (o endereco de entrega do
  /// pet e o pedido da plaquinha). **Nulo nas outras quatro**, que nao pedem
  /// rua -- e por isso a busca nao tem onde por o logradouro nelas.
  final TextEditingController? logradouro;
  final String? chaveDoLogradouro;

  /// O seletor de estado nao e um [TextEditingController], e e por isso que
  /// ele entra como par de funcoes em vez de campo.
  final String chaveDoEstado;
  final String? Function() estadoEscolhido;
  final void Function(String sigla) aoEscolherEstado;

  /// Chamado com a chave de cada campo que a busca PREENCHEU, para a tela
  /// apagar o erro daquele campo. Nulo na tela que nao marca erro por campo.
  final void Function(String chave)? aoPreencher;
}

/// Os tres desfechos da busca, ditos em texto.
///
/// `buscando` e `naoEncontrado` sao os MESMOS nas seis telas, e por isso tem
/// valor padrao aqui. O terceiro tem quatro redacoes diferentes no produto, e
/// trocar a redacao de uma tela e decisao de conteudo, nao de refatoracao:
/// enquanto o cliente nao as unificar, cada tela diz a sua.
class TextosDaBuscaDeCep {
  const TextosDaBuscaDeCep({
    required this.indisponivel,
    this.buscando = 'Buscando o endereço…',
    this.naoEncontrado = 'CEP não encontrado. Preencha abaixo.',
  });

  final String buscando;
  final String naoEncontrado;
  final String indisponivel;
}

/// O MECANISMO do bloco de CEP: o campo, o que a ultima busca devolveu, e a
/// regra de quem recebe o resultado.
class BlocoDeCep {
  BlocoDeCep({
    required this.destino,
    required this.atualizar,
    required this.montado,
    OrigemDosValores? origem,
  }) : origem = origem ?? OrigemDosValores();

  /// Onde o endereco aterriza.
  final DestinoDoCep destino;

  /// O `setState` da tela. A peca nao e um widget com estado proprio de
  /// proposito: o mesmo quadro que mostra o endereco preenchido tambem apaga
  /// os erros da tela, e dois `setState` em sequencia piscariam.
  final void Function(VoidCallback) atualizar;

  /// O `mounted` da tela, lido DEPOIS do `await`.
  final bool Function() montado;

  /// De onde veio o valor de cada campo.
  ///
  /// A tela que ja tem uma passa a dela -- o mecanismo e um so, e o CEP divide
  /// com o resto do formulario. A tela que nao tem recebe uma vazia, e uma
  /// [OrigemDosValores] onde nada foi anotado se comporta EXATAMENTE como a
  /// regra "so campo vazio recebe" que aquelas telas escreviam a mao.
  final OrigemDosValores origem;

  /// O campo de CEP. **E campo de BUSCA**, e em quatro das seis telas o que foi
  /// digitado aqui nao viaja no corpo.
  final TextEditingController cep = TextEditingController();

  /// O que a ultima busca devolveu, so para a linha de texto embaixo do campo.
  ResultadoDaBusca? get resultado => _resultado;
  ResultadoDaBusca? _resultado;

  bool get buscando => _buscando;
  bool _buscando = false;

  /// A linha de desfecho tem o que mostrar?
  bool get temDesfecho => _buscando || _resultado != null;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _jaBuscado = '';

  /// Nenhuma busca aconteceu e nenhum CEP foi dado como ja buscado.
  bool get nenhumaBuscaAinda => _jaBuscado.isEmpty;

  /// O CEP que JA ESTA nos campos, vindo da conta ou do endereco guardado:
  /// abrir a tela com ele preenchido nao dispara busca.
  void naoBuscarDeNovo(String cepGuardado) {
    _jaBuscado = cepParaOContrato(cepGuardado) ?? '';
  }

  /// Esquece a ultima busca -- o que estava nos campos era de OUTRO endereco.
  void esquecerABusca() {
    _jaBuscado = '';
    _resultado = null;
  }

  void dispose() => cep.dispose();

  /// Busca o endereco do CEP e preenche **so o que estiver vazio** (ou o que
  /// ainda carrega valor que a pessoa nao tocou).
  ///
  /// Sai sem fazer nada enquanto o CEP nao tem os oito digitos: e no OITAVO
  /// que a busca dispara, e nao a cada tecla.
  ///
  /// Devolve **verdadeiro so quando o desfecho chegou e foi aplicado** -- e
  /// falso quando nao havia o que buscar, quando era o mesmo CEP de antes ou
  /// quando a tela saiu no meio. A captura de localizacao depende disso para
  /// publicar o `Onde` exatamente nas vezes em que publicava antes.
  Future<bool> buscar(BuscaDeCep porta) async {
    final String? digitos = cepParaOContrato(cep.text);
    if (digitos == null || digitos == _jaBuscado) return false;
    _jaBuscado = digitos;

    atualizar(() {
      _buscando = true;
      _resultado = null;
    });

    final RespostaDaBuscaDeCep resposta = await porta.buscar(digitos);
    if (!montado()) return false;

    atualizar(() {
      _buscando = false;
      _resultado = resposta.resultado;
      final EnderecoDoCep? endereco = resposta.endereco;
      if (endereco == null) return;
      _preencher(
        destino.logradouro,
        destino.chaveDoLogradouro,
        endereco.logradouro,
      );
      _preencher(destino.bairro, destino.chaveDoBairro, endereco.bairro);
      _preencher(destino.cidade, destino.chaveDaCidade, endereco.cidade);
      _escolherOEstado(endereco.uf);
    });
    return true;
  }

  void _preencher(
    TextEditingController? campo,
    String? chave,
    String valor,
  ) {
    if (campo == null || chave == null) return;
    if (!origem.daBusca(campo, valor, chave)) return;
    destino.aoPreencher?.call(chave);
  }

  /// A SIGLA, e **so quando ela e uma das 27**.
  ///
  /// Este `if` e o conserto de 30/10/2026: tres das seis telas punham no
  /// formulario o que a base de CEP mandasse, de duas letras.
  void _escolherOEstado(String ufDaBusca) {
    final String? sigla = siglaDeEstadoValida(ufDaBusca);
    if (sigla == null) return;
    final bool podeVir = origem.podeVirDaBusca(
      destino.chaveDoEstado,
      vazio: destino.estadoEscolhido() == null,
    );
    if (!podeVir) return;
    destino.aoEscolherEstado(sigla);
    origem.soltar(destino.chaveDoEstado);
    destino.aoPreencher?.call(destino.chaveDoEstado);
  }
}

/// A LINHA que conta o que a busca de CEP fez, embaixo do campo.
class LinhaDaBuscaDeCep extends StatelessWidget {
  const LinhaDaBuscaDeCep({
    required this.bloco,
    required this.textos,
    super.key,
    this.estilo,
    this.anunciarEnquantoBusca = false,
  });

  final BlocoDeCep bloco;
  final TextosDaBuscaDeCep textos;
  final TextStyle? estilo;

  /// O `liveRegion` enquanto busca, que hoje so a captura de localizacao usa.
  final bool anunciarEnquantoBusca;

  @override
  Widget build(BuildContext context) {
    if (bloco.buscando) {
      final Widget linha = Text(textos.buscando, style: estilo);
      return anunciarEnquantoBusca
          ? Semantics(liveRegion: true, child: linha)
          : linha;
    }
    final String? texto = switch (bloco.resultado) {
      ResultadoDaBusca.naoEncontrado => textos.naoEncontrado,
      ResultadoDaBusca.indisponivel => textos.indisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: estilo);
  }
}
