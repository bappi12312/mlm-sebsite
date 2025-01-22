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
  },
  user: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending","confirm","reject"],
    default: "pending"
  },
  date: {
    type: Date,
    default: Date.now()
  }
},{timestamps: true})

export const PaymentRequeste = mongoose.model("PaymentRequeste",paymentRequestSchema)