// See EVALUATION.md. Not exercised until the batch evaluation engine is built (Day 6) — the
// schema exists now so the foundation's model set matches ARCHITECTURE.md in full.

import mongoose from "mongoose";

const { Schema } = mongoose;

const evaluationRunSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    seed: { type: Number, required: true },
    totalCases: { type: Number, required: true, min: 0 },
    metrics: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const EvaluationRun = mongoose.model("EvaluationRun", evaluationRunSchema);
