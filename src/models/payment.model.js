import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  FromNumber: {
    type: String,
    required: true,
  },
  ToNumber: {
    type: String,
    default: null,
  },
  transactionId: {
    type: String,
    required: true,
  },
  Amount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["pending","completed"],
    default: "pending"
  },
  PaymentDate: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: String,
    required: true,
  }
},{timestamps: true})


export const Payment = mongoose.model("Payment",paymentSchema)