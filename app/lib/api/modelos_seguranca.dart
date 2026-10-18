/// AS TRES LISTAS FECHADAS DE MOTIVO, no vocabulario do contrato e no da tela.
///
/// **Sem campo de texto livre de motivo**, nos tres. Campo livre vira desabafo e
/// nao se tria, e uma fila que nao se tria e uma fila que ninguem trabalha. O
/// `relato` existe, e opcional, e **nao e o motivo**: e contexto sobre o motivo
/// que a pessoa ja escolheu.
///
/// ## Por que TRES listas, e nao uma
///
/// Porque as tres superficies falam de coisas diferentes, e misturar ofereceria
/// motivos impossiveis: *nudez* e *maus-tratos* sao de IMAGEM, *nao e quem diz
/// ser* e de PERFIL, e *informacao falsa sobre um pet perdido* e de PUBLICACAO.
///
/// A ultima e a que so existe neste produto, e e por isso que ela nao cabia em
/// "outro motivo": **um avistamento inventado manda a pessoa para o bairro
/// errado e custa horas de busca**. Em "outro" ela chegaria a fila sem dizer
/// que e urgente.
///
/// ## A ORDEM DA LISTA E A DA TELA, e ela nao e alfabetica
///
/// Os motivos mais graves vem primeiro, porque a lista e lida de cima para
/// baixo por alguem que esta desconfortavel. "Outro motivo" e sempre o ultimo:
/// primeiro item fechado faz dele o caminho mais barato, e a fila receberia
/// "outro" para tudo.
library;

/// Um motivo: o valor que vai ao contrato e o rotulo que a pessoa le.
class MotivoDeDenuncia {
  const MotivoDeDenuncia(this.valor, this.rotulo);

  /// O valor de `reason` no contrato. **Nunca traduzido**: os quatro clientes
  /// usam os mesmos valores, por regra da casa.
  final String valor;

  /// O que a pessoa le. Frase curta, sem jargao e sem acusacao embutida.
  final String rotulo;
}

/// Denuncia de PERFIL: cinco. Sobre quem a pessoa e.
const List<MotivoDeDenuncia> motivosDePerfil = <MotivoDeDenuncia>[
  MotivoDeDenuncia('minor_suspected', 'Parece ser menor de 16 anos'),
  MotivoDeDenuncia('pet_ransom_scam', 'Golpe ou cobrança para devolver um pet'),
  MotivoDeDenuncia('harassment', 'Está incomodando ou ameaçando'),
  MotivoDeDenuncia('impersonation', 'Não é quem diz ser'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// Denuncia de FOTO: seis. As duas exclusivas sao de imagem.
const List<MotivoDeDenuncia> motivosDeFoto = <MotivoDeDenuncia>[
  MotivoDeDenuncia('child_at_risk', 'Criança em situação de risco'),
  MotivoDeDenuncia('animal_violence', 'Violência ou maus-tratos a animal'),
  MotivoDeDenuncia('nudity_or_sexual', 'Nudez ou conteúdo sexual'),
  MotivoDeDenuncia('i_am_in_it', 'Apareço nesta foto e não autorizei'),
  MotivoDeDenuncia('impersonation', 'Não é quem diz ser'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// Denuncia de PUBLICACAO: cinco, e a terceira e so deste produto.
const List<MotivoDeDenuncia> motivosDePublicacao = <MotivoDeDenuncia>[
  MotivoDeDenuncia('false_lost_pet_info', 'Informação falsa sobre um pet perdido'),
  MotivoDeDenuncia('scam_or_animal_sale', 'Golpe, cobrança ou venda de animal'),
  MotivoDeDenuncia('offensive_or_discriminatory', 'Ofensa ou discriminação'),
  MotivoDeDenuncia('spam_or_repetition', 'Propaganda ou repetição'),
  MotivoDeDenuncia('other', 'Outro motivo'),
];

/// O que se denuncia. Tres alvos, tres listas, tres rotas.
///
/// Local: escolha DA TELA sobre qual folha abrir, decidida no aparelho. **Nao
/// espelha lista fechada nenhuma do contrato**, e nao poderia: o contrato nao
/// tem campo de alvo -- o alvo e a ROTA (`reportUserProfile`, `reportPhoto`,
/// `reportPublication`), e o que viaja no corpo e so `reason`. Quem espelha o
/// contrato aqui sao as tres listas de motivo acima, cada uma contra o `enum` de
/// `reason` do seu `...ReportInput`.
enum AlvoDaDenuncia {
  perfil,
  foto,
  publicacao;

  List<MotivoDeDenuncia> get motivos {
    switch (this) {
      case AlvoDaDenuncia.perfil:
        return motivosDePerfil;
      case AlvoDaDenuncia.foto:
        return motivosDeFoto;
      case AlvoDaDenuncia.publicacao:
        return motivosDePublicacao;
    }
  }

  /// O titulo da folha. Diz O QUE esta sendo denunciado, e nao quem.
  String get titulo {
    switch (this) {
      case AlvoDaDenuncia.perfil:
        return 'Denunciar este perfil';
      case AlvoDaDenuncia.foto:
        return 'Denunciar esta foto';
      case AlvoDaDenuncia.publicacao:
        return 'Denunciar esta publicação';
    }
  }
}

/// **A FRASE QUE FAZ DENUNCIAR PARECER SEGURO**, e ela aparece ANTES do envio.
///
/// Antes e nao depois: quem esta decidindo se denuncia precisa saber que a
/// outra pessoa nao e avisada *enquanto decide*. Depois do envio ela seria um
/// alivio; antes, ela e o que faz a pessoa conseguir tocar no botao.
const String oOutroNaoEAvisado = 'A outra pessoa não fica sabendo que você denunciou.';

/// O que a tela diz depois do envio.
///
/// **Sem prazo**, e a ausencia e deliberada: nao existe prazo, e prometer um
/// seria mentir sobre o que o produto tem. O que a frase promete e o que
/// acontece de verdade e na hora -- a ocultacao imediata.
const String denunciaRecebida = 'Denúncia enviada. Você não vai mais ver este conteúdo.';

/// O rotulo do item desabilitado, depois de denunciar.
///
/// E ele que impede a mesma pessoa de denunciar cinco vezes -- e impede pela
/// TELA, que e onde isso custa menos: o servidor tambem soma em vez de
/// duplicar, mas um menu que continuasse oferecendo "Denunciar" faria a pessoa
/// achar que a primeira nao foi.
const String denunciaJaEnviada = 'Denúncia enviada';
