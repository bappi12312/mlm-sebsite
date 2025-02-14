import mongoose from "mongoose";

const affiliateSaleSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  affiliate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  amount: Number,
  commission: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
})

affiliateSaleSchema.index({affiliate: 1})
affiliateSaleSchema.index({buyer: 1})
affiliateSaleSchema.index({ createdAt: -1 });


export const AffiliateSale = mongoose.model("AffiliateSale", affiliateSaleSchema)