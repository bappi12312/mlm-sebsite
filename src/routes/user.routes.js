import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import {
  userRegister,
  userLogin,
  logoutUser,
  getSingleUser,
  updatePassword,
  refreshAccessToken,
  updateUser
} from "../controllers/user.controller";

const router = Router()

router.route("/register").post(userRegister)
router.route("/login").post(userLogin)
router.route("/logout").post(verifyJWT,logoutUser)
router.route("/user/:userId").get(verifyJWT,getSingleUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT,updatePassword)
router.route("/update-user").patch(verifyJWT,upload.single("photo"),updateUser)

export default router
