/// A microcopy das telas de cadastro de pet.
///
/// **Copiada de `docs/05-ux-research.md`, nao reescrita.** Microcopy e
/// especificacao: cada constante daqui aponta a secao de onde saiu, para que
/// uma divergencia apareca como divergencia e nao como esquecimento.
///
/// As constantes marcadas com `DEDUZIDO` sao a excecao, e elas estao
/// separadas no fim do arquivo de proposito.
library;

abstract final class TextosDoCadastro {
  // -- F1.3, identificacao --------------------------------------------------

  /// Figma `89:48`. O inventario do UX nao escreve titulo para F1.3.
  static const String tituloIdentificacao = 'Quem é o seu pet?';

  static const String rotuloDoNome = 'Nome';

  static const String rotuloDaEspecie = 'Espécie';

  static const String rotuloDoPorte = 'Porte';

  static const String rotuloDoSexo = 'Sexo';

  /// UX F1.3, tabela da microcopy dos dois campos de raca.
  static const String rotuloDaRaca = 'Raça';

  static const String escolherNaLista = 'Escolher na lista';

  /// **A frase que mais trabalha nesta tela.** O medo de quem tem um SRD
  /// diante de uma lista fechada e nao se encontrar nela; dizer que vira-lata
  /// esta na lista, antes de ela abrir, remove isso em sete palavras.
  static const String ajudaDaRaca =
      'A lista é a que o Bichu usa para comparar pets perdidos e achados. '
      'Vira-lata está nela.';

  /// A opcao de saida. **`Outra`, e nao "Outro" nem "Não sei":** concorda com
  /// "raça", que e a palavra do rotulo, e quem cadastra o proprio pet sabe o
  /// que ele e, so nao achou o nome na lista.
  static const String opcaoOutraRaca = 'Outra';

  static const String rotuloDaRacaLivre = 'Qual raça?';

  /// A ajuda diz **onde o texto aparece** e nao diz que ele nao cruza. Foi
  /// escolha do UX: "este campo nao e usado na comparacao" e verdade, e
  /// relevante para nos e e ruido para quem esta cadastrando o proprio
  /// cachorro.
  static String ajudaDaRacaLivre(String nome) {
    final daPessoa = nome.trim();
    if (daPessoa.isEmpty) {
      return 'Escreva do seu jeito. Aparece na ficha e no cartaz.';
    }
    return 'Escreva do seu jeito. Aparece na ficha de $daPessoa e no cartaz.';
  }

  /// Limite de `breed_free_text` no contrato.
  static const int limiteDaRacaLivre = 40;

  /// UX F1.3, erro do campo livre acima do limite.
  static const String racaLivreLonga = 'Cabe até 40 caracteres.';

  /// UX F1.3, `validation-failed` com raca da lista **e** texto livre.
  ///
  /// A mensagem nomeia a raca escolhida em vez de dizer "a raça selecionada":
  /// quem chegou aqui provavelmente escolheu errado e nao percebeu, e ver o
  /// nome e o que faz perceber.
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
  ///
  /// O texto diz "digitar" e não "escolher" de propósito — a lista não está
  /// disponível, e oferecer "escolher" seria prometer o que não há.
  static const String digitarARaca = 'Digitar a raça';

  static const String continuar = 'Continuar';

  // -- F1.4, foto -----------------------------------------------------------

  /// Figma `91:37`.
  static String tituloDaFoto(String nome) {
    final pet = nome.trim();
    return pet.isEmpty ? 'Uma foto do seu pet' : 'Uma foto de $pet';
  }

  /// UX F1.4.
  static const String corpoDaFoto =
      'A foto é o que faz alguém reconhecer seu pet na rua. Escolha uma em que '
      'o rosto apareça bem.';

  /// Figma `91:41`.
  static const String nenhumaFotoAinda = 'Nenhuma foto ainda';

  static const String tirarFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String usarEstaFoto = 'Usar esta foto';

  static const String trocarAFoto = 'Trocar';

  /// UX 12.4, camera negada.
  static const String cameraNegada =
      'O Bichu não tem permissão para usar a câmera.';

  static const String abrirOsAjustes = 'Abrir os ajustes';

  // -- F1.5, sinais ---------------------------------------------------------

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

  /// A ajuda **tem que apontar para o campo de baixo**, e essa e a parte que
  /// nao pode ser cortada por concisao: a lista fechada de duas posicoes
  /// frustra exatamente quem tem o pet mais facil de reconhecer.
  static String ajudaDasCores(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Escolha a cor que mais aparece. Se $pet tiver duas, a segunda vai '
        'no campo de baixo. Manchas, coleira e detalhes vão em Sinais '
        'particulares, logo abaixo.';
  }

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

  static String cuidadosOQueEscrever(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Escreva uma ou duas frases, só o que alguém precisa saber nos '
        'primeiros minutos com $pet. Quem vai ler está de pé na rua, com '
        '$pet no colo e uma mão livre.';
  }

  /// A prevencao de erro que vale mais que qualquer mensagem depois: o motivo
  /// numero um para escrever um telefone ali e achar que precisa de um jeito
  /// de ser contatada.
  static String cuidadosSemTelefone(String nome) {
    final pet = nome.trim().isEmpty ? 'seu pet' : nome.trim();
    return 'Não precisa colocar seu telefone: se alguém encontrar $pet, o '
        'Bichu leva a conversa até você sem mostrar seus dados.';
  }

  static const String exemploDosCuidados =
      'Toma remédio de uso contínuo. É medrosa, não corra atrás.';

  /// Limite de `care_notes` no contrato. **Desenho, e nao economia de banco:**
  /// quem le esta de pe, com uma mao, com o animal se mexendo.
  static const int limiteDosCuidados = 280;

  /// UX F1.5, o RG Animal, escrito em 2026-09-17.
  static const String rotuloDoRgAnimal = 'RG Animal';

  static const String ajudaDoRgAnimal =
      'Número do registro do SinPatinhas. Se você não tem, pule: o Bichu '
      'funciona sem ele. O Bichu só guarda o número — não consulta, não valida '
      'e não altera nada lá.';

  static const String cadastrar = 'Cadastrar';

  // -- F1.6, pet cadastrado -------------------------------------------------

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

  /// UX F1.6, item 6: **a linha que esta tela e obrigada a dizer e que
  /// nenhuma outra diz.**
  ///
  /// Ela e informativa: fica abaixo do codigo, **sem** icone de alerta e
  /// **sem** cor de erro. Nada deu errado.
  static String soAquiPorExtenso(String sufixo) {
    final quatro = sufixo.isEmpty ? '' : ' (…$sufixo)';
    return 'Este é o único lugar onde o código aparece inteiro. Depois desta '
        'tela, o app mostra só os quatro últimos$quatro, para identificar qual '
        'plaquinha é qual. O código por extenso fica impresso no arquivo da '
        'tag, no próximo passo.';
  }

  /// UX F1.6, acessibilidade: confirmacao anunciada em regiao viva. Copiar sem
  /// retorno audivel e copiar sem saber se copiou.
  static const String codigoCopiado = 'Código copiado';

  static const String fazerATag = 'Fazer a tag da coleira';

  static const String depois = 'Depois';

  /// UX F1.6, erro: a tag nao foi emitida. O cadastro **nao** e revertido, e o
  /// texto diz isso na primeira frase, antes de qualquer outra coisa, porque o
  /// medo imediato e ter perdido o cadastro.
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

  /// UX F1.6, a foto ainda subindo. Sem botao: nao ha nada para a pessoa fazer.
  static String fotoAindaSubindo(String nome) {
    final pet = nome.trim().isEmpty ? 'do seu pet' : 'de ${nome.trim()}';
    return 'A foto $pet ainda está sendo enviada. Isso não atrasa o código.';
  }

  /// UX F1.5, o aviso da redacao de `care_notes`, que aparece **aqui**.
  ///
  /// O sujeito e "tiramos", e nao "você escreveu algo proibido": quem agiu
  /// fomos nos, e dizer isso tira a culpa da frase.
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

  // -- DEDUZIDO -------------------------------------------------------------
  //
  // O que segue **nao esta escrito em docs/05-ux-research.md**. Cada frase
  // aplica o padrao de formulario da secao 13 ("o requisito e dito antes do
  // erro") ao rotulo que a tela ja tem, na mesma forma das mensagens de C.2
  // que ja existem no codigo ("Digite seu e-mail.").
  //
  // Elas estao aqui, juntas e marcadas, em vez de espalhadas pelas telas, para
  // que a revisao de UX as encontre num lugar so e as substitua ou aprove. O
  // precedente e C.2: a tela rodou com texto deduzido do contrato, a deducao
  // foi declarada, e o UX escreveu a especificacao depois sem canonizar o que
  // a frente mobile tinha adivinhado.

  /// DEDUZIDO. Nome vazio em F1.3. UX nao escreveu a mensagem de campo
  /// obrigatorio desta tela.
  static const String digiteONome = 'Digite o nome do seu pet.';

  /// DEDUZIDO. Especie nao escolhida em F1.3.
  static const String escolhaAEspecie = 'Escolha a espécie.';

  /// DEDUZIDO. Porte nao escolhido em F1.3.
  static const String escolhaOPorte = 'Escolha o porte.';

  /// DEDUZIDO. O rotulo do campo que a acao `Digitar o código` abre em F2.1.
  ///
  /// Nao e frase nova: e **o mesmo texto do controle que abre o campo**,
  /// escrito em F2.1 e desenhado no Figma. Escolhido assim justamente para nao
  /// coinhar um rotulo ("Código da tag", "Código da plaquinha") que ninguem
  /// revisou.
  static const String digitarOCodigo = 'Digitar o código';

  /// O rotulo da acao de avancar sem foto em F1.4 (BICHUS-157).
  ///
  /// **`Pular`, e nao `Depois`.** [depois] ja existe e e usado em F1.6 para
  /// adiar **a tag da coleira**; reusar a palavra faria dois adiamentos
  /// diferentes se chamarem igual a um passo de distancia no mesmo fluxo.
  ///
  /// A escolha do rotulo e da forma (botao ou texto) e decisao de UX e
  /// **continua aberta** na BICHUS-157 -- a issue nao fixa nenhum dos dois.
  /// `Pular` e o unico dos dois nomes escritos na issue que nao colide, e a
  /// forma e botao porque o criterio 5 exige alvo de toque e a exigencia de
  /// acessibilidade proibe que a acao seja so um link de texto pequeno.
  static const String seguirSemFoto = 'Pular';

  /// O nome acessivel da mesma acao.
  ///
  /// Contem o rotulo visivel (WCAG 2.1 SC 2.5.3, *Label in Name*) e diz o que
  /// a acao faz, que `Pular` sozinho nao diz: quem ouve "Pular, botão" no meio
  /// de um assistente de tres passos nao sabe se pula o passo ou o cadastro.
  static const String seguirSemFotoAnunciado = 'Pular a foto';

  /// DEDUZIDO. BICHUS-158: o quarto estado, `indisponivel`, em F1.4.
  ///
  /// Duas coisas que este texto **nao** pode fazer, e as duas estao escritas
  /// no comentario do proprio `EstadoDaPermissao.indisponivel`: culpar a
  /// pessoa, e mandar aos ajustes do sistema. Nao ha permissao a conceder, e
  /// mandar procurar uma faria a pessoa percorrer os ajustes atras do que nao
  /// existe.
  ///
  /// A ultima frase existe para nao deixar a tela so com a ma noticia: a acao
  /// que sobra e a da BICHUS-157, e ela esta ali do lado.
  static const String cameraNaoEmbarcada =
      'Tirar foto e escolher da galeria ainda não estão disponíveis neste '
      'aplicativo. Não há nada a ajustar no seu aparelho. Você pode seguir '
      'sem foto.';
}
