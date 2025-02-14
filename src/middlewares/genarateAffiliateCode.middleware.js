const generateAffiliateCode = () => {
  return crypto.randomBytes(8).toString('hex');
};

export {
  generateAffiliateCode
}