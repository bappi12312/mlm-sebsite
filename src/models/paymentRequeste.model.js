import mongoose, { mongo } from "mongoose";

const paymentRequestSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["bkash","roket","nogod"],
  },
  number: {
    type: Number,
    required: true,
  },
  confirmNumber: {
    type: Number,
    required: true,
  }
},{timestamps: true})

export const PaymentRequeste = mongoose.model("PaymentRequeste",paymentRequestSchema)