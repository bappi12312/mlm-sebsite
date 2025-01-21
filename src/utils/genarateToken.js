import { User } from "../models/user.model.js"
import { ApiError } from "./ApiError.js"

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    console.log("User object:");  // Log the user object to check its value
    if (!user) {
      throw new Error("User not found");
    }
  
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error in generateAccessAndRefreshTokens:", error);
    throw new ApiError(500, "Something went wrong while generating refresh and access token");
  }
};


export {
  generateAccessAndRefreshTokens,
}
