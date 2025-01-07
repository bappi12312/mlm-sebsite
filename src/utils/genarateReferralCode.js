import { User } from "../models/user.model.js";

const genarateReferralCode = async() => {
  let code;
  let exists;

  do {
    code = Math.random().toString(36).substring(2,10)
    exists= await User.findOne({referalCode: code})
  } while (exists);

  return code;
}

export {
  genarateReferralCode
}