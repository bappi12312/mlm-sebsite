import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  FromNumber: {
    type: String,
    required: true,
  },
  ToNumber: {
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
  }
},{timestamps: true})


export const Payment = mongoose.model("Payment",paymentSchema)