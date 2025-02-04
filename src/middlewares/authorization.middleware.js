import { ApiError } from "../utils/ApiError";

const authorize = (role) => (req, _, next) => {
  if (req.user.role !== role) {
    throw new ApiError(403, "You are not authorized to perform this action")
  }
  next();
};

export {
  authorize
}