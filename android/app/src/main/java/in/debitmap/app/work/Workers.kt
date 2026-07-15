package io.debitmap.app.work

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import io.debitmap.app.data.DebitMapDatabase
import io.debitmap.app.data.ForecastEntity
import io.debitmap.app.data.TransactionEntity
import io.debitmap.app.network.ApiProvider
import io.debitmap.app.network.ForecastRequest
import io.debitmap.app.network.ParseRequest
import io.debitmap.app.network.TransactionDto
import io.debitmap.app.sms.SmsScanner
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

class ScanWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (ActivityCompat.checkSelfPermission(applicationContext, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) return Result.failure()
        return try {
            val dao = DebitMapDatabase.get(applicationContext).dao()
            val parsed = ApiProvider.api.parse(ParseRequest(SmsScanner.readFinancialMessages(applicationContext))).transactions
            dao.upsertTransactions(parsed.map { it.toEntity() })
            val all = dao.transactions().map { it.toDto() }
            val existing = dao.forecasts()
            val feedback = existing.mapNotNull { item -> item.feedback?.let { item.id to it } }.toMap()
            val forecasts = ApiProvider.api.forecast(ForecastRequest(all, feedback)).forecasts
            dao.clearActiveForecasts()
            val entities = forecasts.map { item ->
                ForecastEntity(item.id, item.merchant, item.category, item.cadence, item.nextDebitAt, item.windowStart, item.windowEnd, item.expectedAmount, item.amountMin, item.amountMax, item.confidence, item.confidenceScore, item.evidence.joinToString("||"), item.priceChangePercent, feedback[item.id])
            }
            dao.upsertForecasts(entities)
            entities.filter { it.confidence == "high" && it.feedback == null }.forEach { scheduleAlert(it) }
            Result.success()
        } catch (error: Exception) {
            Result.retry()
        }
    }

    private fun scheduleAlert(item: ForecastEntity) {
        val alertDate = LocalDate.parse(item.nextDebitAt).minusDays(3).atTime(9, 0).atZone(ZoneId.systemDefault()).toInstant()
        val delay = Duration.between(java.time.Instant.now(), alertDate).toMillis().coerceAtLeast(0)
        val request = OneTimeWorkRequestBuilder<NotificationWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString("merchant", item.merchant).putDouble("amount", item.expectedAmount).putString("date", item.nextDebitAt).build())
            .addTag("alert-${item.id}").build()
        WorkManager.getInstance(applicationContext).enqueue(request)
    }
}

class NotificationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (ActivityCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return Result.success()
        val merchant = inputData.getString("merchant") ?: return Result.failure()
        val amount = inputData.getDouble("amount", 0.0)
        val date = inputData.getString("date") ?: "soon"
        val notification = NotificationCompat.Builder(applicationContext, "upcoming_debits")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("$merchant may debit in 3 days")
            .setContentText("Expected ₹${"%,.0f".format(amount)} around $date. This is a prediction, not a confirmed mandate.")
            .setAutoCancel(true).build()
        applicationContext.getSystemService(NotificationManager::class.java).notify(merchant.hashCode(), notification)
        return Result.success()
    }
}

private fun TransactionDto.toEntity() = TransactionEntity(id, sender, occurredAt, amount, direction, merchant, normalizedMerchant, category, accountSuffix, reference, explicitRecurring, confidence)
private fun TransactionEntity.toDto() = TransactionDto(id, sender, occurredAt, amount, direction, merchant, normalizedMerchant, category, accountSuffix, reference, explicitRecurring, confidence)
