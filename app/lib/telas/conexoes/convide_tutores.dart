import 'dart:async';

import 'package:flutter/material.dart';

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
/// ## A TELA MORA NO AuAu, E NÃO NO PERFIL (decisão dele, 21/10/2026)
///
/// Tela **empilhada** sob `/mensagens`, que é a seção `AuAu` da barra de baixo:
/// [CascaFixa.slotDaRota] casa pelo **primeiro segmento**, então o slot do AuAu
/// continua aceso enquanto esta tela está na frente — que é o que o protótipo
/// aprovado desenha. O Perfil já é pilha de menus (Meus pets, Meus achados,
/// Meus eventos, Meus dados) e pôr mais um lá seria a sexta linha de uma lista
/// que o cliente mandou dividir por tópicos no mesmo dia.
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
/// ## O CONTADOR NÃO TEM ROTA, E É POR ISSO QUE ESTA TELA DIZ "NINGUÉM AINDA"
///
/// **MEDIDO:** o contrato não devolve, em operação nenhuma, quantas pessoas
/// entraram pelo convite de alguém. `ConnectionInviteIssued` recusa a contagem
/// de usos **por escrito** — *"seria a lista de quem viu o perfil de alguém,
/// reduzida a um número"* — e `ConnectionSummary` traz cinco números, nenhum
/// deles este.
///
/// A regra de quando uma indicação conta está decidida (**conexão aceita E a
/// pessoa com ao menos um pet com foto `ready`**), e os dois sinais são legíveis
/// no banco — o segundo é o mesmo freio anti-abuso da vitrine. O que falta é a
/// rota, e **a tela não a simula**: um número montado aqui com o que o app tem
/// na mão contaria conexões aceitas de qualquer procedência, e diria que a
/// pessoa trouxe gente que ela não trouxe.
///
/// Então o placar nasce **ausente**, com o estado que é verdade hoje. Quando a
/// rota existir, [_placar] recebe o número e a trilha aparece: nada aqui precisa
/// mudar de forma.
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
  const TelaDeConvidarTutores({required this.convites, super.key});

  final ConvitesApi convites;

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

  /// A ação de emitir, para quem ainda não tem convite nesta sessão.
  static const String criarOConvite = 'Criar o meu QR de convite';

  static const String trocarOConvite = 'Trocar o meu QR';

  /// O aviso de que trocar mata o anterior. **Antes do toque, e não depois**:
  /// emitir revoga o convite que estava valendo, e quem já tinha o antigo não
  /// chega mais ao seu perfil.
  static const String trocarMataOAnterior =
      'Trocar apaga o QR de agora. Quem já escaneou o antigo não chega mais ao '
      'seu perfil.';

  static const String apagarOConvite = 'Apagar o meu QR';

  static const String apagarNaoDesfazConexao =
      'Apagar fecha a porta e não desfaz conexão: quem já pediu continua na sua '
      'caixa de pedidos.';

  /// O que a tela diz depois de apagar.
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
  bool _apagando = false;
  String? _falha;

  /// Quantas pessoas a conta trouxe, ou **nulo quando ninguém contou**.
  ///
  /// Hoje é sempre nulo, e isso não é um valor de queda: é a ausência da rota,
  /// escrita como ausência. Ver o cabeçalho — um número montado aqui contaria
  /// conexões de qualquer procedência.
  int? get _placar => null;

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

  Future<void> _apagar() async {
    if (_apagando) return;
    setState(() {
      _apagando = true;
      _falha = null;
    });
    try {
      await widget.convites.revogar();
      if (!mounted) return;
      // **O 204 é idempotente**: sem convite ativo também é 204. A tela não
      // distingue os dois, porque o efeito desejado — não existe QR meu
      // valendo — foi alcançado nos dois casos.
      setState(() {
        _convite = null;
        _apagando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _apagando = false;
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

  List<Widget> _placarDoReconhecimento() {
    final quantos = _placar;
    if (quantos == null || quantos == 0) {
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
        Text(
          TelaDeConvidarTutores.valeAte(convite.expiresAt),
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          TelaDeConvidarTutores.oQrNaoVoltaDepois,
          style: textos.bodySmall?.copyWith(color: cores.textMuted),
        ),
        const SizedBox(height: BichuEspaco.e6),
        // **Os dois controles ficam embaixo do QR, e o aviso vem ANTES de cada
        // um**: os dois matam o que está circulando, e o texto é o que separa
        // "quero outro" de "não quero nenhum".
        Text(
          TelaDeConvidarTutores.trocarMataOAnterior,
          style: textos.bodySmall?.copyWith(color: cores.textMuted),
        ),
        const SizedBox(height: BichuEspaco.e2),
        BotaoSecundario(
          rotulo: TelaDeConvidarTutores.trocarOConvite,
          carregando: _emitindo,
          aoTocar: () => unawaited(_emitir()),
        ),
        const SizedBox(height: BichuEspaco.e4),
        Text(
          TelaDeConvidarTutores.apagarNaoDesfazConexao,
          style: textos.bodySmall?.copyWith(color: cores.textMuted),
        ),
        const SizedBox(height: BichuEspaco.e2),
        BotaoSecundario(
          rotulo: TelaDeConvidarTutores.apagarOConvite,
          carregando: _apagando,
          aoTocar: () => unawaited(_apagar()),
        ),
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
