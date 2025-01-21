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
  // teamEarnings: {
  //   type: Number,
  //   default: 0,
  // },
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
    default: ''
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
  ]
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next()
  }
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

userSchema.methods.isPasswordCorrect = async function(password) {
  return await bcrypt.compare(password,this.password)
}

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "15m",
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


export const User = mongoose.model("User", userSchema)