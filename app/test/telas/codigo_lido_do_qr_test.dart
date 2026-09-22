// F2.1, criterio 3 — o que separa o QR da plaquinha de qualquer outro QR.
//
// POR QUE ESTES CASOS SAO DE FUNCAO PURA, E NAO DE TELA. A recusa de um QR que
// nao e do Bichu tem de acontecer **sem sair da camera**, e sem sair da camera
// quer dizer sem ida e volta de rede. A decisao e local, entao ela e
// exercitavel sem montar app nenhum -- e assim cada caso custa milissegundos,
// o que permite ter os de verdade: o cartaz no poste, o `mailto:`, o codigo
// solto sem URL.
//
// A ISCA QUE MAIS IMPORTA e a do hospedeiro. Aceitar `/t/{codigo}` em qualquer
// dominio deixa um QR colado num poste mandar o app resolver um codigo que o
// dono do cartaz escolheu, e o que volta dessa resolucao e a pagina de um pet.
// O grupo `so o hospedeiro do Bichu` reprova no dia em que a lista abrir.
//
// O QUE ESTES CASOS **NAO** MEDEM: a normalizacao dos cinco passos. Ela e do
// servidor (ADR-0004, criterio 7), e ja esta guardada em
// `src/modules/tags/domain/tag-code.test.ts`. Repeti-la aqui criaria a segunda
// fonte da mesma regra, e a do aplicativo envelheceria no bolso de quem nao
// atualiza o app.

import 'package:bichu/telas/escanear/codigo_lido_do_qr.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // O hospedeiro da API do build, que e o que faz a plaquinha de homologacao
  // ser lida pelo app de homologacao sem ninguem recompilar nada.
  final apiDeHomologacao = Uri.parse('https://api.hml.exemplo.dev');

  String? lido(String conteudo, {Uri? api}) =>
      codigoDeTagDoQr(conteudo, apiBaseUrl: api ?? apiDeHomologacao);

  const String codigo = '7K2MQ1D4B8NV3XZ0';

  group('o QR da plaquinha, nas formas em que ele chega', () {
    test('a forma absoluta, que e a que o QR carrega', () {
      expect(lido('https://bichu.app/t/$codigo'), codigo);
    });

    test('a forma impressa, sem esquema', () {
      // A linha legivel da plaquinha imprime `bichu.app/t/<codigo>` sem
      // `https://` (ADR-0004: o TLD `.app` esta no pre-carregamento de HSTS, e
      // sao oito caracteres a menos numa etiqueta em que cada caractere
      // disputa espaco com o QR). Quem gerar um QR a partir da linha legivel
      // gera esta forma, e as duas sao a mesma plaquinha.
      expect(lido('bichu.app/t/$codigo'), codigo);
    });

    test('com barra no fim', () {
      expect(lido('https://bichu.app/t/$codigo/'), codigo);
    });

    test('subdominio de producao', () {
      expect(lido('https://www.bichu.app/t/$codigo'), codigo);
    });

    test('o hospedeiro da API do build, para a plaquinha de homologacao', () {
      expect(lido('https://api.hml.exemplo.dev/t/$codigo'), codigo);
    });

    test('espaco em volta nao atrapalha', () {
      expect(lido('  https://bichu.app/t/$codigo  '), codigo);
    });
  });

  group('a forma do codigo e TOLERANTE, porque quem normaliza e o servidor',
      () {
    // Errar para o lado largo manda o caso duvidoso para quem tem autoridade;
    // errar para o lado estreito faria o app recusar um codigo que o servidor
    // aceitaria, e a pessoa nao teria como saber disso.
    test('minusculas passam', () {
      expect(lido('https://bichu.app/t/${codigo.toLowerCase()}'),
          codigo.toLowerCase());
    });

    test('com hifen passa', () {
      expect(lido('https://bichu.app/t/7K2M-Q1D4-B8NV-3XZ0'),
          '7K2M-Q1D4-B8NV-3XZ0');
    });

    test('`I`, `L` e `O` passam, porque o servidor os substitui', () {
      // Crockford: `I` e `L` viram `1`, `O` vira `0`. Recusar aqui faria o app
      // rejeitar exatamente a confusao de leitura que o contrato existe para
      // perdoar.
      expect(lido('https://bichu.app/t/IL0MQ1D4B8NV3XZO'), 'IL0MQ1D4B8NV3XZO');
    });

    test('`U` NAO passa: ele nao tem substituicao e nunca vira codigo', () {
      expect(lido('https://bichu.app/t/U72MQ1D4B8NV3XZ0'), isNull);
    });

    test('tamanho diferente de 16 nao passa', () {
      expect(lido('https://bichu.app/t/7K2MQ1D4B8NV3XZ'), isNull);
      expect(lido('https://bichu.app/t/7K2MQ1D4B8NV3XZ00'), isNull);
    });
  });

  group('so o hospedeiro do Bichu — a lista NAO e aberta', () {
    test('o cartaz colado no poste nao manda o app resolver nada', () {
      // O caso que da nome ao grupo. Um QR impresso por qualquer pessoa, com o
      // caminho certo e um codigo bem formado, num dominio dela.
      expect(lido('https://bichu.app.exemplo.com.br/t/$codigo'), isNull);
      expect(lido('https://naoebichu.app/t/$codigo'), isNull);
      expect(lido('https://exemplo.com.br/t/$codigo'), isNull);
    });

    test('sufixo parecido nao cola: e `.bichu.app`, e nao `bichu.app`', () {
      // `meubichu.app` termina em `bichu.app` como texto, e nao e subdominio
      // de coisa nenhuma. A conferencia e pelo ponto.
      expect(lido('https://meubichu.app/t/$codigo'), isNull);
    });

    test('o hospedeiro da API de OUTRO build nao vale', () {
      expect(
        lido(
          'https://api.hml.exemplo.dev/t/$codigo',
          api: Uri.parse('https://api.bichu.app'),
        ),
        // Cai no `bichu.app` da lista fixa? Nao: o hospedeiro lido e
        // `api.hml.exemplo.dev`, e o do build agora e outro.
        isNull,
      );
    });
  });

  group('o que nao e um QR do Bichu', () {
    test('texto solto, mesmo com 16 simbolos validos', () {
      // Ele passaria por um teste de alfabeto; ele so nao e do Bichu. Quem tem
      // o codigo em maos e nao tem o QR usa a entrada manual, que aceita a
      // forma solta de proposito.
      expect(lido(codigo), isNull);
    });

    test('vazio e so espaco', () {
      expect(lido(''), isNull);
      expect(lido('   '), isNull);
    });

    test('esquemas sem hospedeiro', () {
      expect(lido('mailto:alguem@exemplo.com.br'), isNull);
      expect(lido('tel:+5511999999999'), isNull);
      expect(lido('javascript:alert(1)'), isNull);
    });

    test('o caminho certo importa: `/t/` e so ele', () {
      expect(lido('https://bichu.app/p/$codigo'), isNull);
      expect(lido('https://bichu.app/$codigo'), isNull);
      expect(lido('https://bichu.app/t/$codigo/extra'), isNull);
      expect(lido('https://bichu.app/t/'), isNull);
    });

    test('o Wi-Fi do cafe, que e o QR mais comum do mundo', () {
      expect(lido('WIFI:S:CafeDaEsquina;T:WPA;P:senha123;;'), isNull);
    });
  });

  group('temFormaDeCodigoDeTag, direto', () {
    test('aceita as tres formas da mesma plaquinha', () {
      expect(temFormaDeCodigoDeTag(codigo), isTrue);
      expect(temFormaDeCodigoDeTag('7k2m q1d4 b8nv 3xz0'), isTrue);
      expect(temFormaDeCodigoDeTag('7K2M.Q1D4.B8NV.3XZ0'), isTrue);
    });

    test('recusa o que nunca vira codigo', () {
      expect(temFormaDeCodigoDeTag(''), isFalse);
      expect(temFormaDeCodigoDeTag('UUUUUUUUUUUUUUUU'), isFalse);
      expect(temFormaDeCodigoDeTag('7K2MQ1D4B8NV3XZ@'), isFalse);
    });
  });
}
