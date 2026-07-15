package io.debitmap.app.network

import com.google.gson.annotations.SerializedName
import io.debitmap.app.BuildConfig
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

data class MessageDto(val id: String, val sender: String, val timestamp: String, val text: String)
data class ParseRequest(val messages: List<MessageDto>)
data class TransactionDto(
    val id: String, val sender: String, @SerializedName("occurred_at") val occurredAt: String,
    val amount: Double, val direction: String, val merchant: String,
    @SerializedName("normalized_merchant") val normalizedMerchant: String, val category: String,
    @SerializedName("account_suffix") val accountSuffix: String?, val reference: String?,
    @SerializedName("explicit_recurring") val explicitRecurring: Boolean, val confidence: Double,
)
data class ParseResponse(val transactions: List<TransactionDto>)
data class ForecastRequest(
    val transactions: List<TransactionDto>, val feedback: Map<String, String>,
    @SerializedName("reference_date") val referenceDate: String? = null,
)
data class ForecastDto(
    val id: String, val merchant: String, val category: String, val cadence: String,
    @SerializedName("next_debit_at") val nextDebitAt: String,
    @SerializedName("window_start") val windowStart: String,
    @SerializedName("window_end") val windowEnd: String,
    @SerializedName("expected_amount") val expectedAmount: Double,
    @SerializedName("amount_min") val amountMin: Double,
    @SerializedName("amount_max") val amountMax: Double,
    val confidence: String, @SerializedName("confidence_score") val confidenceScore: Double,
    val evidence: List<String>, @SerializedName("price_change_percent") val priceChangePercent: Int?,
)
data class ForecastResponse(val forecasts: List<ForecastDto>)

interface DebitMapApi {
    @POST("v1/parse") suspend fun parse(@Body body: ParseRequest): ParseResponse
    @POST("v1/forecast") suspend fun forecast(@Body body: ForecastRequest): ForecastResponse
}

object ApiProvider {
    val api: DebitMapApi by lazy {
        val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
        Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client).addConverterFactory(GsonConverterFactory.create()).build().create(DebitMapApi::class.java)
    }
}
