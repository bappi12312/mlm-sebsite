import stream from 'stream';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
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

const uploadOnCloudinary = async (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "course_images",
        public_id: `course-${Date.now()}-${path.parse(originalname).name}`
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
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