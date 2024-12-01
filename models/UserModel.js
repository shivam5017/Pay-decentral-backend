const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true },
  walletAddress: { type: String, required: true },
  planId: { type: String, required: true },  
  transactionSignature: { type: String, required: true },
  developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Developer', required: true }, 
  createdAt: { type: Date, default: Date.now },
});

const UserModel = module.exports = mongoose.model('User', UserSchema);
module.exports={UserModel};
