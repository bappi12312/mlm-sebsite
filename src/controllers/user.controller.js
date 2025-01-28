import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import jwt from 'json-web-token'
import { generateAccessAndRefreshTokens } from '../utils/genarateToken.js'
import { genarateReferralCode } from '../utils/genarateReferralCode.js'
import { deleteMediaFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js'
import mongoose from 'mongoose'
import { Payment } from '../models/payment.model.js'
import { PaymentRequeste } from '../models/paymentRequeste.model.js'


const userRegister = asyncHandler(async (req, res) => {
  const { name, email, password, referredBy } = req.body;

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    throw new ApiError(400, "All fields are required");
  }

  try {
    const emailNormalized = email.toLowerCase().trim();
    let referrer = referredBy
      ? await User.findOne({ referalCode: referredBy.trim() })
      : null;

    if (referredBy && !referrer) {
      return res.status(400).json({ message: "Invalid referral code." });
    }

    const existedUser = await User.findOne({ email: emailNormalized });
    if (existedUser) {
      throw new ApiError(400, "User already exists");
    }

    const referalCode = await genarateReferralCode();

    const newUser = new User({
      name,
      email: emailNormalized,
      password,
      referredBy: referrer?._id || null,
      referalCode,
      role: "user",
      status: "Inactive",
      photo: "",
      downline: [],
    });

    if (referrer) {
      // const sponser = await User.findById(referrer.referredBy);
      // if (sponser) {
      //   sponser.downline.push(newUser._id);
      //   await sponser.save();
      // }
      referrer.downline.push(newUser?._id)
      referrer.save()
    }

    await newUser.save();

    const { password: _, ...safeUserData } = newUser.toObject();
    return res
      .status(200)
      .json(new ApiResponse(200, { user: safeUserData }, "User created successfully"));
  } catch (error) {
    console.error("Error during user registration:", error);
    throw new ApiError(500, error?.message || "Error while creating user");
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
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    // cookies(cannot be modified in frontend only server can)
    const options = {
      httpOnly: true,
      secure: true
    }

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            user: loggedInUser, accessToken, refreshToken
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
      secure: true,
    };
    res.clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .status(200)
      .json(new ApiResponse(200, {}, "User logged out successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Error while logging out");
  }
});


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
  const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken || req.headers?.authorization?.split(" ")[1];

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request")
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    )

    const user = await User.findById(decodedToken?._id)

    if (!user) {
      throw new ApiError(401, "Invalid refresh token")
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token expired or used")
    }

    const options = {
      httpOnly: true,
      secure: true
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
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
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "Invalid refresh token")
  }

})

// update a user
const updateUser = asyncHandler(async (req, res) => {
  try {
    const { name, invest } = req.body;
    const userPhotoLocalPath = req.file
    if (!userPhotoLocalPath) {
      throw new ApiError(400, "coverImage file is missing")
    }

    const user = await User.findById(req.user?._id);
    if (!user) {
      throw new ApiError(400, "user not found")
    }
    if (user.photo) {
      const publicId = user.photo.split("/").pop().split(".")[0];
      await deleteMediaFromCloudinary(publicId)
    }
    const photoUrl = await uploadOnCloudinary(userPhotoLocalPath.path)
    const photo = photoUrl?.secure_url;

    const updateFeilds = {
      ...(name && { name }), //update name if provided
      ...(Number(invest) === 100 && { status: "Active" }),
      ...(photo && { photo })
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: updateFeilds
      },
      {
        new: true
      }
    ).select("-password -refreshToken")

    return res
      .status(200)
      .json(new ApiResponse(200, { updatedUser }, "user updated successfully"))
  } catch (error) {
    throw new ApiError(
      500,
      error?.message || "error while updating a user"
    )
  }

})

// distribute commission for every users
const userCommission = asyncHandler(async (req, res) => {
  const { amount = 100 } = req.body;

  try {
    const user = await User.findById(req.user?._id)
    if (!user) {
      throw new ApiError(401, "user not found")
    }

    if (Number(amount) === 100) {
      user.status = "Active"
      await user.save()
    }

    let currentReffererId = user.referredBy;
    let level = 1
    const commissionRates = [20, 15, 10]

    while (currentReffererId && level <= commissionRates.length && (user.status === "Active")) {
      const sponser = await User.findById({ _id: currentReffererId })
      if (sponser && (sponser.status === "Active")) {
        const commission = (Number(amount) * commissionRates[level - 1]) / 100;

        sponser.earnings += commission;
        // sponser.transactions.push({
        //   amount: commission,
        //   fromUser: req.user?._id,
        // })

        await sponser.save()
        currentReffererId = sponser?._id;
        level++
      } {
        break;
      }
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { user },
          'commissions distributed.'
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while distributied commission")
  }
})

const getSingleUser = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
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
          {  },
          "if your payment is successful then your account will be activated after some time"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while creating payment")
  }
})

const getAllPayment = asyncHandler(async (req, res) => {
  try {
    const payments = await Payment.find()
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
    if((user?.status === "Inactive") && (user?.earnings < 500)) {
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
    const paymentRequestes = await PaymentRequeste.find()
    if (!paymentRequestes) {
      throw new ApiError(404, "payment requestes not found")
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { paymentRequestes },
          "all payment requestes sent successfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message || "error while getting all payment requestes")
  }
})

// payment confirmation
const paymentConfirmation = asyncHandler(async (req, res) => {
  try {
    const { paymentId } = req.body;
    const userId = req.user?._id;
    if (!paymentId) {
      throw new ApiError(400, "payment id is required")
    }

    const payment = await Payment.findById(paymentId)
    if (!payment) {
      throw new ApiError(500, "payment not found")
    }

    const user = await User.findById(userId)
    if (!user) {
      throw new ApiError(400, "user not found")
    }

    if ((payment.status === "pending") && (payment.Amount >= 100)) {
      // const user = await User.findByIdAndUpdate(
      //   userId,
      //   {
      //     $set: {
      //       status: "Active"
      //     }
      //   },
      //   {
      //     new: true
      //   }
      // ).select("-password -refreshToken")
      payment.status = "completed"
      user.status = "Active"

      await payment.save()
      await user.save()
    }



    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { user,payment },
          "payment confirmation succesfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while getting payment confirmation")
  }
})

// get all users by admin
const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.aggregate([
      {
        $group: {
          _id: "$status",
          users: { $push: "$$ROOT" }
        }
      }
    ])
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

  }
})






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
  getSingleUser
}