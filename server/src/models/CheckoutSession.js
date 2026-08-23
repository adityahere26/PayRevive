// See ARCHITECTURE.md § Checkout abandonment detection — `status` transitions from
// "started" to "abandoned" via either the real timeout check or the demo trigger, both of
// which call the same Revenue Risk Detector function (implemented in a later phase).

import mongoose from "mongoose";

const { Schema } = mongoose;

const checkoutSessionSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["started", "abandoned", "completed"],
      default: "started",
      index: true,
    },
  },
  { timestamps: true }
);

export const CheckoutSession = mongoose.model("CheckoutSession", checkoutSessionSchema);
