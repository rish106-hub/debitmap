package io.debitmap.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import io.debitmap.app.data.ForecastEntity
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Paper = Color(0xFFF3F0E8)
private val Ink = Color(0xFF151714)
private val Blue = Color(0xFF203CFF)
private val Coral = Color(0xFFEF4A32)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = Blue, background = Paper, surface = Color(0xFFFBFAF6))) { DebitMapApp() } }
    }
}

@Composable
fun DebitMapApp(vm: MainViewModel = viewModel()) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var disclosed by remember { mutableStateOf(context.getSharedPreferences("privacy", android.content.Context.MODE_PRIVATE).getBoolean("accepted", false)) }
    var permission by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED) }
    val requestSms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        permission = grants[Manifest.permission.READ_SMS] == true
        if (permission) vm.scan()
    }
    if (!disclosed || !permission) {
        ConsentScreen(onAccept = {
            disclosed = true
            context.getSharedPreferences("privacy", android.content.Context.MODE_PRIVATE).edit().putBoolean("accepted", true).apply()
            val permissions = buildList {
                add(Manifest.permission.READ_SMS); add(Manifest.permission.RECEIVE_SMS)
                if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            }
            requestSms.launch(permissions.toTypedArray())
        })
    } else {
        val state by vm.state.collectAsState()
        Dashboard(state.forecasts, vm::scan, vm::feedback)
    }
}

@Composable
private fun ConsentScreen(onAccept: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Paper).padding(28.dp), verticalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(34.dp).background(Ink), contentAlignment = Alignment.Center) { Text("D", color = Color.White, fontWeight = FontWeight.Bold) }; Spacer(Modifier.width(10.dp)); Text("DebitMap", fontWeight = FontWeight.Bold, fontSize = 20.sp) }
        Column {
            Text("YOUR MESSAGES STAY IN CONTROL", color = Coral, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(18.dp))
            Text("See likely debits before they happen.", fontSize = 42.sp, lineHeight = 44.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1.5).sp)
            Spacer(Modifier.height(24.dp))
            Text("DebitMap asks for SMS access to find bank and payment alerts. The phone rejects OTPs and personal messages first. Only likely financial messages are sent for stateless extraction. Raw text is not stored.", lineHeight = 23.sp, color = Color(0xFF555750))
            Spacer(Modifier.height(24.dp))
            listOf("No bank login", "No advertising or analytics", "You can remove permission at any time").forEach { Text("✓  $it", modifier = Modifier.padding(vertical = 6.dp), fontWeight = FontWeight.Medium) }
        }
        Button(onClick = onAccept, modifier = Modifier.fillMaxWidth().height(54.dp), shape = MaterialTheme.shapes.extraSmall) { Text("Allow financial SMS scan") }
    }
}

@Composable
private fun Dashboard(forecasts: List<ForecastEntity>, onScan: () -> Unit, onFeedback: (String, String) -> Unit) {
    val next30 = forecasts.filter { !LocalDate.parse(it.nextDebitAt).isAfter(LocalDate.now().plusDays(30)) }
    val total = next30.sumOf { it.expectedAmount }
    LazyColumn(Modifier.fillMaxSize().background(Paper), contentPadding = PaddingValues(bottom = 40.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(22.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("DebitMap", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                TextButton(onClick = onScan) { Text("Scan again") }
            }
            Column(Modifier.background(Ink).padding(24.dp).fillMaxWidth()) {
                Text("LIKELY IN THE NEXT 30 DAYS", color = Color(0xFFA9AAA5), fontSize = 11.sp)
                Text("₹${"%,.0f".format(total)}", color = Color.White, fontSize = 48.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(18.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("COMMITMENTS", next30.size.toString())
                    Stat("HIGH CONFIDENCE", next30.count { it.confidence == "high" }.toString())
                    Stat("NEXT", next30.firstOrNull()?.nextDebitAt?.let { LocalDate.parse(it).format(DateTimeFormatter.ofPattern("d MMM")) } ?: "None")
                }
            }
            Text("What is likely to hit next", Modifier.padding(22.dp, 30.dp, 22.dp, 12.dp), fontSize = 27.sp, fontWeight = FontWeight.Bold)
        }
        items(next30, key = { it.id }) { item -> ForecastCard(item, onFeedback) }
        if (next30.isEmpty()) item { Text("No credible recurring debits yet. Three matching debits are required before DebitMap sends an alert.", Modifier.padding(28.dp), color = Color.Gray) }
    }
}

@Composable private fun Stat(label: String, value: String) { Column { Text(label, color = Color(0xFF8B8E87), fontSize = 9.sp); Text(value, color = Color.White, fontWeight = FontWeight.Bold) } }

@Composable
private fun ForecastCard(item: ForecastEntity, onFeedback: (String, String) -> Unit) {
    Card(Modifier.padding(horizontal = 18.dp, vertical = 7.dp).fillMaxWidth(), shape = MaterialTheme.shapes.extraSmall, colors = CardDefaults.cardColors(containerColor = Color(0xFFFBFAF6))) {
        Column(Modifier.padding(18.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(item.merchant, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text("${item.category} · ${item.cadence}", color = Color.Gray, fontSize = 12.sp) }
                Column(horizontalAlignment = Alignment.End) { Text("₹${"%,.0f".format(item.expectedAmount)}", fontWeight = FontWeight.Bold); Text(LocalDate.parse(item.nextDebitAt).format(DateTimeFormatter.ofPattern("d MMM")), color = Coral, fontSize = 12.sp) }
            }
            Spacer(Modifier.height(14.dp))
            Text("${item.confidence.uppercase(Locale.ROOT)} · ${(item.confidenceScore * 100).toInt()}%", color = if (item.confidence == "high") Color(0xFF0E7B56) else Color(0xFF705A12), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            item.evidence.split("||").forEach { Text("• $it", color = Color(0xFF666861), fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp)) }
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { onFeedback(item.id, "expected") }) { Text("Expected") }
                TextButton(onClick = { onFeedback(item.id, "not_recurring") }) { Text("Not recurring") }
                TextButton(onClick = { onFeedback(item.id, "ended") }) { Text("Ended") }
            }
        }
    }
}
