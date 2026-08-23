// See RECOVERY_POLICY.md § Promise-to-Pay lifecycle. No SMS/WhatsApp reminder is ever
// implied by this record — see SPEC.md § Hero feature for the honesty requirement.

import mongoose from "mongoose";

const { Schema } = mongoose;

const promiseToPaySchema = new Schema(
  {
    recoveryCaseId: { type: Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    promisedDate: { type: Date, required: true },
    status: { type: String, enum: ["PENDING", "FULFILLED", "BROKEN"], default: "PENDING" },
    source: { type: String, enum: ["VOICE", "MANUAL"], required: true },
    conversationRef: { type: String, default: null },
  },
  { timestamps: true }
);

export const PromiseToPay = mongoose.model("PromiseToPay", promiseToPaySchema);
