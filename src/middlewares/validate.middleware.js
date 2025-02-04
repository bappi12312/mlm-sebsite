import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";

const validateIdParam = (req, _, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid ID format");
  }
  next();
};

export { validateIdParam };