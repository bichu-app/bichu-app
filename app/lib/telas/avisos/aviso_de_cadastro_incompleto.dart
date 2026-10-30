/// O aviso persistente de cadastro incompleto, justificado pelo pet (BICHUS-75,
/// tela 9.2 do UX).
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos.dart';
import '../../api/modelos_pet.dart';
import '../../api/falhas.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../sessao/registro_do_aviso_de_cadastro.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// Os tamanhos que o aviso assume.
enum FormaDoAviso { nenhum, encolhido, cheio }

/// Os textos do aviso, palavra por palavra como a historia os fixou.
abstract final class TextosDoAvisoDeCadastro {
  /// Criterio 1.
  static const String confirmeSeuEmail = 'Confirme seu e-mail';

  /// Criterio 4: a forma encolhida, e tambem a linha discreta do cartao.
  static const String naoConfirmado = 'E-mail não confirmado';
  static const String confirmar = 'Confirmar';

  /// Criterio 1.
  static const String reenviar = 'Reenviar';
  static const String agoraNao = 'Agora não';

  /// Criterio 6.
  static const String estaCertoReenviar = 'Está certo, reenviar';

  /// O corpo do criterio 1, montado em [corpoJustificadoPeloPet].
  static const String prefixoDoCorpo =
      'É por ele que a gente avisa se alguém encontrar ';

  /// Criterio 3.
  static const String umDosSeusPets = 'um dos seus pets';

  /// Zero pet cadastrado. Nao ha nome a dizer e nao ha plural a dizer, e o
  /// criterio 7 so dispensa o aviso de quem ja verificou -- entao ele aparece.
  static const String seuPet = 'seu pet';

  /// Criterio 6 e 9.
  static String enderecoEstaCerto(String email) => 'O e-mail $email está certo?';

  /// Criterio 10. **Microcopy sem fonte escrita**: a historia diz o que a frase
  /// precisa comunicar (ha troca em curso, e o endereco novo e este) e nao diz
  /// com que palavras.
  static const String trocaEmCurso = 'Confirme o e-mail novo';
  static String corpoDaTroca(String novo) =>
      'Falta confirmar $novo. É para lá que a gente vai avisar.';

  /// O que o leitor de tela ouve quando o reenvio deu certo.
  static const String reenviado = 'E-mail reenviado.';

  /// O corpo do criterio 1, com a concordancia resolvida pelo sexo do pet.
  static String corpoJustificadoPeloPet(List<Pet> pets) {
    final String alvo;
    if (pets.isEmpty) {
      alvo = seuPet;
    } else if (pets.length > 1) {
      alvo = umDosSeusPets;
    } else {
      final pet = pets.single;
      final artigo = switch (pet.sexo) {
        Sexo.femea => 'a ',
        Sexo.macho => 'o ',
        _ => '',
      };
      alvo = '$artigo${pet.nome}';
    }
    return '$prefixoDoCorpo$alvo.';
  }
}

/// O que a tela deve desenhar, decidido fora de qualquer widget.
class AvisoDecidido {
  const AvisoDecidido({
    required this.forma,
    this.titulo = '',
    this.corpo,
    this.rotuloPrimario,
    this.mostraAgoraNao = false,
  });

  static const AvisoDecidido nenhum = AvisoDecidido(forma: FormaDoAviso.nenhum);

  final FormaDoAviso forma;
  final String titulo;
  final String? corpo;

  /// `Reenviar`, `Esta certo, reenviar` ou `Confirmar`.
  final String? rotuloPrimario;

  /// Se `Agora nao` aparece. Ele **nao aparece** quando o endereco nao e
  /// entregavel: o criterio 9 manda a faixa voltar cheia fora do ciclo de 7
  /// dias, entao dispensar nao teria efeito nenhum na proxima abertura, e um
  /// botao sem efeito e pior que nenhum botao.
  final bool mostraAgoraNao;
}

/// A decisao, pura.
AvisoDecidido decidirAviso({
  required Usuario usuario,
  required List<Pet> pets,
  required EstadoDoAviso registro,
  required bool silencioVale,
}) {
  if (usuario.emailVerificado) return AvisoDecidido.nenhum;

  final naoEntregavel = !usuario.emailEntregavel;
  final trocaEmCurso = usuario.emailPendente;

  final forma = (naoEntregavel || !silencioVale)
      ? FormaDoAviso.cheio
      : FormaDoAviso.encolhido;

  if (forma == FormaDoAviso.encolhido) {
    return const AvisoDecidido(
      forma: FormaDoAviso.encolhido,
      titulo: TextosDoAvisoDeCadastro.naoConfirmado,
      rotuloPrimario: TextosDoAvisoDeCadastro.confirmar,
    );
  }

  if (trocaEmCurso != null && trocaEmCurso.isNotEmpty) {
    return AvisoDecidido(
      forma: FormaDoAviso.cheio,
      titulo: TextosDoAvisoDeCadastro.trocaEmCurso,
      corpo: TextosDoAvisoDeCadastro.corpoDaTroca(trocaEmCurso),
      rotuloPrimario: TextosDoAvisoDeCadastro.reenviar,
      mostraAgoraNao: true,
    );
  }

  if (naoEntregavel || registro.dispensas >= dispensasQueTrocamOTexto) {
    return AvisoDecidido(
      forma: FormaDoAviso.cheio,
      titulo: TextosDoAvisoDeCadastro.enderecoEstaCerto(usuario.email),
      rotuloPrimario: TextosDoAvisoDeCadastro.estaCertoReenviar,
      mostraAgoraNao: !naoEntregavel,
    );
  }

  return AvisoDecidido(
    forma: FormaDoAviso.cheio,
    titulo: TextosDoAvisoDeCadastro.confirmeSeuEmail,
    corpo: TextosDoAvisoDeCadastro.corpoJustificadoPeloPet(pets),
    rotuloPrimario: TextosDoAvisoDeCadastro.reenviar,
    mostraAgoraNao: true,
  );
}

/// O aviso montado, nas posicoes 1 e 2 (`Inicio` e `Perfil`).
class AvisoDeCadastroIncompleto extends StatefulWidget {
  const AvisoDeCadastroIncompleto({required this.usuario, super.key});

  final Usuario usuario;

  @override
  State<AvisoDeCadastroIncompleto> createState() =>
      _AvisoDeCadastroIncompletoState();
}

class _AvisoDeCadastroIncompletoState extends State<AvisoDeCadastroIncompleto> {
  AvisoDecidido _decidido = AvisoDecidido.nenhum;
  bool _reenviando = false;
  String? _erro;

  /// A confirmacao do reenvio, VISIVEL.
  String? _confirmacao;
  bool _carregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _recalcular();
  }

  @override
  void didUpdateWidget(AvisoDeCadastroIncompleto anterior) {
    super.didUpdateWidget(anterior);
    _recalcular();
  }

  Future<void> _recalcular() async {
    final escopo = Escopo.of(context);
    final registro = escopo.avisoDeCadastro;
    final estado = await registro.estado(widget.usuario.id);
    if (!mounted) return;
    final novo = decidirAviso(
      usuario: widget.usuario,
      pets: escopo.cacheDeMeusPets.pets(widget.usuario.id) ?? const <Pet>[],
      registro: estado,
      silencioVale: registro.silencioVale(estado),
    );
    setState(() {
      _decidido = novo;
      _carregou = true;
    });
  }

  Future<void> _dispensar() async {
    await Escopo.of(context).avisoDeCadastro.dispensar(widget.usuario.id);
    if (!mounted) return;
    await _recalcular();
  }

  Future<void> _reenviarOuConfirmar() async {
    if (_decidido.forma == FormaDoAviso.encolhido) {
      context.push(Rotas.verifiqueSeuEmail, extra: widget.usuario.email);
      return;
    }
    setState(() {
      _erro = null;
      _confirmacao = null;
      _reenviando = true;
    });
    try {
      await Escopo.of(context).auth.reenviarVerificacaoDeEmail(
            email: widget.usuario.emailPendente,
          );
      if (!mounted) return;
      setState(() => _confirmacao = TextosDoAvisoDeCadastro.reenviado);
      anunciar(context, TextosDoAvisoDeCadastro.reenviado);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() => _erro = MensagensDeErro.semConexaoImpossivel);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _erro = 'Não conseguimos reenviar agora. Tente em um '
          'minuto.');
    } finally {
      if (mounted) setState(() => _reenviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_carregou || _decidido.forma == FormaDoAviso.nenhum) {
      return const SizedBox.shrink();
    }
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (_decidido.forma == FormaDoAviso.encolhido) {
      return Padding(
        padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
        child: _LinhaEncolhida(aoTocar: _reenviarOuConfirmar),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e6),
      child: Semantics(
        liveRegion: true,
        container: true,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.warningContainer,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(
                    Icons.mark_email_unread_outlined,
                    color: cores.textPrimary,
                    size: 24,
                    semanticLabel: '',
                  ),
                  const SizedBox(width: BichuEspaco.e3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          _decidido.titulo,
                          style: textos.titleMedium
                              ?.copyWith(color: cores.textPrimary),
                        ),
                        if (_decidido.corpo != null) ...<Widget>[
                          const SizedBox(height: BichuEspaco.e1),
                          Text(
                            _decidido.corpo!,
                            style: textos.bodyMedium
                                ?.copyWith(color: cores.textPrimary),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (_confirmacao != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                Text(
                  _confirmacao!,
                  style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
                ),
              ],
              if (_erro != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                Text(
                  _erro!,
                  style: textos.bodyMedium?.copyWith(color: cores.error),
                ),
              ],
              const SizedBox(height: BichuEspaco.e2),
              Row(
                children: <Widget>[
                  if (_decidido.rotuloPrimario != null)
                    TextButton(
                      onPressed: _reenviando ? null : _reenviarOuConfirmar,
                      child: Text(_decidido.rotuloPrimario!),
                    ),
                  if (_decidido.mostraAgoraNao)
                    TextButton(
                      onPressed: _reenviando ? null : _dispensar,
                      child: const Text(TextosDoAvisoDeCadastro.agoraNao),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A forma encolhida do criterio 4, no mesmo lugar da faixa cheia.
class _LinhaEncolhida extends StatelessWidget {
  const _LinhaEncolhida({required this.aoTocar});

  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      container: true,
      excludeSemantics: true,
      label: '${TextosDoAvisoDeCadastro.naoConfirmado}. '
          '${TextosDoAvisoDeCadastro.confirmar}.',
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e3,
            vertical: BichuEspaco.e2,
          ),
          child: Row(
            children: <Widget>[
              Icon(
                Icons.mark_email_unread_outlined,
                color: cores.textMuted,
                size: 20,
                semanticLabel: '',
              ),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Text(
                  TextosDoAvisoDeCadastro.naoConfirmado,
                  style: textos.bodyMedium?.copyWith(color: cores.textMuted),
                ),
              ),
              Text(
                TextosDoAvisoDeCadastro.confirmar,
                style: textos.labelLarge?.copyWith(color: cores.primary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
