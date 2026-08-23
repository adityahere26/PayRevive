import mongoose from "mongoose";
import { INTERVENTIONS } from "./RecoveryCase.js";

const { Schema } = mongoose;

const recoveryActionSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: "RecoveryCase", required: true, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    actionType: { type: String, enum: INTERVENTIONS, required: true },
    status: { type: String, default: "PENDING" },
    result: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const RecoveryAction = mongoose.model("RecoveryAction", recoveryActionSchema);
