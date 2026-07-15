package io.debitmap.app.sms

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsFilterTest {
    @Test fun acceptsFinancialDebit() = assertTrue(SmsFilter.isFinancial("Rs.649 debited from A/c XX1842 for Netflix via standing instruction."))
    @Test fun rejectsOtp() = assertFalse(SmsFilter.isFinancial("OTP 481902 for transaction of Rs.649. Do not share."))
    @Test fun rejectsConversation() = assertFalse(SmsFilter.isFinancial("Can you send me Rs.500 tomorrow?"))
}
