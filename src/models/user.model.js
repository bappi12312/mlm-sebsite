import mongoose from "mongoose";
import bcrypt from 'bcrypt'
import jwt from "jsonwebtoken"


const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  referalCode: {
    type: String,
    unique: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  }, // Direct recruiter
  earnings: {
    type: Number,
    default: 0,
  },
  directRecruit: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Inactive"
  },
  photo: {
    type: String,
    default: null
  },
  refreshToken: {
    type: String
  },
  downline: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }
  ],
  transactions: [
    {
      amount: Number,
      fromUser: mongoose.Schema.Types.ObjectId,
      level: Number,
      date: { type: Date, default: Date.now },
    }
  ],
  isPayForCourse: {
    type: Boolean,
    default: false
  },
  isPay: {
    type: Boolean,
    default: false
  },
  isAffiliate: { type: Boolean, default: false },
  affiliateBalance: { type: Number, default: 0 },
  affiliateSales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AffiliateSale' }],
  uplines: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true })
// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2N2FlMmRiZTY1Mjg4MmZiMGE0YzUzYTYiLCJlbWFpbCI6ImVAZ21haWwuY29tIiwiaWF0IjoxNzM5NDY4NTQ4LCJleHAiOjE3Mzk5MDA1NDh9.1bLoUsqT7WQTqE1-y0aCjsfHw1shchaubIP_3tkQBNg

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next()
  }
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );
};


// models/user.model.js
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ referalCode: 1 }, { unique: true });
userSchema.index({ referredBy: 1 });
userSchema.index({ status: 1 });
userSchema.index({ isAffiliate: 1 });
userSchema.index({affiliateCode: 1})
userSchema.index({ uplines: 1 });
userSchema.index({ isPay: 1 });
userSchema.index({ isPayForCourse: 1 });

export const User = mongoose.model("User", userSchema)
