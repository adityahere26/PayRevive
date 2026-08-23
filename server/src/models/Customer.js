import mongoose from "mongoose";

const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    optedOut: { type: Boolean, default: false },
  },
  { timestamps: true }
);

customerSchema.index({ merchantId: 1, optedOut: 1 });

export const Customer = mongoose.model("Customer", customerSchema);
