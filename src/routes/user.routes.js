import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import {
  userRegister,
  userLogin,
  logoutUser,
  updatePassword,
  refreshAccessToken,
  updateUser,
  userCommission,
  getUserStats,
  paymentCreation,
  getAllPayment
} from "../controllers/user.controller.js";

const router = Router()

router.route("/register").post(userRegister)
router.route("/login").post(userLogin)
router.route("/logout").post(verifyJWT,logoutUser)
// router.route("/user/:userId").get(verifyJWT,getSingleUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT,updatePassword)
router.route("/update-user").patch(verifyJWT,upload.single("photo"),updateUser)
// router.route("/delete-user").delete(verifyJWT,deleteUser)
router.route("/distribute-commision").patch(verifyJWT,userCommission)
router.route("/get-user-stats",verifyJWT,getUserStats)
router.route("/payment-creation").post(verifyJWT,paymentCreation)
router.route("/getAllPayment").get(verifyJWT,getAllPayment)


export default router
