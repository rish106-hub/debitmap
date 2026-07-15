package io.debitmap.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String,
    val sender: String,
    val occurredAt: String,
    val amount: Double,
    val direction: String,
    val merchant: String,
    val normalizedMerchant: String,
    val category: String,
    val accountSuffix: String?,
    val reference: String?,
    val explicitRecurring: Boolean,
    val confidence: Double,
)

@Entity(tableName = "forecasts")
data class ForecastEntity(
    @PrimaryKey val id: String,
    val merchant: String,
    val category: String,
    val cadence: String,
    val nextDebitAt: String,
    val windowStart: String,
    val windowEnd: String,
    val expectedAmount: Double,
    val amountMin: Double,
    val amountMax: Double,
    val confidence: String,
    val confidenceScore: Double,
    val evidence: String,
    val priceChangePercent: Int?,
    val feedback: String? = null,
)

@Dao
interface DebitMapDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertTransactions(items: List<TransactionEntity>)

    @Query("SELECT * FROM transactions ORDER BY occurredAt ASC")
    suspend fun transactions(): List<TransactionEntity>

    @Query("SELECT * FROM forecasts ORDER BY nextDebitAt ASC")
    fun observeForecasts(): Flow<List<ForecastEntity>>

    @Query("SELECT * FROM forecasts")
    suspend fun forecasts(): List<ForecastEntity>

    @Query("DELETE FROM forecasts WHERE feedback IS NULL")
    suspend fun clearActiveForecasts()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertForecasts(items: List<ForecastEntity>)

    @Query("UPDATE forecasts SET feedback = :value WHERE id = :id")
    suspend fun setFeedback(id: String, value: String)
}

@Database(entities = [TransactionEntity::class, ForecastEntity::class], version = 1, exportSchema = true)
abstract class DebitMapDatabase : RoomDatabase() {
    abstract fun dao(): DebitMapDao

    companion object {
        @Volatile private var instance: DebitMapDatabase? = null
        fun get(context: Context): DebitMapDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, DebitMapDatabase::class.java, "debitmap.db").build().also { instance = it }
        }
    }
}
