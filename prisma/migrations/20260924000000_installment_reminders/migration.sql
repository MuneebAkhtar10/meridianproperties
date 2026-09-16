-- Tracks when the "due in a week" invoice email last went out for an
-- installment, so the daily reminder cron and the manual "Send invoice"
-- button never double-send.

ALTER TABLE "service_charge_installments" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);
