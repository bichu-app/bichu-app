/// A ação `registrar_achado` dentro do envelope de 8.3 (critério 3 da
/// BICHUS-35).
///
/// É a **terceira** das seis ações de 8.3 que este build sabe executar, depois
/// de `cadastrar_pet` e `marcar_perdido`. O critério 3 diz o que ela tem de
/// fazer, palavra por palavra:
///
/// > *"Dado que eu estou deslogada e toco em `Registrar achado`, então a
/// > guarda de ação assume e, depois de autenticar, o achado é registrado e eu
/// > caio na tela do achado registrado com a minha foto, o meu texto e a minha
/// > localização; eu não vejo a home e não digito nada duas vezes."*
///
/// ## Por que `achado_em` entra no envelope já resolvido
///
/// O `Quando?` é uma escolha relativa (`Agora`, `Hoje mais cedo`), e resolver
/// uma escolha relativa **na hora de executar** faria o instante escorregar: a
/// pessoa toca em `Agora` às 19h02, cria a conta, confere o e-mail noutro app
/// e volta às 19h11. Um `Agora` resolvido na execução gravaria 19h11 como a
/// hora em que o animal foi achado — nove minutos que ninguém observou, e que
/// o cruzamento usa para ordenar.
///
/// É o mesmo cuidado que `LocalizacaoDaIntencao` tem com a coordenada.
///
/// ## A ação NÃO tem alvo, e a ausência é o que a separa de `marcar_perdido`
///
/// `marcar_perdido` aponta para um pet que já existe. Aqui o alvo é
/// justamente o que a execução cria, e `IntencaoPendente.alvo` documenta esse
/// caso com todas as letras: *"nulo quando o alvo ainda não existe — é o caso
/// do achado avulso"*.
///
/// ## A foto atravessa por CAMINHO, e é por isso que ela sobrevive
///
/// `FotoDaIntencao` guarda caminho, tipo e tamanho — nunca os bytes. Um
/// envelope com os bytes dentro é um JSON de alguns megabytes sendo
/// serializado no momento de menos memória disponível do app, e ele estoura no
/// aparelho antigo, que é exatamente o aparelho em que o envelope precisa
/// existir (UX 8.3, regra 5).
library;

import '../achado/rascunho_do_achado.dart';
import '../api/achados_api.dart';
import '../api/api_client.dart';
import '../api/mensagens_de_erro.dart';
import '../dispositivo/camera_e_galeria.dart';
import '../roteamento/rotas.dart';
import '../telas/achado/resultado_do_achado.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de UX para onde o achado volta quando o registro falha.
///
/// **F3.5, que é o formulário.** É onde o rascunho mora, e é de lá que a
/// pessoa segue em frente de novo (UX 8.3, regra 4).
const String telaDeRetornoDoAchado = 'F3.5';

/// A chave do instante já resolvido dentro do envelope.
const String campoDeAchadoEm = 'achado_em';

/// Monta o envelope a partir do rascunho de F3.5.
IntencaoPendente intencaoDeRegistrarAchado(
  RascunhoDoAchado rascunho, {
  required DateTime criadaEm,
}) {
  final foto = rascunho.foto;
  return IntencaoPendente(
    acao: AcaoDeIntencao.registrarAchado,
    // Sem alvo: a ação é criar o achado. Ver o cabeçalho.
    telaDeRetorno: telaDeRetornoDoAchado,
    criadaEm: criadaEm,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{
        ...rascunho.campos(),
        // Resolvido AQUI. Ver o cabeçalho.
        campoDeAchadoEm: rascunho.instanteEm(criadaEm)?.toIso8601String(),
      },
      fotos: <FotoDaIntencao>[
        if (foto != null)
          FotoDaIntencao(
            caminho: foto.caminho,
            tipoDeConteudo: foto.tipoDeConteudo,
            tamanhoEmBytes: foto.tamanhoEmBytes,
          ),
      ],
    ),
  );
}

/// O que a tela de retorno recebe quando o registro falha (regra 4 de 8.3).
class RetomadaDoAchado {
  const RetomadaDoAchado({required this.campos, this.erro});

  final Map<String, Object?> campos;

  /// Nulo só quando o executor estourou fora de `FalhaDeChamada` — aí não há
  /// falha de chamada para traduzir, e inventar um texto de tela seria pior
  /// que ficar calado.
  final MensagemDeErro? erro;

  /// O rascunho recarregado, pronto para a tela.
  RascunhoDoAchado get rascunho => RascunhoDoAchado.dosCampos(campos);
}

/// A foto do envelope de volta na forma que a tela conhece.
///
/// Dois tipos com os mesmos três campos, e a duplicação é deliberada:
/// `FotoLocal` é o que a porta do aparelho devolve e `FotoDaIntencao` é o que
/// o disco guarda. Unificá-los faria `lib/intencao/` depender do plugin de
/// câmera para gravar um JSON.
FotoLocal? fotoLocalDaIntencao(FotoDaIntencao? foto) {
  if (foto == null) return null;
  return FotoLocal(
    caminho: foto.caminho,
    tipoDeConteudo: foto.tipoDeConteudo,
    tamanhoEmBytes: foto.tamanhoEmBytes,
  );
}

/// O instante de `found_at` guardado no envelope, ou nulo.
DateTime? achadoEmDoEnvelope(Map<String, Object?> campos) {
  final bruto = campos[campoDeAchadoEm] as String?;
  if (bruto == null || bruto.isEmpty) return null;
  return DateTime.tryParse(bruto);
}

/// Registra `registrar_achado` na guarda.
AcaoExecutavel achadoExecutavel(AchadosApi achados) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final campos = intencao.rascunho.campos;
      final rascunho = RascunhoDoAchado.dosCampos(campos);
      final especie = rascunho.especie;
      final porte = rascunho.porte;
      final onde = rascunho.onde;
      final achadoEm = achadoEmDoEnvelope(campos);
      if (especie == null || porte == null || onde == null ||
          achadoEm == null) {
        // Envelope incompleto para uma ação que exige os quatro. A guarda
        // trata isto como defeito de programação, registra e devolve a tela de
        // retorno — com o rascunho inteiro, e não em branco.
        throw StateError(
          'envelope de `registrar_achado` sem espécie, porte, onde ou quando',
        );
      }

      final achado = await achados.registrar(
        corpo: AchadosApi.corpoDeRegistro(
          especie: especie,
          porte: porte,
          achadoEm: achadoEm,
          onde: onde,
          sexo: rascunho.sexo,
          racaCodigo: rascunho.racaCodigo,
          corCodigo: rascunho.corCodigo,
          versaoDaReferencia: rascunho.versaoDaReferencia,
          observacao: rascunho.observacao,
          shareToken: rascunho.shareToken,
        ),
        // A chave nasce na execução, e não no envelope, pelo mesmo motivo do
        // cadastro de pet: uma chave gravada em disco seria reapresentada por
        // um envelope que o servidor já aceitou, e devolveria um achado antigo
        // como se fosse novo. Com o envelope apagado ao executar, cada
        // envelope produz no máximo um registro.
        idempotencyKey: ApiClient.novaChaveDeIdempotencia(),
      );

      final foto = intencao.rascunho.fotos.isEmpty
          ? null
          : intencao.rascunho.fotos.first;

      return ResultadoDaExecucao(
        rota: Rotas.achadoRegistrado,
        // **A tela do achado REGISTRADO** — e não a de "está na fila". A
        // execução aconteceu de verdade: dizer outra coisa aqui seria o
        // espelho do defeito que o critério 2 da BICHUS-31 proíbe.
        extra: ResultadoDoAchado.registrado(
          achado: achado,
          foto: fotoLocalDaIntencao(foto),
        ),
      );
    },
    retomar: (intencao, erro) => RetomadaDoAchado(
      campos: intencao.rascunho.campos,
      erro: erro,
    ),
  );
}
