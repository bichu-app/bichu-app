import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/convites_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../formato/quando.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/qr_do_convite.dart';
import '../casca_com_abas.dart';

/// `Convide tutores` — a tela de trazer gente para o Bichu.
///
/// ## O NOME, E POR QUE NÃO É "INDICAÇÃO"
///
/// **"Indicação" já significa outra coisa neste produto**, e a colisão seria na
/// mesma gaveta: `telas/perto/minhas_indicacoes.dart` é **indicar
/// profissional** ao diretório da comunidade, com rótulos que já estão no ar —
/// `Minhas indicações`, `Indicar quem atende bem`, `Em análise`, `Aprovada` —
/// e rotas próprias em `/rede/indicacoes`. Duas funções diferentes com a mesma
/// palavra fazem a pessoa abrir a errada e concluir que o produto está quebrado.
///
/// `Convide tutores` diz **quem** se convida, que é o que separa esta tela de
/// `Convidar um profissional` da `Rede`. A UX 27.5.5 tinha a linha
/// `Convidar vizinhos` reservada e `planejada`; o rótulo que entrou é o que o
/// cliente escreveu em 21/10/2026, e "tutores" é mais exato — o que o produto
/// quer é quem tem pet, e não quem mora perto.
///
/// ## A TELA MORA NO PERFIL (decisão dele, 22/10 e 26/10/2026)
///
/// **ELA MOROU NO AuAu ATÉ 26/10/2026, e a decisão que a punha lá era dele
/// também.** As três datas ficam escritas juntas de propósito, porque a
/// primeira contradiz as outras duas e é a mais nova que vale:
///
/// - **21/10/2026**: *"no AuAu como tela empilhada, nao no Perfil"*. Foi o que
///   pôs a porta no topo do corpo do AuAu e este endereço sob `/mensagens`.
/// - **22/10/2026**: *"Mova o convite tutores para a pagina do perfil"*.
/// - **26/10/2026**, com a outra metade dita: *"retirar o convite tutores das
///   mensagens, deixar apenas na menu do perfil do usuário"*.
///
/// Hoje ela é tela **empilhada** sob `/perfil/convide-tutores`, aberta por um
/// `ItemDeMenu` do grupo `Comunidade` do menu do Perfil (`AbaPerfil`, em
/// `telas/abas.dart`). **Não há porta no AuAu**, e uma isca reprova se ela
/// voltar: `o convite NAO esta no corpo do AuAu`, em
/// `test/telas/convite_tutores_no_perfil_test.dart`.
///
/// `slotDaRota` deixou de fazer parte do raciocínio, e a prosa antiga daqui o
/// usava: esta tela está em `telasInternas` do portão de barra fixa, ou seja
/// **não mostra barra de baixo nenhuma**. Não há slot para acender, e nunca
/// houve — o primeiro segmento do endereço não muda nada do que a pessoa vê.
///
/// **O pedido de dividir o menu do Perfil por tópicos (21/10) foi atendido
/// antes desta linha, e não por ela**: `AbaPerfil` já é dividido em `Conta`,
/// `Pets na rua` e `Comunidade`, e a porta entrou DENTRO de um grupo. O que
/// não é dividido por tópicos é o inventário de `gaveta_de_secoes.dart`, que
/// é uma lista plana e está oculto desde 19/10.
///
/// ## O QUE A TELA TEM, E A ORDEM É A DO PROTÓTIPO
///
/// 1. **quem você trouxe** — o reconhecimento, e hoje o estado "ninguém ainda";
/// 2. **o seu convite** — o QR, o prazo, e trocar.
///
/// ## NÃO HÁ PRÊMIO MATERIAL, e a decisão tem conta
///
/// O rascunho oferecia a plaquinha da coleira ao terceiro convite. **A
/// plaquinha já é de graça**: não há cobrança por ela em lugar nenhum do
/// produto, então "convide 3 e ganhe a plaquinha" não entregaria nada — e uma
/// recompensa que não é recompensa é pior que nenhuma, porque ensina a pessoa a
/// não acreditar na próxima.
///
/// O que fica é **contador e reconhecimento**. E [TrilhaDeConvites] está
/// escrita para receber um prêmio depois **sem redesenho**: ela recebe os
/// marcos e o que cada um entrega, e hoje o que cada um entrega é uma palavra.
///
/// ## O CONTADOR VEM DO SERVIDOR, E A REGRA MORA SÓ LÁ
///
/// `invited_joined_count`, em `getMyConnectionSummary` — a operação que esta
/// tela já tinha motivo para ler. **A regra são dois sinais**, e os dois estão
/// na cláusula `WHERE` do servidor: conexão **aceita** nascida de um convite
/// desta conta, **e** a pessoa com ao menos um pet de foto `ready`. O segundo é
/// o freio anti-abuso, e é o mesmo sinal que a vitrine já usa.
///
/// **O app não reproduz a regra**, e isso não é economia: dois clientes com a
/// própria cópia contariam diferente, e o número que a pessoa vê passaria a
/// depender de qual aplicativo ela abriu.
///
/// **E não é contagem de usos do convite.** `ConnectionInviteIssued` recusa
/// aquela por escrito — *"seria a lista de quem viu o perfil de alguém,
/// reduzida a um número"* —, e as duas são coisas diferentes: quantos ABRIRAM o
/// link é informação sobre quem olhou um perfil; quantos viraram conexão aceita
/// com pet cadastrado é informação sobre a própria rede de quem pergunta.
///
/// **A falha de leitura não vira zero.** Nulo é "não consegui perguntar" e zero
/// é "ninguém ainda", e os dois desenham telas diferentes — dizer "Ninguém
/// ainda" sobre uma pergunta que não foi respondida é afirmar o que ninguém
/// disse.
///
/// ## NÃO HÁ "EM ANDAMENTO", e a ausência é do contrato e não de escopo
///
/// O rascunho tinha um bloco dizendo *"mais 3 pessoas abriram seu perfil e
/// ainda não cadastraram um pet"*. Ele **não pode existir**: "quem abriu o meu
/// perfil pelo meu convite" é exatamente a lista que o contrato se recusa a
/// contar, e o número é a mesma informação com outro nome.
///
/// ## E NÃO HÁ "COMPARTILHAR O MEU PERFIL" — a ausência é desenhada
///
/// **MEDIDO, de fora, em 21/10/2026**, e são quatro medições independentes:
///
/// 1. **não existe página de pessoa no site.** `web/src/pages/` não tem pasta
///    `pessoa/`, e o quadro das oito páginas públicas do ADR-0017 não tem uma
///    para pessoa — `/@{slug}` é de **pet**;
/// 2. **`getPersonProfile` exige conta** (`bearerAuth` sem alternativa vazia):
///    um estranho que recebesse o link não teria o que ver nem com página;
/// 3. **o app não abre por link.** `AndroidManifest.xml` tem um
///    `intent-filter`, MAIN/LAUNCHER, e o `assetlinks.json` da borda está com a
///    lista vazia;
/// 4. **`site_page_availability` não tem a linha.** O `CHECK` da migração
///    `20261020000010` fecha o domínio em `lost_case` e `poster`, e é essa
///    tabela que acende a ação de compartilhar **sem APK novo** — a condição que
///    o cliente pôs quando decidiu *"desenvolve a sua parte e criamos a versão
///    web depois"*.
///
/// **A ausência é o desenho, e não um botão desabilitado**: o critério 2 da
/// BICHUS-62 proíbe renderizar ação sem destino *nem habilitada nem
/// desabilitada*. E não há faixa explicando a falta, porque uma frase sobre uma
/// função que não existe é exatamente o texto de apoio que o cliente mandou
/// remover das telas em 18/10.
///
/// **O que acende isto no dia em que a página subir** está escrito aqui para
/// quem vier: uma linha `person_profile` naquele `CHECK`, e o endereço saindo no
/// corpo da resposta — como `share_url` já faz no caso de perdido, onde é a
/// **ausência do campo** que esconde a ação.
class TelaDeConvidarTutores extends StatefulWidget {
  const TelaDeConvidarTutores({
    required this.convites,
    required this.conexoes,
    super.key,
  });

  final ConvitesApi convites;

  /// A porta do resumo, de onde sai o contador desta tela.
  ///
  /// Entra por parâmetro e não sai do `Escopo` aqui dentro, como em
  /// `TelaDePerfilDePessoa`: é isto que permite montar a tela num teste de
  /// widget sem construir as vinte e nove dependências do escopo.
  final ConexoesApi conexoes;

  /// O título, e o rótulo da porta que leva até aqui. **Uma constante para os
  /// dois**: quem procura a função pelo nome do menu precisa ver o mesmo nome
  /// na barra da tela que abriu.
  static const String titulo = 'Convide tutores';

  static const String tituloDoPlacar = 'Quem você trouxe para o Bichu';

  static const String tituloSemNinguem = 'Ninguém ainda';

  /// A explicação do vazio. **Uma frase**, e ela diz o que fazer agora.
  static const String explicacaoSemNinguem =
      'Mostre o seu QR para quem tem pet. Quem aceitar a conexão aparece aqui.';

  static const String tituloDoConvite = 'Meu QR de convite';

  /// **O QR É APP-PARA-APP, e a tela diz isso em voz alta** (decisão de
  /// 21/10/2026).
  ///
  /// Sem esta frase a pessoa aponta a câmera comum do celular para o quadrado,
  /// não acontece nada que ela reconheça, e ela conclui que o recurso está
  /// quebrado. E a frase não é consolo: ela é **a instrução** — o que faz o
  /// convite funcionar é a outra pessoa abrir o Bichu e escanear de dentro
  /// dele.
  ///
  /// **MEDIDO, e é por isso que não há alternativa hoje:** não existe página de
  /// convite no site (`web/src/pages/` não tem uma, e `/c/` já é da conversa do
  /// achador, ADR-0017), o app não tem `WEB_BASE_URL`, o manifesto tem um único
  /// `intent-filter` (MAIN/LAUNCHER) com `assetlinks.json` vazio, e o contrato
  /// recusa montar o endereço (*"quem os monta é a tela"*). Um QR com URL seria
  /// um QR que a câmera comum abre num 404 — e o 404 deste site serve um cartão
  /// que diz `Esta página não existe no site do Bichu`.
  ///
  /// **Para quem não tem o Bichu, nada funciona hoje, e a tela não promete que
  /// funciona.** Essa limitação é conhecida e foi levada ao cliente.
  static const String oQrEDeAppParaApp =
      'Peça para o usuário abrir o Bichu e escanear daqui. A câmera comum do '
      'celular não abre este código.';

  /// A ação de emitir, para quem ainda não tem convite nesta sessão.
  static const String criarOConvite = 'Criar o meu QR de convite';

  /// ## `Trocar o meu QR` e `Apagar o meu QR` FORAM TIRADAS, e a ausência é a
  /// decisão
  ///
  /// **Pedido do cliente, 22/10/2026, literal:** *"O usuário não gera o
  /// qr-code dele… não deve ter a ação de trocar o qr-code dele ou de
  /// apagar."* Ele repetiu em 26/10 que as ações continuavam no aparelho.
  ///
  /// Esta tela tinha as DUAS, e eram os dois únicos controles de QR do app que
  /// o tutor podia acionar sobre o SEU próprio código:
  ///
  ///   - `Trocar o meu QR` (`BotaoSecundario` -> `_emitir()`), que reemitia e
  ///     com isso revogava o anterior;
  ///   - `Apagar o meu QR` (`BotaoSecundario` -> `_apagar()` ->
  ///     `ConvitesApi.revogar`, `revokeConnectionInvite`).
  ///
  /// As duas saíram, com os avisos que as acompanhavam. **Saiu a PORTA, e não
  /// a capacidade:** `ConvitesApi.revogar` continua em
  /// `api/convites_api.dart` e `revokeConnectionInvite` continua em
  /// `api/openapi.yaml`, intocados — as decisões do cliente de 17/10
  /// (*"apenas desabilite na plataforma"*) e de 26/10 (*"não apague nada,
  /// mantenha e corrija a política"*) mandam não arrancar capacidade de
  /// servidor para resolver um pedido de tela, e mexer no contrato tem portão
  /// de compatibilidade.
  ///
  /// **`Criar o meu QR de convite` FICOU, e isso é uma ressalva PARADA no
  /// cliente, não um descuido.**
  ///
  /// Em 26/10 ele deu a metade positiva da regra: *"o usuário não deve criar o
  /// qr-code, ele deve ser criado **automaticamente** quando o usuário se
  /// cadastrar ou ele cadastrar seu pet"*. Para o QR DO PET isso já é verdade
  /// e não há ação de criar (`TelaPetCadastrado` emite em
  /// `didChangeDependencies`, sem toque). **Para o QR DA PESSOA, que é este,
  /// hoje não é alcançável sem mexer no contrato**, e isto foi MEDIDO em
  /// `api/openapi.yaml` e não lido de comentário — as operações de convite são
  /// três, e só três:
  ///
  ///   - `issueConnectionInvite` (emitir, linha 7268);
  ///   - `revokeConnectionInvite` (revogar, linha 7343);
  ///   - `resolveConnectionInvite` (linha 7378), que é o lado de QUEM
  ///     ESCANEIA — resolve um token lido, e não lê o seu.
  ///
  /// **Não existe operação de LEITURA do próprio convite.** O token em claro
  /// existe uma única vez, na resposta da emissão, porque o banco guarda só o
  /// SHA-256 (ver [oQrNaoVoltaDepois]). Então, sem `Criar`, esta tela não
  /// teria QR nenhum para mostrar; e emitir sozinha na abertura revogaria o
  /// convite anterior a cada visita — exatamente o dano que `Trocar` causava,
  /// agora sem ninguém ter pedido.
  ///
  /// **Os dois caminhos que resolveriam passam pelo `openapi.yaml`**, que tem
  /// portão de compatibilidade: (1) uma rota nova de leitura do próprio
  /// convite; ou (2) o servidor emitir um convite no cadastro da conta e
  /// `issueConnectionInvite` passar a devolver o vigente em vez de trocá-lo —
  /// que muda a semântica da operação de hoje. **Qual dos dois é decisão do
  /// cliente**, e a ação de criar fica até ele decidir.
  ///
  /// **OS RÓTULOS DELAS NÃO FICARAM COMO CONSTANTE MORTA**, e isso é de
  /// propósito: constante de rótulo sobrando é um `BotaoSecundario` de
  /// distância de o controle voltar, e voltaria sem nenhum texto novo no
  /// arquivo. Religá-las exige escrever o rótulo de novo — mudança visível em
  /// revisão, que é o que a isca
  /// `app/test/telas/sem_acao_de_qr_do_usuario_test.dart` cobra.
  static const String apagado = 'Você não tem QR de convite valendo agora.';

  /// **O QR não é lido de volta, e por isso ele não sobrevive a fechar a
  /// tela.**
  ///
  /// Não existe operação de leitura do próprio convite: o token em claro existe
  /// uma vez, na resposta da emissão, porque o banco guarda só o SHA-256. Quem
  /// volta a esta tela emite outro — e emitir revoga o anterior, que é o que
  /// esta frase precisa dizer antes de alguém tocar e se surpreender.
  static const String oQrNaoVoltaDepois =
      'O QR aparece aqui enquanto esta tela estiver aberta. Ao voltar, toque em '
      'criar de novo — o anterior deixa de valer.';

  /// O prazo em palavras. **`QuandoNaLista.diaEMes` e nao uma data crua**: o
  /// convite vale 30 dias, entao dia e mes bastam e `20/11/2026` num cartao de
  /// reconhecimento le como numero de protocolo.
  static String valeAte(DateTime quando) =>
      'Vale até ${QuandoNaLista.diaEMes(quando)}.';

  @override
  State<TelaDeConvidarTutores> createState() => _EstadoDeConvidarTutores();
}

class _EstadoDeConvidarTutores extends State<TelaDeConvidarTutores> {
  ConviteEmitido? _convite;
  bool _emitindo = false;
  String? _falha;

  /// Quantas pessoas a conta trouxe, ou **nulo quando ninguém contou**.
  ///
  /// Nulo e zero são coisas diferentes, e a tela depende disso: zero é a
  /// afirmação do servidor de que ninguém entrou ainda; nulo é a ausência de
  /// afirmação. Ver o cabeçalho.
  int? _placar;

  bool _lendoOPlacar = true;

  @override
  void initState() {
    super.initState();
    unawaited(_lerOPlacar());
  }

  /// Lê `getMyConnectionSummary` e guarda só o número desta tela.
  ///
  /// **A falha deixa [_placar] nulo e NÃO desenha faixa**: o placar é
  /// reconhecimento, não é o que a pessoa veio fazer aqui — ela veio pegar o
  /// QR. Uma faixa vermelha no topo culparia o convite por uma leitura
  /// auxiliar, e o bloco do QR continua inteiro sem ela.
  Future<void> _lerOPlacar() async {
    try {
      final resumo = await widget.conexoes.resumo();
      if (!mounted) return;
      setState(() {
        _placar = resumo.invitedJoinedCount;
        _lendoOPlacar = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _placar = null;
        _lendoOPlacar = false;
      });
    }
  }

  Future<void> _emitir() async {
    if (_emitindo) return;
    setState(() {
      _emitindo = true;
      _falha = null;
    });
    try {
      final convite = await widget.convites.emitir();
      if (!mounted) return;
      setState(() {
        _convite = convite;
        _emitindo = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _falha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(TelaDeConvidarTutores.titulo)),
      body: SafeArea(
        child: ListView(
          // Sem índices semânticos: com eles o corpo inteiro vira um nó
          // anunciado como botão. Mesma razão da tela de minhas indicações.
          addSemanticIndexes: false,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            ..._placarDoReconhecimento(),
            const SizedBox(height: BichuEspaco.e6),
            ..._blocoDoConvite(),
            // **Nada depois daqui.** Ver o cabeçalho: a ação de compartilhar o
            // perfil não é desenhada, e a ausência é o desenho.
          ],
        ),
      ),
    );
  }

  /// O bloco do reconhecimento, em **três** estados — e o terceiro é o que
  /// separa "ninguém ainda" de "não consegui perguntar".
  List<Widget> _placarDoReconhecimento() {
    // **ENQUANTO A LEITURA NÃO VOLTOU, nada é afirmado.** Sem isto o bloco
    // piscaria "Ninguém ainda" por um quadro para quem trouxe dez pessoas.
    if (_lendoOPlacar) {
      return const <Widget>[
        Center(
          child: Padding(
            padding: EdgeInsets.all(BichuEspaco.e6),
            child: CircularProgressIndicator(),
          ),
        ),
      ];
    }
    final quantos = _placar;
    // **NULO NÃO VIRA "NINGUÉM AINDA".** O bloco inteiro sai da tela: dizer que
    // ninguém entrou é uma afirmação, e o servidor não a fez. O que a pessoa
    // veio fazer aqui -- pegar o QR -- continua logo abaixo.
    if (quantos == null) return const <Widget>[];
    if (quantos == 0) {
      return const <Widget>[
        EstadoVazio(
          titulo: TelaDeConvidarTutores.tituloSemNinguem,
          explicacao: TelaDeConvidarTutores.explicacaoSemNinguem,
        ),
      ];
    }
    return <Widget>[
      Text(
        TelaDeConvidarTutores.tituloDoPlacar,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: BichuEspaco.e4),
      TrilhaDeConvites(quantos: quantos),
    ];
  }

  List<Widget> _blocoDoConvite() {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final convite = _convite;
    final falha = _falha;

    return <Widget>[
      Text(TelaDeConvidarTutores.tituloDoConvite, style: textos.titleLarge),
      const SizedBox(height: BichuEspaco.e4),
      if (falha != null) ...<Widget>[
        FaixaDeAviso(texto: falha),
        const SizedBox(height: BichuEspaco.e4),
      ],
      if (convite == null) ...<Widget>[
        Text(
          TelaDeConvidarTutores.apagado,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BotaoPrimario(
          rotulo: TelaDeConvidarTutores.criarOConvite,
          icone: Icons.qr_code_2_outlined,
          carregando: _emitindo,
          aoTocar: () => unawaited(_emitir()),
        ),
      ] else ...<Widget>[
        Center(child: QrDoConvite(token: convite.inviteToken)),
        const SizedBox(height: BichuEspaco.e4),
        // **A INSTRUÇÃO VEM ANTES DO PRAZO**, e a ordem é escolhida: o prazo é
        // sobre o convite, e esta frase é sobre o que a pessoa precisa fazer
        // AGORA para ele funcionar. Ver `oQrEDeAppParaApp`.
        Text(
          TelaDeConvidarTutores.oQrEDeAppParaApp,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TelaDeConvidarTutores.valeAte(convite.expiresAt),
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          TelaDeConvidarTutores.oQrNaoVoltaDepois,
          style: textos.bodySmall?.copyWith(color: cores.textMuted),
        ),
        // **NADA DEPOIS DO QR, e a ausência é o desenho.** `Trocar o meu QR` e
        // `Apagar o meu QR` ficavam aqui, cada uma com o seu aviso, e as duas
        // saíram pelo pedido de 22/10. Ver [TelaDeConvidarTutores.apagado].
      ],
    ];
  }
}

/// A trilha de progresso de quem convida — **desenhada para receber prêmio
/// depois, sem redesenho**.
///
/// ## O que ela entrega hoje é reconhecimento, e isso é decisão
///
/// Não há prêmio material: a plaquinha da coleira, que era o candidato óbvio,
/// **já é de graça** no produto, e "convide 3 e ganhe a plaquinha" não
/// entregaria nada. Então cada marco entrega uma palavra.
///
/// ## Por que a forma já serve para prêmio
///
/// [marcos] é uma lista de pares `quantos -> o que acontece lá`. Trocar a
/// palavra de um marco por um prêmio é trocar o texto daquele par — não há
/// nada nesta classe que suponha que o marco é simbólico: a trilha não sabe o
/// que ela entrega, só em que número entrega. Quando o prêmio existir, quem o
/// decidir mexe na lista e em mais nada.
///
/// **E é por isso que ela recebe `quantos` por parâmetro e não lê nada.** O
/// número não existe no contrato ainda (ver `TelaDeConvidarTutores`), e uma
/// trilha que fosse buscar o próprio número teria de ser reescrita no dia em
/// que a rota chegasse.
class TrilhaDeConvites extends StatelessWidget {
  const TrilhaDeConvites({required this.quantos, super.key, this.marcos = padrao});

  /// Quantas pessoas a conta trouxe, pela regra decidida: **conexão aceita E a
  /// pessoa com ao menos um pet com foto `ready`**.
  ///
  /// Os dois sinais juntos são também o freio anti-abuso: uma conta criada à
  /// toa não tem pet com foto aprovada, e por isso não conta.
  final int quantos;

  /// Os marcos, em ordem crescente. `(quantos, o que acontece)`.
  final List<MarcoDeConvite> marcos;

  /// Os marcos de hoje: **reconhecimento, e nenhum prêmio material**.
  static const List<MarcoDeConvite> padrao = <MarcoDeConvite>[
    MarcoDeConvite(1, 'O primeiro vizinho'),
    MarcoDeConvite(3, 'Três olhos a mais'),
    MarcoDeConvite(10, 'Dez na vizinhança'),
  ];

  static String quantosEmPalavras(int quantos) {
    if (quantos == 1) {
      return '1 tutor entrou no Bichu com o seu convite e já cadastrou um pet.';
    }
    return '$quantos tutores entraram no Bichu com o seu convite e já '
        'cadastraram um pet.';
  }

  /// O que falta para o próximo marco, ou **nulo quando não falta nada** —
  /// porque todos foram alcançados.
  ///
  /// Nulo e não "0 para o próximo": quem chegou ao fim da trilha não está a
  /// zero de nada, e uma frase de progresso ali seria um progresso que não
  /// existe.
  MarcoDeConvite? get proximo {
    for (final marco in marcos) {
      if (quantos < marco.quantos) return marco;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final alvo = proximo;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          TrilhaDeConvites.quantosEmPalavras(quantos),
          style: textos.titleMedium?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        for (final marco in marcos) ...<Widget>[
          _linhaDoMarco(marco, cores, textos),
          const SizedBox(height: BichuEspaco.e2),
        ],
        if (alvo != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            alvo.quantoFalta(quantos),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }

  Widget _linhaDoMarco(
    MarcoDeConvite marco,
    BichuCores cores,
    TextTheme textos,
  ) {
    final feito = quantos >= marco.quantos;
    // O glifo diz o estado, e o rótulo acessível também: um ícone de "feito"
    // sem texto deixa quem usa leitor de tela com uma lista de três nomes sem
    // saber qual foi alcançado.
    return Semantics(
      label: '${marco.rotulo}: ${feito ? 'alcançado' : 'ainda não'}',
      child: ExcludeSemantics(
        child: Row(
          children: <Widget>[
            Icon(
              feito ? Icons.check_circle_outline : Icons.radio_button_unchecked,
              size: 20,
              color: feito ? cores.success : cores.textMuted,
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Text(
                marco.rotulo,
                style: textos.bodyMedium?.copyWith(
                  color: feito ? cores.textPrimary : cores.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um marco da trilha: **em que número ele acontece, e o que acontece lá**.
///
/// O par existe separado para o prêmio futuro caber em [rotulo] sem a trilha
/// aprender nada novo.
class MarcoDeConvite {
  const MarcoDeConvite(this.quantos, this.rotulo);

  final int quantos;
  final String rotulo;

  String quantoFalta(int atuais) {
    final faltam = quantos - atuais;
    if (faltam <= 0) return rotulo;
    if (faltam == 1) return 'Falta 1 para “$rotulo”.';
    return 'Faltam $faltam para “$rotulo”.';
  }
}
