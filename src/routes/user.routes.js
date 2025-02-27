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
  deleteAUser,
  updateUserPakagelink,
  giveEarningsEachUser,
  deleteAPayment,
  deletePaymentRequest
} from "../controllers/user.controller.js";
import { validateIdParam } from "../middlewares/validate.middleware.js";
import { activateAffiliate,coursePurchase,getAffiliateStats, updateUserStatus, createCourse,deleteCourse, getCourseById,getAllCourses,updateCourse, getAffiliateSales } from "../controllers/coursePurchase.controller.js";

// Protect purchase endpoint:
// In your rate limiter config
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later"
});


const router = Router()

router.route("/register").post(limiter,userRegister)
router.route("/login").post(limiter,userLogin)
router.route("/logout").post(limiter,verifyJWT,logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT,updatePassword)
router.route("/update-user").patch(verifyJWT,upload.single("photo"),updateUser)
router.route("/distribute-commision/:userId").patch(verifyJWT,limiter,userCommission)
router.route("/payment-creation").post(verifyJWT,paymentCreation)
router.route("/getAllPayment").get(verifyJWT,getAllPayment)
router.route("/get-user-stats").get(verifyJWT,getUserStats)
router.route("/paymentRequest").post(verifyJWT,limiter,paymentRequsted)
router.route("/payment-confirmation").patch(verifyJWT,limiter,paymentConfirmation)
router.route("/get-allPayment-request").get(verifyJWT,getAllPaymentRequeste)
router.route("/get-all-users").get(verifyJWT,getAllUsers)
router.route("/profile").get(verifyJWT,getSingleUser)
router.route("/delete-user/:id").delete(verifyJWT,validateIdParam,deleteAUser)
router.route("/activate-affiliate/:userId").patch(verifyJWT,limiter,activateAffiliate)
router.route("/course-purchase").post(verifyJWT,limiter,coursePurchase)
router.route("/get-affiliate-stats").get(verifyJWT,getAffiliateStats)
router.route("/update-user-status/:userId").patch(verifyJWT,limiter,updateUserStatus)
router.route("/create-course").post(verifyJWT,upload.single("image"),limiter,createCourse)
router.route("/delete-course/:courseId").delete(verifyJWT,limiter,deleteCourse)
router.route("/get-course-by-id/:courseId").get(verifyJWT,limiter,getCourseById)
router.route("/get-all-courses").get(verifyJWT,limiter,getAllCourses)
router.route("/update-course/:courseId").patch(verifyJWT,upload.single("image"),limiter,updateCourse)
router.route("/affiliate-sales/:userId").get(verifyJWT,limiter,getAffiliateSales);
router.route("/update-pakage-link").patch(verifyJWT,limiter,updateUserPakagelink);
router.route("/give-earnings-each-user").patch(verifyJWT,limiter,giveEarningsEachUser);
router.route("/delete-a-payment/:id").delete(verifyJWT,limiter,deleteAPayment);
router.route("/delete-payment-request/:id").delete(verifyJWT,limiter,deletePaymentRequest);



export default router
