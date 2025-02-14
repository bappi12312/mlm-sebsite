import mongoose from "mongoose";

const coursePakageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["active","inactive"],
    default: "active",
  },
  createdAt: { type: Date, default: Date.now }
})

coursePakageSchema.index({ name: 1 }, { unique: true });
coursePakageSchema.index({status: 1,createdAt: -1})


export const Course = mongoose.model("Course", coursePakageSchema)