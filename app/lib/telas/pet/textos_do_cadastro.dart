/// A microcopy das telas de cadastro de pet.
library;

import '../../dispositivo/camera_e_galeria.dart';

abstract final class TextosDoCadastro {

  /// Figma `89:48`. O inventario do UX nao escreve titulo para F1.3.
  static const String tituloIdentificacao = 'Quem é o seu pet?';

  static const String rotuloDoNome = 'Nome';

  static const String rotuloDaEspecie = 'Espécie';

  static const String rotuloDoPorte = 'Porte';

  static const String rotuloDoSexo = 'Sexo';

  /// UX F1.3, tabela da microcopy dos dois campos de raca.
  static const String rotuloDaRaca = 'Raça';

  static const String escolherNaLista = 'Escolher na lista';

  /// A opcao de saida. **`Outra`, e nao "Outro" nem "Não sei":** concorda com
  /// "raça", que e a palavra do rotulo, e quem cadastra o proprio pet sabe o
  /// que ele e, so nao achou o nome na lista.
  static const String opcaoOutraRaca = 'Outra';

  static const String rotuloDaRacaLivre = 'Qual raça?';

  /// Limite de `breed_free_text` no contrato.
  static const int limiteDaRacaLivre = 40;

  /// UX F1.3, erro do campo livre acima do limite.
  static const String racaLivreLonga = 'Cabe até 40 caracteres.';

  /// UX F1.3, `validation-failed` com raca da lista **e** texto livre.
  static String racaLivreComRacaDaLista(String raca) {
    return 'Você escolheu $raca na lista. Para escrever a raça com suas '
        'palavras, troque a lista para Outra.';
  }

  /// UX F1.3, a lista de referencia nao carregou e nao ha cache.
  static String listaDeRacasNaoCarregou(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Não conseguimos carregar a lista de raças agora. Você pode '
        'cadastrar $pet sem ela e escolher a raça depois, em Editar.';
  }

  static const String continuarSemARaca = 'Continuar sem a raça';

  /// A saída do critério 6 de BICHUS-90: sem a lista, a pessoa digita.
  static const String digitarARaca = 'Digitar a raça';

  static const String continuar = 'Continuar';

  /// Figma `91:37`.
  static String tituloDaFoto(String nome) {
    final pet = nome.trim();
    return pet.isEmpty ? 'Uma foto do seu pet' : 'Uma foto de $pet';
  }

  /// A orientacao de tamanho, numa linha (cliente, 17/10/2026).
  static const String orientacaoDaFoto = orientacaoDeTamanhoDaImagem;

  /// Figma `91:41`.
  static const String nenhumaFotoAinda = 'Nenhuma foto ainda';

  /// O rotulo que o leitor de tela anuncia sobre a previa.
  static const String fotoEscolhidaDoPet = 'Foto escolhida do pet';

  static const String tirarFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String usarEstaFoto = 'Usar esta foto';

  static const String trocarAFoto = 'Trocar';

  /// UX 12.4, camera negada.
  static const String cameraNegada =
      'O Bichu não tem permissão para usar a câmera.';

  static const String abrirOsAjustes = 'Abrir os ajustes';

  /// Figma `91:54`.
  static String tituloDosSinais(String nome) {
    final pet = nome.trim();
    return pet.isEmpty ? 'Como reconhecer seu pet' : 'Como reconhecer $pet';
  }

  /// UX F1.5, os rotulos das duas cores, escritos em 2026-09-17.
  static const String rotuloDaCorPrincipal = 'Cor principal';

  /// **`Segunda cor`, e nao `Cor secundária`.** E a palavra que a pessoa usa;
  /// "cor secundaria" e vocabulario de banco de dados.
  static const String rotuloDaSegundaCor = 'Segunda cor (opcional)';

  static const String rotuloDosSinais = 'Sinais particulares';

  /// Figma `91:59` e UX F1.5: exemplo visivel no campo.
  static const String exemploDosSinais =
      'coleira vermelha, mancha branca no peito, rabo curto';

  /// UX F1.5, o bloco de `care_notes`, lido **antes** da digitacao.
  static String rotuloDosCuidados(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Cuidados com $pet';
  }

  static String cuidadosSaoPublicos(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Este texto aparece para quem encontrar $pet. Não existe opção de '
        'deixá-lo privado: o jeito de não publicar é não escrever.';
  }

  /// A prevencao de erro que vale mais que qualquer mensagem depois: o motivo
  /// numero um para escrever um telefone ali e achar que precisa de um jeito de
  /// ser contatada.
  static String cuidadosSemTelefone(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Não precisa colocar seu telefone: se alguém encontrar $pet, o '
        'Bichu leva a conversa até você sem mostrar seus dados.';
  }

  static const String exemploDosCuidados =
      'Toma remédio de uso contínuo. É medrosa, não corra atrás.';

  /// Limite de `care_notes` no contrato.
  static const int limiteDosCuidados = 280;

  /// UX F1.5, o RG Animal, escrito em 2026-09-17.
  static const String rotuloDoRgAnimal = 'RG Animal';

  static const String ajudaDoRgAnimal =
      'Número do registro do SinPatinhas. Se você não tem, pule: o Bichu '
      'funciona sem ele. O Bichu só guarda o número — não consulta, não valida '
      'e não altera nada lá.';

  static const String cadastrar = 'Cadastrar';

  /// UX F1.6, item 1. O Figma diz "A Nina está cadastrada"; o UX reescreveu a
  /// tela inteira em 2026-09-17 e o proprio Figma marca que o texto dele nao
  /// passou por revisao de UX.
  static String tituloPetCadastrado(String nome) {
    final pet = nome.trim().isEmpty ? 'Seu pet' : nome.trim();
    return '$pet está no Bichu.';
  }

  /// UX F1.6, item 4.
  static const String corpoPetCadastrado =
      'Quem escanear este código consegue falar com você. Seu telefone e seu '
      'endereço não aparecem para ninguém, nem para quem escanear.';

  static const String copiarOCodigo = 'Copiar o código';

  /// UX F1.6, item 6: **a linha que esta tela e obrigada a dizer e que nenhuma
  /// outra diz.**
  static String soAquiPorExtenso(String sufixo) {
    final quatro = sufixo.isEmpty ? '' : ' (…$sufixo)';
    return 'Este é o único lugar onde o código aparece inteiro. Depois desta '
        'tela, o app mostra só os quatro últimos$quatro, para identificar qual '
        'plaquinha é qual. O código por extenso fica impresso no arquivo da '
        'tag, no próximo passo.';
  }

  /// Enquanto a imagem esta sendo buscada.
  static const String qrCarregando = 'Preparando a imagem do QR';

  /// A emissao nao trouxe endereco de imagem.
  static const String qrSemImagem =
      'Esta tag não veio com imagem do QR. O código abaixo é o que vale, e '
      'pode ser gravado na plaquinha do mesmo jeito.';

  /// A busca da imagem falhou.
  static const String qrNaoCarregou =
      'Não consegui carregar a imagem do QR. O código abaixo continua valendo, '
      'e dá para tentar de novo.';

  /// UX F1.6, acessibilidade: confirmacao anunciada em regiao viva.
  static const String codigoCopiado = 'Código copiado';

  static const String fazerATag = 'Fazer a tag da coleira';

  static const String depois = 'Depois';

  /// UX F1.6, erro: a tag nao foi emitida.
  static String tagNaoSaiu(String nome) {
    final pet = nome.trim().isEmpty ? 'Seu pet' : nome.trim();
    return '$pet está cadastrado. O código da coleira ainda não ficou pronto.';
  }

  /// UX F1.6, sem conexao.
  static String salvoNesteCelular(String nome) {
    final pet = nome.trim().isEmpty ? 'Seu pet' : nome.trim();
    return '$pet está salvo neste celular. O código da coleira é criado '
        'quando o sinal voltar, e a gente te avisa.';
  }

  /// UX F1.6, a foto ainda subindo.
  static String fotoAindaSubindo(String nome) {
    final pet = nome.trim().isEmpty ? 'do seu pet' : 'de ${nome.trim()}';
    return 'A foto $pet ainda está sendo enviada. Isso não atrasa o código.';
  }

  /// UX F1.6, o envio da foto parou por falta de sinal.
  static String fotoNaoSubiuSemSinal(String nome) {
    final pet = nome.trim().isEmpty ? 'do seu pet' : 'de ${nome.trim()}';
    return 'A foto $pet não subiu: faltou sinal. Ela está salva aqui e sobe '
        'na próxima vez que você abrir o app com internet.';
  }

  /// UX F1.6, o envio da foto foi recusado.
  static String fotoNaoSubiuRecusada(String nome) {
    final pet = nome.trim().isEmpty ? 'do seu pet' : 'de ${nome.trim()}';
    return 'Não consegui enviar a foto $pet. O cadastro está salvo, e dá para '
        'escolher outra foto em Editar.';
  }

  /// O rotulo do unico movimento que resolve a falta de sinal.
  static const String tentarEnviarAgora = 'Tentar agora';

  /// UX F1.5, o aviso da redacao de `care_notes`, que aparece **aqui**.
  static String redacaoDeCuidados(List<String> retirados, String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    final lista = retirados.length == 1
        ? retirados.single
        : '${retirados.sublist(0, retirados.length - 1).join(', ')} e '
            '${retirados.last}';
    return 'Tiramos $lista que você escreveu. Esta parte é pública, então a '
        'gente não guarda telefone, e-mail, endereço nem link aqui. Se alguém '
        'encontrar $pet, o Bichu leva a conversa até você sem mostrar seus '
        'dados. O resto do que você escreveu foi salvo.';
  }

  static const String entendi = 'Entendi';

  /// DEDUZIDO. Nome vazio em F1.3.
  static const String digiteONome = 'Digite o nome do seu pet.';

  /// DEDUZIDO. Especie nao escolhida em F1.3.
  static const String escolhaAEspecie = 'Escolha a espécie.';

  /// DEDUZIDO. Porte nao escolhido em F1.3.
  static const String escolhaOPorte = 'Escolha o porte.';

  /// DEDUZIDO. O rotulo do campo que a acao `Digitar o código` abre em F2.1.
  static const String digitarOCodigo = 'Digitar o código';

  /// O rotulo da acao de avancar sem foto em F1.4 (BICHUS-157).
  static const String seguirSemFoto = 'Pular';

  /// O nome acessivel da mesma acao.
  static const String seguirSemFotoAnunciado = 'Pular a foto';

  /// DEDUZIDO. BICHUS-158: o quarto estado, `indisponivel`, em F1.4.
  static const String cameraNaoEmbarcada =
      'Tirar foto e escolher da galeria ainda não estão disponíveis neste '
      'aplicativo. Não há nada a ajustar no seu aparelho. Você pode seguir '
      'sem foto.';
}
