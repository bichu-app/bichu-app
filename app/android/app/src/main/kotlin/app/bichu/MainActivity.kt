package app.bichu

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.CalendarContract
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * O canal `app.bichu/calendario`: abre a tela de "novo evento" do calendario
 * do sistema, ja preenchida com o encontro da Rede.
 *
 * `Intent.ACTION_INSERT` nao le nem grava o calendario, entao o app nao pede
 * `READ_CALENDAR` nem `WRITE_CALENDAR`: quem salva e a pessoa, no app dela.
 * Sem app de calendario, devolve `false` e a tela diz que nao conseguiu.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "app.bichu/calendario")
            .setMethodCallHandler { chamada, resposta ->
                if (chamada.method != "adicionar") {
                    resposta.notImplemented()
                    return@setMethodCallHandler
                }
                val intencao = Intent(Intent.ACTION_INSERT)
                    .setData(CalendarContract.Events.CONTENT_URI)
                    .putExtra(CalendarContract.Events.TITLE, chamada.argument<String>("titulo"))
                    .putExtra(CalendarContract.Events.EVENT_LOCATION, chamada.argument<String>("local"))
                    .putExtra(CalendarContract.Events.DESCRIPTION, chamada.argument<String>("descricao"))
                chamada.argument<Number>("inicioEmMs")?.let {
                    intencao.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, it.toLong())
                }
                chamada.argument<Number>("fimEmMs")?.let {
                    intencao.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, it.toLong())
                }
                try {
                    startActivity(intencao)
                    resposta.success(true)
                } catch (e: ActivityNotFoundException) {
                    resposta.success(false)
                }
            }
    }
}
