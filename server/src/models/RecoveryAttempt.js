import mongoose from "mongoose";

const { Schema } = mongoose;

const recoveryAttemptSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    channel: { type: String, enum: ["PAYMENT_LINK", "VOICE", "RETRY"], required: true },
    outcome: { type: String, default: null },
  },
  { timestamps: true }
);

export const RecoveryAttempt = mongoose.model("RecoveryAttempt", recoveryAttemptSchema);
