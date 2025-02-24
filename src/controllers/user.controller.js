import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import { generateAccessAndRefreshTokens } from '../utils/genarateToken.js'
import { genarateReferralCode } from '../utils/genarateReferralCode.js'
import { deleteMediaFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js'
import { Payment } from '../models/payment.model.js'
import { PaymentRequeste } from '../models/paymentRequeste.model.js'
import jwt from 'jsonwebtoken'
import { distributeUplineCommissions } from './commission.controller.js'
import mongoose, { isValidObjectId } from 'mongoose'

const withTransaction = async (operations) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await operations(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const userRegister = asyncHandler(async (req, res) => {
  const { name, email, password, referredBy } = req.body;

  const requiredFields = { name, email, password };
  if (Object.values(requiredFields).some((field) => !field?.trim())) {
    throw new ApiError(400, 'All fields are required');
  }

  const session = await mongoose.startSession();
  try {
    const safeUserData = await session.withTransaction(async () => {
      const emailNormalized = email.toLowerCase().trim();

      const existingUser = await User.findOne({ email: emailNormalized }).session(session);
      if (existingUser) throw new ApiError(400, "User already exists");

      let referrer = null;
      let uplines = [];
      if (referredBy) {
        referrer = await User.findOne({ referalCode: referredBy.trim() }).session(session).select("_id uplines");
        if (!referrer) throw new ApiError(400, "Invalid referral code");

        uplines = [referrer._id,...(referrer?.uplines?.slice(0, 3) || [])]
      }

      const newUser = new User({
        name,
        email: emailNormalized,
        password,
        referredBy: referrer?._id || null,
        referalCode: await genarateReferralCode(),
        role: "user",
        status: "Inactive",
        downline: [],
        uplines: uplines,
        pakageLink: [],
      });

      await newUser.save({ session });

      if (referrer) {
        referrer.downline?.push(newUser._id);
        await referrer.save({ session });
      }

      const { password: _, ...userData } = newUser.toObject();
      return userData;
    });

    return res.status(200).json(
      new ApiResponse(200, { user: safeUserData }, "User created successfully")
    );
  } catch (error) {
    console.error("Error during user registration:", error);
    throw new ApiError(500, error?.message || "Error while creating user");
  } finally {
    session.endSession();
  }
});



const userLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email) {
    throw new ApiError(400, "email is required")
  }

  try {
    const user = await User.findOne({
      email
    })
    if (!user) {
      throw new ApiError(404, "User does not exists")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
      throw new ApiError(401, "password are incorrrect")
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user?._id)

    // cookies(cannot be modified in frontend only server can)
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            user: user, accessToken, refreshToken
          },
          "User logged In Successfully"
        )
      )

  } catch (error) {
    console.log(error);

    throw new ApiError(
      500, error?.message || "error while loging the user"
    )
  }
})

const logoutUser = asyncHandler(async (req, res) => {
  try {
    if (!req.user?._id) {
      throw new ApiError(400, "User ID not found");
    }

    // Unset refresh token
    await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { refreshToken: 1 } },
      { new: true }
    );

    // Clear cookies
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    res.clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .status(200)
      .json(new ApiResponse(200, {}, "User logged out successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Error while logging out");
  }
});

const updateUserPakagelink = asyncHandler(async (req, res) => {
  const { packageLink,userId } = req.body;
  try {
    if (!packageLink?.trim()) {
      throw new ApiError(400, "Package link is required and cannot be empty");
    }
    if (!userId?.trim()) {
      throw new ApiError(400, "User ID is required");
    }
  
    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID format");
    }
  
    // Update user document
    const user = await User.findByIdAndUpdate(
      userId,
      
        { $push: 
          { pakageLink: { link: packageLink.trim(), status: "Active" } } 
        },
      { new: true, runValidators: true }
    );
  
    if (!user) {
      throw new ApiError(404, "User not found");
    }
  
    return res
      .status(200)
      .json(
        new ApiResponse(200, user, "User package link updated successfully")
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while getting update user package link")
  }
})


// update a user password
const updatePassword = asyncHandler(async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if (!isPasswordCorrect) {
      throw new ApiError(400, "invalid password")
    }
    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password changed successfully"))
  } catch (error) {
    throw new ApiError(
      500,
      error?.message,
      "error while getting update user password"
    )
  }
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.headers?.authorization?.split(" ")[1];

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request: No refresh token provided");
  }

  console.log("Incoming Refresh Token:", incomingRefreshToken);

  try {
    // Verify the token
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    console.log("Decoded Token:", decodedToken);

    const user = await User.findById(decodedToken?._id);
    console.log("User from DB:", user);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token: User not found");
    }

    // Ensure the token matches securely
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token expired or already used");
    }

    // Generate new tokens
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

    console.log("Generated Tokens:", { accessToken, refreshToken });

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    console.error("Error during token refresh:", error.message);
    throw new ApiError(500, error?.message || "Invalid refresh token");
  }
});


// update a user
const updateUser = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const userPhotoLocalPath = req.file;

  return withTransaction(async (session) => {
    const user = await User.findById(req.user._id).session(session);
    if (!user) throw new ApiError(404, 'User not found');

    let photoUrl;
    if (userPhotoLocalPath) {
      if (user.photo) {
        const publicId = user.photo.split('/').pop().split('.')[0];
        await deleteMediaFromCloudinary(publicId);
      }
      photoUrl = await uploadOnCloudinary(userPhotoLocalPath.path);
    }

    const updateData = {
      ...(name && { name }),
      ...(photoUrl?.secure_url && { photo: photoUrl.secure_url })
    };

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, session }
    ).select('-password -refreshToken');

    return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, 'User updated successfully'));
  });
});

// distribute commission for every users
const userCommission = asyncHandler(async (req, res) => {
  const { amount = 100 } = req.body;

  try {
    // Distribute commissions to the upline
    await distributeUplineCommissions(req.params.userId, Number(amount));

    // Send success response
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Commissions distributed successfully"));
  } catch (error) {
    console.error("Error calculating commissions:", error.message);

    // Send error response
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiError(
          error.statusCode || 500,
          error.message || "Error while distributing commission"
        )
      );
  }
});

const giveEarningsEachUser = asyncHandler(async (req, res) => {
  const { amount, affiliateAmount } = req.body;
  const { userId } = req.params;

  // Validation
  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID format");
  }
  if (affiliateAmount && amount) {
    throw new ApiError(400, "Cannot process both affiliate and earnings in the same request");
  }
  if (affiliateAmount && affiliateAmount <= 0) {
    throw new ApiError(400, "Affiliate amount must be a positive number");
  }
  if (amount && amount <= 0) {
    throw new ApiError(400, "Earnings amount must be a positive number");
  }

  try {
    // Atomic updates with conditions
    let updateResult;
    if (affiliateAmount) {
      updateResult = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { affiliateBalance: -affiliateAmount },
          $set: { updatedAt: new Date() }
        },
        {
          new: true,
          runValidators: true,
          fields: 'isAffiliate affiliateBalance',
          collation: { locale: 'en', strength: 2 }
        }
      ).where('isAffiliate').equals(true);
    } else if (amount) {
      updateResult = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { earnings: -amount },
          $set: { updatedAt: new Date() }
        },
        {
          new: true,
          runValidators: true,
          fields: 'isPay status earnings',
          collation: { locale: 'en', strength: 2 }
        }
      ).where('status').equals('Active').where('isPay').equals(true);
    } else {
      throw new ApiError(400, "No valid amount provided");
    }

    if (!updateResult) {
      const errorMessage = affiliateAmount 
        ? "User is not an affiliate or not found" 
        : "User not eligible for earnings or not found";
      throw new ApiError(404, errorMessage);
    }

    const successMessage = affiliateAmount
      ? "Affiliate balance updated successfully"
      : "Earnings updated successfully";

    return res
      .status(200)
      .json(new ApiResponse(200, {}, successMessage));

  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Error processing user transaction";

    // Log only server errors (5xx)
    if (statusCode >= 500) {
      console.error("Error processing transaction:", error.message, {
        userId,
        amount,
        affiliateAmount
      });
    }

    return res
      .status(statusCode)
      .json(new ApiError(statusCode, message));
  }
});


const getSingleUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return res
      .status(200)
      .json(new ApiResponse(200, { user }, "get a user"))

    // res.json({ message: "Profile fetched successfully" });
  } catch (error) {
    throw new ApiError(500, error?.message || "error while get a user")
  }
})

// get user earnings and downline states
const getUserStats = asyncHandler(async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $match: { _id: req.user?._id }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'downline',
          foreignField: '_id',
          as: 'downlineDetails',
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          earnings: 1,
          transactions: 1,
          downlineCount: { $size: '$downlineDetails' },
        },
      }
    ])

    // redisClient.setEx(`userStats:${req.user?._id}`, 3600, JSON.stringify(stats))
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            user: stats[0]
          },
          "get user stats and downline"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while getting the user stats")
  }
})

const paymentCreation = asyncHandler(async (req, res) => {
  const { FromNumber, ToNumber, Amount } = req.body;
  if (!FromNumber || !ToNumber || !Amount) {
    throw new ApiError(400, "all feilds are requred")
  }

  try {

    // const user = await User.findById(req.user?._id)
    // if (!user) {
    //   throw new ApiError(404, "user not found")
    // }
    // if (user.status === "Inactive") {
    //   throw new ApiError(400, "user must be active to create payment")
    // }
    if (Number(Amount) !== 100) {
      throw new ApiError(400, "payment must be 100")
    }
    const payment = await Payment.create({
      FromNumber,
      ToNumber,
      Amount,
      status: "pending",
      PaymentDate: new Date().toISOString(),
      user: req.user?._id,
    })

    if (!payment) {
      throw new ApiError(400, "payment not create")
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "if your payment is successful then your account will be activated after some time"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while creating payment")
  }
})

const getAllPayment = asyncHandler(async (req, res) => {
  try {
    const payments = await Payment.aggregate(
      [
        {
          $match: { status: "pending" }
        },
        {
          $project: {
            FromNumber: 1,
            ToNumber: 1,
            Amount: 1,
            PaymentDate: 1,
            user: 1,
          }
        },
        {
          $sort: { PaymentDate: -1 }
        }

      ]
    )
    if (!payments) {
      throw new ApiError(404, "payments not found")
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { payments },
          "all payments sent successfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting all payments")
  }
})

// payment requested
const paymentRequsted = asyncHandler(async (req, res) => {
  const { type, number, confirmNumber } = req.body;
  if (!type || !number || !confirmNumber) {
    throw new ApiError(400, "all feilds are requred")
  }
  if (!(number === confirmNumber)) {
    throw new ApiError(400, "confirm number and number should be same")
  }

  try {
    const user = await User.findById(req.user?._id)
    if (!user) {
      throw new ApiError(404, "user not found")
    }
    if ((user?.status === "Inactive") && (user?.earnings < 500)) {
      throw new ApiError(400, "user must be active and have 500 earnings to request payment")
    }

    const paymentRequeste = await PaymentRequeste.create({
      type,
      number,
      confirmNumber,
      user: req.user?._id,
      status: "pending",
      date: Date.now()
    })
    if (!paymentRequeste) {
      throw new ApiError(400, "payment requste not create")
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { paymentRequeste },
          "payment request successful"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting payment requested")
  }
})

// admin

const getAllPaymentRequeste = asyncHandler(async (req, res) => {
  try {
    const paymentRequestes = await PaymentRequeste.aggregate([
      {
        $match: { status: "pending" }
      },
      {
        $project: {
          type: 1,
          number: 1,
          confirmNumber: 1,
          user: 1,
          status: 1,
          date: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ])
    if (!paymentRequestes) {
      throw new ApiError(404, "payment requestes not found")
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { paymentRequestes },
          "all new payment requestes sent successfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting all new payment requestes")
  }
})

// payment confirmation
const paymentConfirmation = asyncHandler(async (req, res) => {
  const [paymentId, userId] = req.body;
  try {
    return withTransaction(async (session) => {
      const [payment, user] = await Promise.all([
        Payment.findById(paymentId).session(session),
        User.findById(userId).session(session).select("-password -refreshToken")
      ])

      if (!payment) throw new ApiError(404, "payment not found")
      if (!user) throw new ApiError(404, "user not found")

      if (payment.status !== "pending") {
        throw new ApiError(400, "payment already confirmed")
      }
      if (payment.Amount < 100) {
        throw new ApiError(400, "payment must be 100")
      }
      payment.status = "completed"
      user.status = "Active"

      await Promise.all([
        payment.save({ session }),
        user.save({ session })
      ])

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { user, payment },
            "payment confirmation succesfully"
          )
        )
    })
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting payment confirmation")
  }
  finally {
    session.endSession()
  }
})

// get all users by admin
const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).select("-password -refreshToken")
    if (!(users.length > 0)) {
      throw new ApiError(401, "users not found")
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { users },
          "all users sent successfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting all users")
  }
})

const deleteAUser = asyncHandler(async (req, res) => {
  try {
    // 1. Use only URL parameter for ID (RESTful standards)
    const userId = req.params.id || req.body.id;

    // 2. Validate ID format before query
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID format");
    }

    // 3. Use findByIdAndDelete for single operation
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      throw new ApiError(404, "User not found");
    }

    // 4. Consider adding cleanup for user-related data here if needed
    // Example: await Post.deleteMany({ author: userId });

    return res
      .status(200)
      .json(
        new ApiResponse(200, {}, "User deleted successfully")
      );
  } catch (error) {
    // 5. Handle specific Mongoose errors
    if (error instanceof mongoose.Error.CastError) {
      throw new ApiError(400, "Invalid user ID format");
    }

    // 6. Preserve existing error handling for other cases
    throw new ApiError(
      error.statusCode || 500,
      error.message || "Error while deleting user"
    );
  }
});




export {
  userRegister,
  userLogin,
  logoutUser,
  updatePassword,
  refreshAccessToken,
  updateUser,
  userCommission,
  getUserStats,
  paymentCreation,
  paymentConfirmation,
  paymentRequsted,
  getAllUsers,
  getAllPayment,
  getAllPaymentRequeste,
  getSingleUser,
  deleteAUser,
  updateUserPakagelink,
  giveEarningsEachUser
}