package io.debitmap.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class DebitMapApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel(
            "upcoming_debits",
            "Upcoming debit alerts",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = "High-confidence alerts three days before a likely recurring debit" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
