import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import jwt from 'json-web-token'
import { generateAccessAndRefreshTokens } from '../utils/genarateToken.js'
import { genarateReferralCode } from '../utils/genarateReferralCode.js'
import { deleteMediaFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js'
import redis from "redis"
import mongoose from 'mongoose'
import { Payment } from '../models/payment.model.js'
import { PaymentRequeste } from '../models/paymentRequeste.model.js'

const redisClient = redis.createClient()

redisClient.on('error', (err) => console.log('Redis error', err)
)
redisClient.connect()


const userRegister = asyncHandler(async (req, res) => {
  const { name, email, password, referredBy } = req.body;

  if ([name, email, password, referredBy].some(val => val?.trim === "")) {
    throw new ApiError(400, "all feilds are required")
  }

  try {
    let referrer = null;

    if (referredBy) {
      referrer = await User.findOne({
        $or: [{ referalCode: referredBy },]
      })
      if (!referrer) return res.status(400).json({ message: 'Invalid referral code.' });
    }

    const existedUser = await User.findOne({ email })
    if (existedUser) {
      throw new ApiError(400, "user already existed")
    }

    const referalCode = await genarateReferralCode()

    // let photoLocalPath;
    // if (req.files && Array.isArray(req.files.photo[0]) && req.files.photo.length > 0) {
    //   photoLocalPath = req.files.photo[0].path;
    // }
    // const photo = await uploadOnCloudinary(photoLocalPath)
    const newUser = new User({
      name,
      email: email?.toLowercase(),
      password,
      referredBy: referrer?.referalCode,
      referalCode,
      role: 'user',
      status: 'Inactive',
      photo:""
    })
    if (referrer) {
      const sponser = await User.findById({ referalCode: referrer.referredBy })
      sponser.downline.push(newUser._id)
      await sponser.save()
    }
    await newUser.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200, { newUser }, "user create successfully"
        )
      )
  } catch (error) {
    throw new ApiError(
      500, error?.message, "error while creating user"
    )
  }
})

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
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
    const loggedInUser = await User.findById(user._id).select("_password -refreshToken")

    // cookies(cannot be modified in frontend only server can)
    const options = {
      httpOnly: true,
      secure: true
    }

    return res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', refreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            user: loggedInUser, accessToken, refreshToken
          },
          "user logged in succesfully"
        )
      )

  } catch (error) {
    throw new ApiError(
      500, error?.message, "error while loging the user"
    )
  }
})

const logoutUser = asyncHandler(async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $unset: {
          refreshToken: 1
        }
      },
      {
        new: true
      }
    )
    const options = {
      httpOnly: true,
      secure: true
    }
    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json(
        new ApiResponse(
          200, {}, "User logout successfully"
        )
      )
  } catch (error) {
    throw new ApiError(
      500,
      error?.message,
      "error while logout the user"
    )
  }
})

// get single user;
const getSingleUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  try {
    const cachedUser = await redisClient.get(`user:${userId}`)
    if (cachedUser) {
      return res.status(200).json(JSON.parse(cachedUser));
    }

    // if not in cache fetch from database
    const user = await User.findById(userId)
    if (!user) {
      throw new ApiError(400, "user not found")
    }
    await redisClient.setEx(`user:${userId}`, 3600, JSON.stringify(user))

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { user },
          "user get successfully"
        )
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while get a user")
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
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

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
    const photo = photoUrl.secure_url;

    const updateFeilds = {
      ...(name && { name }), //update name if provided
      ...(invest === 100 && { status: "Active" }),
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
      error?.message,
      "error while updating a user"
    )
  }

})

// distribute commission for every users
const userCommission = asyncHandler(async (req, res) => {
  const { amount = 100 } = req.body;

  try {
    const user = await User.findById(req.user._id)
    if (!user) {
      throw new ApiError(401, "user not found")
    }

    let currentReffererId = user.referredBy;
    let level = 1
    const commissionRates = [30, 20, 10]

    while (currentReffererId && level <= commissionRates.length) {
      const sponser = await User.findById({ referalCode: currentReffererId })
      if (sponser) {
        const commission = (amount * commissionRates[level - 1]) / 100;

        sponser.earnings += commission;
        sponser.transactions.push({
          amount: commission,
          fromUser: req.user?._id,
        })

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
        200,
        {},
        'commissions distributed.'
      )
  } catch (error) {
    throw new ApiError(500, error?.message, "error while distributied commission")
  }
})

// get user earnings and downline states
const getUserStats = asyncHandler(async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(req.user?._id) }
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

    redisClient.setEx(`userStats:${req.user?._id}`,3600,JSON.stringify(stats))
    return res
    .status(200)
    .json(
      200,
      {
       user: stats[0]
      },
      "get user stats and downline"
    )
  } catch (error) {
    throw new ApiError(500,error?.message,"error while getting the user stats")
  }
})

const paymentSchema = asyncHandler(async(req,res) => {
  const {FromNumber,ToNumber,Amount} = req.body;
  if(!FromNumber || !ToNumber || !Amount) {
    throw new ApiError(400,"all feilds are requred")
  }

  try {
    const payment = await Payment.create({
      FromNumber,
      ToNumber,
      Amount,
      status: "pending"
    })

    if(!payment) {
      throw new ApiError(400,"payment not create")
    }

    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {payment},
        "payment create"
      )
    )
  } catch (error) {
    throw new ApiError(500,error?.message,"error while creating payment")
  }
})

// payment confirmation
const paymentConfirmation = asyncHandler(async(req,res) => {
  try {
    const {paymentId} = req.body;
    const userId = req.user?._id;
    if(!paymentId) {
      throw new ApiError(400,"payment id is required")
    }

    const payment = await Payment.findById(paymentId)
    if(!payment) {
      throw new ApiError(500,"payment not found")
    }

    const user = await User.findById(userId)
    if(!user) {
      throw new ApiError(400,"user not found")
    }

    if((payment.status === "pending")&& (payment.Amount === 100)) {
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
    }

    await payment.save({validateBeforeSave: false})
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {user},
        "payment confirmation succesfully"
      )
    )
  } catch (error) {
    throw new ApiError(500,error?.message,"error while getting payment confirmation")
  }
})

// payment requested
const paymentRequsted = asyncHandler(async(req,res) => {
  const {type,number,confirmNumber} = req.body;
  if(!type || !number || !confirmNumber) {
    throw new ApiError(400,"all feilds are requred")
  }
  if(!(number === confirmNumber)) {
    throw new ApiError(400,"confirm number and number should be same")
  }

  try {
    const paymentRequeste = await PaymentRequeste.create({
      type,
      number,
      confirmNumber,
    })
    if(!paymentRequeste) {
      throw new ApiError(400,"payment requste not create")
    }

    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {paymentRequeste},
        "payment request successful"
      )
    )
  } catch (error) {
    throw new ApiError(500,error?.message,"error while getting payment requested")
  }
})


export {
  userRegister,
  userLogin,
  logoutUser,
  getSingleUser,
  updatePassword,
  refreshAccessToken,
  updateUser,
  userCommission,
  getUserStats,
  paymentSchema,
  paymentConfirmation,
  paymentRequsted
}