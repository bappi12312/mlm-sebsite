import mongoose from "mongoose";


const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  level: {
    type: Number
  },
  date: {
    type: Date,
    default: Date.now()
  },
},{timestamps: true})

export const Transaction = mongoose.model("Transaction",transactionSchema)