import { User } from "../models/user.model.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {ApiResponse} from "../utils/ApiResponse.js"
import mongoose from "mongoose";
import { AffiliateSale } from "../models/affiliateSale.model.js";
import { Course } from "../models/coursePakageSchema.model.js";
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import fs from "fs"; 

const coursePurchase = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
 
  try {
    const {courseId, affiliateCode} = req.body;
    const course = await Course.findById(courseId).session(session);
    if(!course){
      throw new ApiError(404,"Course not found")
    }
    const user = await User.findById(req.user._id).session(session);
    if(!user){
      throw new ApiError(404,"User not found")
    }

    let affiliate = null;
    if(affiliateCode){
      affiliate = await User.findOne({referalCode: affiliateCode}).session(session);
      if(!affiliate){
        throw new ApiError(404,"Affiliate not found")
      }
    }

    if(!user.isPayForCourse) {
      throw new ApiError(403,"you must pay for the course first")
    }

    let sale = null;
    const commissionRecords = [];
    const bulkUpdateOps = [];

    if(affiliate) {
      const commission = course.price * 0.20;
      const uplineCommission = [
        commission * 0.04,
        commission * 0.03,
        commission * 0.02,
      ]

       sale = new AffiliateSale ({
        buyer: user._id,
        affiliate: affiliate._id,
        course: course._id,
        amount: course.price,
        commission: commission,
      })
      await sale.save({session})

      bulkUpdateOps.push({
        updateOne:{
          filter: {_id: affiliate._id},
          update: {
            $inc: {affiliateBalance: commission},
            $push: {affiliateSales: sale._id}
          }
        }
      });

      const uplineIds =affiliate.uplines?.slice(0,3) || [];
      if(uplineIds.length > 0) {
        const uplineUsers = await User.find({_id: {$in: uplineIds}}).select("_id").session(session)

        uplineUsers.forEach((uplineUser, index) => {
          if(index < 3) {
            const commissionAmount = uplineCommission[index]

            bulkUpdateOps.push({
              updateOne: {
                filter: { _id: uplineUser._id },
                update: {
                  $inc: { affiliateBalance: commissionAmount },
                },
              },
            });

            commissionRecords.push({
              userId: uplineUser._id,
              amount: commissionAmount,
              level: index + 1,
              fromUser: user._id,
              sale: sale._id,
              type: 'upline'
            })
          }
        })
      }
    }

    if (bulkUpdateOps.length > 0) {
      await User.bulkWrite(bulkUpdateOps, { session });
    }

    // // Insert all commission records at once
    // if (commissionRecords.length > 0) {
    //   await Commission.insertMany(commissionRecords, { session });
    // }

    await user.save({ session })
    await session.commitTransaction();
    res
    .status(200)
    .json(
      new ApiResponse(200,{},"Course purchased successfully")
    )
  } catch (error) {
    await session.abortTransaction();

    throw new ApiError(500, error?.message || "Something went wrong")
  }finally {
    session.endSession();
  }
});

const activateAffiliate = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    if (user.isAffiliate) {
      throw new ApiError(400, "User is already an affiliate");
    }

    const invest = 250;
    const bulkUpdateOps = [];
    const commissionRecords = [];

    if (user.isPay) {
      user.isAffiliate = true;

      const uplineCommission = [invest * 0.20, invest * 0.15, invest * 0.10];

      const uplineFields = user.uplines?.slice(0, 3) || [];

      if (uplineFields.length > 0) {
        const uplineUsers = await User.find({ _id: { $in: uplineFields } })
          .select("_id")
          .session(session);

        uplineUsers.forEach((uplineUser, index) => {
          const commissionAmount = uplineCommission[index];

          bulkUpdateOps.push({
            updateOne: {
              filter: { _id: uplineUser._id },
              update: { $inc: { affiliateBalance: commissionAmount } },
            },
          });

          commissionRecords.push({
            userId: uplineUser._id,
            amount: commissionAmount,
            level: index + 1,
            fromUser: user._id,
          });
        });
      }

      if (bulkUpdateOps.length > 0) {
        await User.bulkWrite(bulkUpdateOps, { session });
      }

      // if (commissionRecords.length > 0) {
      //   await Commission.insertMany(commissionRecords, { session });
      // }

      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json(new ApiResponse(200, {}, "User is now an affiliate"));
    }

    await session.abortTransaction();
    session.endSession();
    
    return res.status(400).json(new ApiResponse(400, {}, "User is not eligible to become an affiliate"));

  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(500, error?.message || "Something went wrong");
  } finally {
    session.endSession();
  }
});

const getAffiliateStats = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate({
      path: 'affiliateSales',
      populate: {
        path: 'course',
        select: 'name price'
      }
    });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const totalCommission = user.affiliateSales.reduce((total, sale) => total + sale.commission, 0);

  res.status(200).json(
    new ApiResponse(200, { totalCommission, totalSales: user.affiliateSales?.length },"getAffiliateStats successful")
  );
});

const updateUserStatus = asyncHandler(async(req, res) => {
  const {userId} = req.params;
  const updateData = req.body;

  if(!mongoose.Types.ObjectId.isValid(userId)){
    throw new ApiError(400, "Invalid ID format");
  }

  const allowedUpdateFields = {
    isPayForCourse: (val) => typeof val === 'boolean',
    isPay: (val) => typeof val === 'boolean',
    isAffiliate: (val) => typeof val === 'boolean',
    status: (val) => ['Active', 'Inactive'].includes(val),
  }

  const updateUpdates = {};

  for(const [key,validator] of Object.entries(allowedUpdateFields)){
    if(updateData[key] !== undefined){
      if(validator(updateData[key])){
        updateUpdates[key] = updateData[key];
      }else{
        throw new ApiError(400, `Invalid ${key} value`);
      }
    }
  }

  if(Object.keys(updateUpdates).length === 0){
    throw new ApiError(400, "No fields to update");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updatedUser = await User.findOneAndUpdate(
      {_id: userId},
      {$set: updateUpdates},
      {
        new: true,
        runValidators: true,
        session,
        select: "name email isPayForCourse isPay isAffiliate status"
      }
    )

    if(!updatedUser){
      throw new ApiError(404, "User not found");
    }

    await session.commitTransaction();

    res.status(200).json(new ApiResponse(200, updatedUser, "User status updated successfully"));
  } catch (error) {
    throw new ApiError(400, error?.message || "Something went wrong");
  } finally {
    session.endSession();
  }
})


// Create Course Controller
const createCourse = asyncHandler(async (req, res) => {
  const { name, price, description,category } = req.body;

  // Validate request before file handling
   // Enhanced validation
   if (!name?.trim() || !price) {
    throw new ApiError(400, "Name and price are required fields");
  }

  if (isNaN(price) || Number(price) <= 0) {
    throw new ApiError(400, "Price must be a valid positive number");
  }

  if (!req.file) {
    throw new ApiError(400, "Course image is required");
  }

  const session = await mongoose.startSession();
  let imagePath = req.file.path;

  try {
    session.startTransaction();

    // Check for existing course
    const existingCourse = await Course.findOne({ name }).session(session);
    if (existingCourse) {
      fs.unlinkSync(imagePath);
      throw new ApiError(409, "Course with this name already exists");
    }

    // Upload to Cloudinary
    const imageUpload = await uploadOnCloudinary(imagePath);
    if (!imageUpload?.secure_url) {
      throw new ApiError(400, "Image upload failed. Please try again.");
    }

    // Create course
    const newCourse = await Course.create([{
      name,
      price,
      description: description || "",
      status: "active",
      image: imageUpload.secure_url
    }], { session });

    await session.commitTransaction();
    
    return res.status(201).json(
      new ApiResponse(201, newCourse[0], "Course created successfully")
    );
    
  } catch (error) {
    // Cleanup files on error
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// Update Course Controller
const updateCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new ApiError(400, "Invalid course ID");
  }

  const allowedUpdates = {
    name: (val) => typeof val === 'string' && val.length > 0,
    price: (val) => typeof val === 'number' && val > 0,
    description: (val) => typeof val === 'string',
    status: (val) => ['active', 'inactive'].includes(val)
  };

  const validUpdates = {};
  for (const [key, validator] of Object.entries(allowedUpdates)) {
    if (updates[key] !== undefined && validator(updates[key])) {
      validUpdates[key] = updates[key];
    }
  }

  if (Object.keys(validUpdates).length === 0) {
    throw new ApiError(400, "No valid updates provided");
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: validUpdates },
      {
        new: true,
        runValidators: true,
        session,
        lean: true
      }
    );

    if (!updatedCourse) {
      throw new ApiError(404, "Course not found");
    }

    await session.commitTransaction();

    return res.status(200).json(
      new ApiResponse(200, updatedCourse, "Course updated successfully")
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// Delete Course Controller
const deleteCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new ApiError(400, "Invalid course ID");
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const course = await Course.findById(courseId).session(session);
    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    // Delete related affiliate sales in transaction
    await AffiliateSale.deleteMany({ course: courseId }).session(session);
    
    await Course.deleteOne({ _id: courseId }).session(session);
    
    await session.commitTransaction();

    return res.status(200).json(
      new ApiResponse(200, {}, "Course deleted successfully")
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// Get All Courses Controller
const getAllCourses = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, sort = '-createdAt' } = req.query;

  try {
    // Validate and parse inputs
    const parsedPage = Math.max(1, parseInt(page)) || 1;
    const parsedLimit = Math.min(Math.max(1, parseInt(limit)), 100) || 10;

    // Build query
    const query = {};
    if (status && ['active', 'inactive'].includes(status)) {
      query.status = status;
    }

    // Build options
    const options = {
      page: parsedPage,
      limit: parsedLimit,
      sort,
      select: 'name price description status courseCode image createdAt',
      lean: true
    };

    // Execute paginated query
    const result = await Course.paginate(query, options);

    return res.status(200).json(
      new ApiResponse(200, {
        totalItems: result.totalDocs,
        totalPages: result.totalPages,
        currentPage: result.page,
        itemsPerPage: result.limit,
        courses: result.docs
      }, "Courses retrieved successfully")
    );
    
  } catch (error) {
    console.error('Course retrieval error:', error);
    throw new ApiError(500, "Failed to retrieve courses. Please try again later.");
  }
});

// Get Single Course Controller
const getCourseById = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  // const { includeSales } = req.query;

  try {
    // Validate course ID format
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new ApiError(400, "Invalid course ID format");
    }

    // Build base query
    const query = Course.findById(courseId).lean();

    // //  Conditionally populate sales
    // if (includeSales === 'true') {
    //   query.populate({
    //     path: 'affiliateSales',
    //     select: 'amount commission createdAt buyer',
    //     options: { 
    //       limit: 10,
    //       sort: { createdAt: -1 } 
    //     },
    //     populate: {
    //       path: 'buyer',
    //       select: 'name email'
    //     },
    //     strictPopulate: false, // Optional: Bypass strict population checks
    //   });
    // }

    const course = await query.exec();

    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    return res.status(200).json(
      new ApiResponse(200, course, "Course retrieved successfully")
    );

  } catch (error) {
    console.error("Course retrieval error details:", error);
    
    // Handle specific mongoose errors
    if (error.name === 'CastError') {
      throw new ApiError(400, "Invalid course ID format");
    }
    
    // Handle population errors
    if (error.message.includes('MissingSchemaError')) {
      throw new ApiError(500, "Data relationship configuration error");
    }

    // Pass through existing ApiErrors
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(500, error.message || "Failed to retrieve course details");
  }
});


const getAffiliateSales = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  // Validate input parameters
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (isNaN(page) || isNaN(limit)) {
    throw new ApiError(400, "Invalid pagination parameters");
  }

  try {
    // Check if user exists
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      throw new ApiError(404, "User not found");
    }

    // Aggregation pipeline for optimized query
    const pipeline = [
      {
        $match: {
          affiliate: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "course"
        }
      },
      {
        $unwind: "$course"
      },
      {
        $lookup: {
          from: "users",
          localField: "buyer",
          foreignField: "_id",
          as: "buyer"
        }
      },
      {
        $unwind: "$buyer"
      },
      {
        $project: {
          "buyer.password": 0,
          "buyer.refreshToken": 0,
          "buyer.__v": 0
        }
      },
      {
        $facet: {
          metadata: [
            { $count: "totalSales" },
            {
              $addFields: {
                currentPage: parseInt(page),
                limit: parseInt(limit)
              }
            }
          ],
          data: [
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
          ]
        }
      },
      {
        $unwind: "$metadata"
      }
    ];

    const result = await AffiliateSale.aggregate(pipeline);

    if (result.length === 0) {
      return res.status(200).json(
        new ApiResponse(200, {
          totalSales: 0,
          currentPage: 1,
          totalPages: 0,
          sales: []
        }, "No sales found for this affiliate")
      );
    }

    const responseData = {
      totalSales: result[0].metadata.totalSales,
      currentPage: result[0].metadata.currentPage,
      totalPages: Math.ceil(result[0].metadata.totalSales / parseInt(limit)),
      sales: result[0].data
    };

    // Optional: Cache the result in Redis
    // await redisClient.setEx(`affiliateSales:${userId}:${page}:${limit}`, 3600, JSON.stringify(responseData));

    return res.status(200).json(
      new ApiResponse(200, responseData, "Affiliate sales retrieved successfully")
    );

  } catch (error) {
    throw new ApiError(500, error.message || "Failed to retrieve affiliate sales");
  }
});


export {
  activateAffiliate,
  coursePurchase,
  getAffiliateStats,
  updateUserStatus,
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getAffiliateSales
}
