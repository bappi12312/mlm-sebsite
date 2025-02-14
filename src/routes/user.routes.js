import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import rateLimit from "express-rate-limit"
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
  getAllPayment,
  paymentRequsted,
  paymentConfirmation,
  getAllPaymentRequeste,
  getAllUsers,
  getSingleUser,
  deleteAUser
} from "../controllers/user.controller.js";
import { validateIdParam } from "../middlewares/validate.middleware.js";
import { activateAffiliate,coursePurchase,getAffiliateStats, updateUserStatus, } from "../controllers/coursePurchase.controller.js";

// Protect purchase endpoint:
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // Limit each IP to 5 requests per windowMs
});


const router = Router()

router.route("/register").post(limiter,userRegister)
router.route("/login").post(limiter,userLogin)
router.route("/logout").post(limiter,verifyJWT,logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT,updatePassword)
router.route("/update-user").patch(verifyJWT,upload.single("photo"),updateUser)
router.route("/distribute-commision").patch(verifyJWT,userCommission)
router.route("/payment-creation").post(verifyJWT,paymentCreation)
router.route("/getAllPayment").get(verifyJWT,getAllPayment)
router.route("/get-user-stats").get(verifyJWT,getUserStats)
router.route("/paymentRequest").post(verifyJWT,paymentRequsted)
router.route("/payment-confirmation").patch(verifyJWT,paymentConfirmation)
router.route("/get-allPayment-request").get(verifyJWT,getAllPaymentRequeste)
router.route("/get-all-users").get(verifyJWT,getAllUsers)
router.route("/profile").get(verifyJWT,getSingleUser)
router.route("/delete-user/:id").delete(verifyJWT,validateIdParam,deleteAUser)
router.route("/activate-affiliate").post(verifyJWT,activateAffiliate)
router.route("/course-purchase").post(verifyJWT,limiter,coursePurchase)
router.route("/get-affiliate-stats").get(verifyJWT,getAffiliateStats)
router.route("/update-user-status/:userId").patch(verifyJWT,limiter,updateUserStatus)


export default router
