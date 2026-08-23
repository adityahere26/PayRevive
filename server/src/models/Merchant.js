// See ARCHITECTURE.md § Database schema (merchants) and RECOVERY_POLICY.md § Merchant policy
// fields and MVP defaults for the defaults used below.

import mongoose from "mongoose";

const { Schema } = mongoose;

const policySchema = new Schema(
  {
    maxRecoveryAttempts: { type: Number, default: 2, min: 0 },
    maxVoiceAttempts: { type: Number, default: 1, min: 0 },
    maxAutonomousAmount: { type: Number, default: 50000, min: 0 },
    recoveryWindowHours: { type: Number, default: 72, min: 1 },
    // Falls back to maxAutonomousAmount when unset — see RECOVERY_POLICY.md.
    escalationAmount: { type: Number, default: null, min: 0 },
    optOutBehavior: { type: String, enum: ["DO_NOT_CONTACT"], default: "DO_NOT_CONTACT" },
    maxContactAttempts: { type: Number, default: 2, min: 0 },
  },
  { _id: false }
);

const merchantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Not set for the demo merchant. Required only by the (not-yet-built) real
    // registration flow — enforced there, not at the schema level.
    passwordHash: { type: String, default: null, select: false },
    policy: { type: policySchema, default: () => ({}) },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Merchant = mongoose.model("Merchant", merchantSchema);
