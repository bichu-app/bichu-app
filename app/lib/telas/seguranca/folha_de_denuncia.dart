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
///
/// ## A CONTAGEM DE TOQUES, que é o requisito e não um detalhe
///
/// **1 toque para achar, 2 para chegar aos motivos, 4 para concluir.**
///
/// | Toque | O que acontece |
/// |---|---|
/// | 1 | o "⋮" da barra do perfil abre o menu — *achar* |
/// | 2 | "Denunciar este perfil" abre **esta folha, com os motivos à vista** |
/// | 3 | escolher o motivo **seleciona**, e não envia |
/// | 4 | **"Enviar"**, explícito |
///
/// O terceiro toque não envia, e isso é a decisão mais importante da folha:
/// **denúncia não tem desfazer**, e o erro custa a quem foi denunciado. Uma
/// folha que disparasse no toque do motivo entregaria uma denúncia a cada
/// polegar errado, sobre uma pessoa real, sem volta.
///
/// Os motivos aparecem **na própria folha** e não atrás de outro passo: um
/// terceiro nível ("Ajustes → Privacidade → Denunciar") é o padrão em que a
/// pessoa desiste, e quem precisa denunciar está desconfortável e não vai caçar
/// o botão.
///
/// ## A frase de que o outro não é avisado vem ANTES do envio
///
/// Antes, e não na confirmação. Quem está decidindo se denuncia precisa saber
/// que a outra pessoa não fica sabendo **enquanto decide** — depois do envio
/// seria um alívio; antes, é o que faz a pessoa conseguir tocar no botão.
///
/// ## O que esta folha NÃO diz
///
/// **Nenhum prazo.** Não existe prazo, e nenhuma frase daqui promete "vamos
/// analisar em X" nem "nossa equipe responderá". O que ela promete é o que
/// acontece de verdade e na hora: *"Você não vai mais ver este conteúdo."*
///
/// **Nada sobre o que o outro vai ver**, porque o outro não vê nada.
///
/// ## Sem campo de motivo livre
///
/// `relato` é opcional e é contexto *sobre o motivo escolhido*. Não existe
/// caminho de enviar sem motivo: `Enviar` fica desabilitado até haver um.
class FolhaDeDenuncia extends StatefulWidget {
  const FolhaDeDenuncia({
    required this.alvo,
    required this.aoEnviar,
    super.key,
  });

  final AlvoDaDenuncia alvo;

  /// Recebe o valor do contrato e o relato aparado. Lança [FalhaDaApi] em erro.
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
        // A FRASE É DO SERVIDOR, e a tela não a reescreve: ele é quem sabe o
        // que recusou e por quê. Mesma regra de `criar_encontro.dart`.
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
            // A FRASE QUE FAZ DENUNCIAR PARECER SEGURO, e ela está aqui — antes
            // do envio — de propósito.
            Text(
              oOutroNaoEAvisado,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e5),
            // OS MOTIVOS, À VISTA. Nenhum passo a mais entre o menu e eles.
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
                      // SELECIONA, E NÃO ENVIA. Ver o cabeçalho: o quarto toque
                      // é um `Enviar` explícito porque denúncia não tem
                      // desfazer.
                      aoSelecionar: (valor) => setState(() => _motivo = valor),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    TextField(
                      controller: _relato,
                      maxLines: 3,
                      maxLength: 1000,
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
              // DESABILITADO ATÉ HAVER MOTIVO: não existe caminho de enviar sem
              // dizer o que aconteceu, porque motivo vazio não se tria.
              aoTocar: _motivo == null ? null : _enviar,
            ),
          ],
        ),
      ),
    );
  }
}

/// Abre a folha. Devolve `true` quando a denúncia foi aceita.
///
/// O gesto de voltar devolve nulo, que vira `false`: **um `?? true` aqui
/// transformaria o gesto de voltar do sistema num enviador de denúncia**, e
/// seria invisível na revisão. Mesma regra de `mostrarFolhaDestrutiva`.
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
