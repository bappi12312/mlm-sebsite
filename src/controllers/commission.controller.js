import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";

const distributeUplineCommissions = async(userId,amount) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const upline = await getUplineHierarchy(userId);
    if(upline.length === 0){
      throw new ApiError(400, "No upline found")
    }
    const commissionUpdates = calculateCommissions(upline,amount);

    await User.bulkWrite(commissionUpdates,{session})

    await logTransactions(upline,userId,amount,session)

    await session.commitTransaction()

  } catch (error) {
    await session.abortTransaction()
    throw new ApiError(500, "faild to distribute commission")
  } finally {
    session.endSession()
  }
}

const getUplineHierarchy = async (userId) => {
  const upline = []
  let currentUser = await User.findById(userId).session(session)

  while(currentUser.referredBy) {
    const uplineUser = await User.findById(currentUser.referredBy).session(session)
    if(!uplineUser) {
      break
    }
    upline.push({
      _id: uplineUser._id,
      level: upline.length + 1
    })
    currentUser = uplineUser
  }

  return upline;
}

const calculateCommissions = (upline, amount) => {
  const commissionRates = { 1: 0.2, 2: 0.15, 3: 0.10 }; // Level 1: 20%, Level 2: 15%, Level 3: 10%
  const commissionUpdates = [];

  upline.forEach((user) => {
    const rate = commissionRates[user.level];
    if (rate) {
      const commission = amount * rate;
      commissionUpdates.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $inc: { earnings: commission } },
        },
      });
    }
  });

  return commissionUpdates;
};


const logTransactions = async (upline, fromUserId, amount, session) => {
  const transactionLogs = upline.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $push: {
          transactions: {
            amount: amount * commissionRates[user.level],
            fromUser: fromUserId,
            level: user.level,
            date: new Date(),
          },
        },
      },
    },
  }));

  await User.bulkWrite(transactionLogs, { session });
};

export { distributeUplineCommissions };