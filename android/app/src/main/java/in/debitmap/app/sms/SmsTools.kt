package io.debitmap.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import io.debitmap.app.network.MessageDto
import io.debitmap.app.work.ScanWorker
import java.time.Instant

object SmsFilter {
    private val amount = Regex("(?:₹|rs\\.?|inr)\\s*[\\d,]+(?:\\.\\d{1,2})?", RegexOption.IGNORE_CASE)
    private val financial = Regex("\\b(debit(?:ed)?|paid|spent|purchase|charged|autopay|mandate|nach|standing instruction|emi|bill|withdrawn|credit(?:ed)?|refund(?:ed)?|received)\\b", RegexOption.IGNORE_CASE)
    private val otp = Regex("\\b(otp|one[ -]?time password|verification code|do not share)\\b", RegexOption.IGNORE_CASE)
    fun isFinancial(text: String) = !otp.containsMatchIn(text) && amount.containsMatchIn(text) && financial.containsMatchIn(text)
}

object SmsScanner {
    fun readFinancialMessages(context: Context): List<MessageDto> {
        val cutoff = System.currentTimeMillis() - 370L * 24 * 60 * 60 * 1000
        val result = mutableListOf<MessageDto>()
        context.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.DATE, Telephony.Sms.BODY, Telephony.Sms._ID),
            "${Telephony.Sms.DATE} >= ?", arrayOf(cutoff.toString()), "${Telephony.Sms.DATE} ASC",
        )?.use { cursor ->
            val senderIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
            val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val idIndex = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
            while (cursor.moveToNext()) {
                val body = cursor.getString(bodyIndex) ?: continue
                if (!SmsFilter.isFinancial(body)) continue
                val time = cursor.getLong(dateIndex)
                result += MessageDto(cursor.getString(idIndex), cursor.getString(senderIndex) ?: "unknown", Instant.ofEpochMilli(time).toString(), body)
            }
        }
        return result.takeLast(500)
    }
}

class FinancialSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val isRelevant = Telephony.Sms.Intents.getMessagesFromIntent(intent).any { SmsFilter.isFinancial(it.messageBody.orEmpty()) }
        if (isRelevant) WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<ScanWorker>().build())
    }
}
