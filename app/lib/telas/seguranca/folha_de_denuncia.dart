import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_seguranca.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';

/// A FOLHA DE DENÚNCIA — a mesma para os três alvos, com a lista do alvo.
class FolhaDeDenuncia extends StatefulWidget {
  const FolhaDeDenuncia({
    required this.alvo,
    required this.aoEnviar,
    super.key,
  });

  final AlvoDaDenuncia alvo;

  /// Recebe o valor do contrato e o relato aparado.
  final Future<void> Function(String motivo, String? relato) aoEnviar;

  @override
  State<FolhaDeDenuncia> createState() => _EstadoDaFolhaDeDenuncia();
}

class _EstadoDaFolhaDeDenuncia extends State<FolhaDeDenuncia> {
  String? _motivo;
  final TextEditingController _relato = TextEditingController();
  bool _enviando = false;
  MensagemDeErro? _erro;

  @override
  void dispose() {
    _relato.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final motivo = _motivo;
    if (motivo == null || _enviando) return;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      await widget.aoEnviar(motivo, _relato.text);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = MensagensDeErro.de(falha);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              widget.alvo.titulo,
              style: textos.titleLarge?.copyWith(color: cores.textPrimary),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              oOutroNaoEAvisado,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e5),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    GrupoDeOpcoes<String>(
                      rotulo: 'Motivo da denúncia',
                      opcoes: widget.alvo.motivos
                          .map((m) => OpcaoDeLinha<String>(valor: m.valor, rotulo: m.rotulo))
                          .toList(),
                      selecionado: _motivo,
                      aoSelecionar: (valor) => setState(() => _motivo = valor),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    TextField(
                      controller: _relato,
                      maxLines: 3,
                      maxLength: 1000,
                      onTapOutside: (PointerDownEvent _) =>
                          FocusManager.instance.primaryFocus?.unfocus(),
                      decoration: const InputDecoration(
                        labelText: 'Quer contar mais? (opcional)',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(
                texto: _erro!.texto,
                rotuloDaAcao: _erro!.acao,
                aoTocarNaAcao: saidaDaMensagem(context, _erro!),
              ),
            ],
            const SizedBox(height: BichuEspaco.e5),
            BotaoPrimario(
              rotulo: 'Enviar',
              carregando: _enviando,
              aoTocar: _motivo == null ? null : _enviar,
            ),
          ],
        ),
      ),
    );
  }
}

/// Abre a folha. Devolve `true` quando a denúncia foi aceita.
Future<bool> mostrarFolhaDeDenuncia(
  BuildContext context, {
  required AlvoDaDenuncia alvo,
  required Future<void> Function(String motivo, String? relato) aoEnviar,
}) async {
  final cores = BichuColors.of(context).cores;
  final enviou = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => FolhaDeDenuncia(alvo: alvo, aoEnviar: aoEnviar),
  );
  return enviou ?? false;
}
