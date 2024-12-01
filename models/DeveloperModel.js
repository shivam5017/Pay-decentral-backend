const mongoose = require('mongoose');

const DeveloperSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  password: { type: String, required: true },
  apiKey: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});




const DeveloperModel=mongoose.model('Developer', DeveloperSchema);
module.exports={DeveloperModel};