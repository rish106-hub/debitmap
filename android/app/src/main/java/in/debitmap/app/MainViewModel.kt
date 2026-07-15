package io.debitmap.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import io.debitmap.app.data.DebitMapDatabase
import io.debitmap.app.data.ForecastEntity
import io.debitmap.app.work.ScanWorker
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class DashboardState(val forecasts: List<ForecastEntity> = emptyList())

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val dao = DebitMapDatabase.get(application).dao()
    val state: StateFlow<DashboardState> = dao.observeForecasts().map { DashboardState(it.filter { item -> item.feedback == null }) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardState())

    fun scan() = WorkManager.getInstance(getApplication()).enqueue(OneTimeWorkRequestBuilder<ScanWorker>().build())
    fun feedback(id: String, value: String) { viewModelScope.launch { dao.setFeedback(id, value) } }
}
