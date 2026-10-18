/// A regra do **nome de exibicao**, num lugar so.
///
/// Existe por uma queixa do cliente de 18/10/2026: *"o campo de nome no
/// cadastro do usuario e obrigatorio, hoje ele esta cadastrando sem esse
/// campo"*. O campo `Nome` da `F1.1` ja existia e ja aparecia **sem**
/// "(opcional)" no rotulo -- o que faltava era alguem exigindo. A tela mandava
/// `null` quando estava vazio, e o servidor aceitava.
///
/// **A autoridade e o servidor, e nao este arquivo** (`auth-service.ts`,
/// `cadastrar`). A rota de cadastro e publica: a trava que vale e a de la, e
/// esta aqui existe para a pessoa nao gastar uma ida a rede a toa e para a
/// recusa chegar com o nome do campo ao lado do campo.
///
/// Esta classe e a fonte unica das duas perguntas que a tela faz -- "o botao
/// pode estar habilitado?" e "o que eu digo quando recusar?" -- e e por isso
/// que as duas nao tem como divergir.
class NomeDeExibicao {
  const NomeDeExibicao._();

  /// O teto, igual ao `maxLength` de `display_name` no contrato
  /// (`RegisterRequest` e `MeUpdate`, os dois com 80) e ao `LIMITE_DO_NOME` do
  /// `auth-service.ts`.
  static const int limite = 80;

  /// A cobranca do campo vazio.
  ///
  /// **Diz o que fazer, e nao que esta "invalido"** (regra de UX do BICHUS-31,
  /// criterio 3): "invalido" informa a pessoa de que ela errou e nao a ajuda a
  /// sair do lugar. As palavras "erro", "invalido", "falhou" e "ops" nao
  /// aparecem aqui de proposito.
  static const String precisaDoNome = 'Digite o nome que você quer usar no Bichu.';

  /// POR QUE ESTA FRASE NAO E A DE `Meus dados`, E ISSO E DELIBERADO.
  ///
  /// `telas/perfil/tela_dados_pessoais.dart` tem a MESMA forma de regra -- ela
  /// recusa `_nome.text.isNotEmpty && _nome.text.trim().isEmpty`, igual ao
  /// `trim` daqui e ao de `camposPendentesDoPerfil`
  /// (`completude-do-perfil.ts`). O que nao da para reaproveitar e o TEXTO:
  /// lá a frase e *"Escreva o seu nome, ou deixe o campo vazio para
  /// tirá-lo."*, porque naquela tela apagar o nome **e** uma escolha que o
  /// contrato aceita (`MeUpdate.display_name` nao entrou em `required`).
  ///
  /// No cadastro deixar vazio deixou de ser escolha, entao a segunda metade
  /// daquela frase passaria uma instrucao FALSA para quem esta criando a
  /// conta. A regra e a mesma; a saida que a frase oferece e que nao existe
  /// mais aqui.
  ///
  /// **A assimetria entre as duas telas e real e e decisao de produto, nao
  /// descuido deste arquivo**: quem cria a conta agora precisa de nome, e
  /// quem ja tem conta continua podendo apagar o seu em `Meus dados`.
  /// Fechar essa porta mexeria em `MeUpdate` e na tela de outra frente.

  /// A cobranca do nome que passa do teto.
  static const String passouDoLimite =
      'Use no máximo $limite caracteres no nome.';

  /// O nome aparado, ou `null` quando **nao sobra nome depois de aparar**.
  ///
  /// `null` aqui cobre os tres casos de uma vez: ausente, vazio e **so com
  /// espaco em branco**. O terceiro e o que escapava: `"   "` nao e vazio para
  /// `isEmpty`, nao e vazio para o `minLength: 1` do schema, e nao tem nome
  /// nenhum dentro.
  static String? aparar(String? bruto) {
    final String aparado = (bruto ?? '').trim();
    return aparado.isEmpty ? null : aparado;
  }

  /// `true` quando ha nome suficiente para o botao de enviar ficar habilitado.
  static bool completo(String? bruto) => aparar(bruto) != null;

  /// A mensagem de recusa, ou `null` quando o nome passa.
  static String? recusa(String? bruto) {
    final String? nome = aparar(bruto);
    if (nome == null) return precisaDoNome;
    if (nome.length > limite) return passouDoLimite;
    return null;
  }
}
