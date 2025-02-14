import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "MISSING_CLOUD_NAME",
  api_key: process.env.CLOUDINARY_API_KEY || "MISSING_API_KEY",
  api_secret: process.env.CLOUDINARY_API_SECRET || "MISSING_API_SECRET",
});

console.log("Cloudinary Config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? "✅ Loaded" : "❌ Missing",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "✅ Loaded" : "❌ Missing",
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    // Validate file path
    if (!localFilePath || !fs.existsSync(localFilePath)) {
      throw new Error("Invalid file path or file doesn't exist");
    }

    // Upload to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "course_images"
    });

    // Remove local file after upload
    fs.unlinkSync(localFilePath);
    
    return response;
  } catch (error) {
    // Cleanup local file if exists
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    console.error("Cloudinary upload error:", error);
    return null;
  }
};
const deleteMediaFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.log(error);
  }
};

// const deleteVideoFromCloudinary = async (publicId) => {
//   try {
//     await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
//   } catch (error) {
//     console.log(error);

//   }
// }

export {
  uploadOnCloudinary,
  deleteMediaFromCloudinary,
}