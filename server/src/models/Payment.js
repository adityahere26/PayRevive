// Never store card numbers, CVV, or raw payment credentials here — see SECURITY.md.
// razorpayPaymentId is Razorpay's own identifier for a payment, not a credential.

import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "failed", "paid"], required: true, index: true },
    failureReason: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);
