const express = require('express');
const cors = require('cors');
const qr = require('qr-image');
const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { validateTransfer } = require('@solana/pay'); 
const connection = require("./db/dbConnect")
const app = express();
app.use(cors());
app.use(express.json());
const { DeveloperModel } = require('./models/DeveloperModel');
const {UserModel}=require('./models/UserModel');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const tokenBlacklist = new Set();

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ success: false, message: 'Token is invalidated' });
  }

  try {
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Backend
app.post('/register-developer', async (req, res) => {
  const { email, companyName, password } = req.body;

  if (!email || !companyName || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email, company name, and password are required',
    });
  }

  try {
    
    const existingDeveloper = await DeveloperModel.findOne({ email });
    if (existingDeveloper) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered',
      });
    }

  
    const hashedPassword = await bcrypt.hash(password, 10);

    
    const apiKey = crypto.randomBytes(20).toString('hex');

    
    const newDeveloper = new DeveloperModel({
      email,
      companyName,
      password: hashedPassword, 
      apiKey,
    });
    await newDeveloper.save();

    res.status(201).json({
      success: true,
      message: 'Developer registered successfully',
      apiKey,
    });
  } catch (error) {
    console.error('Error registering developer:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


const jwt = require('jsonwebtoken');
const secretKey = '7c31f8f6bd39bd5c18b2f0cc36437b6165db1c0176e22eddb91eaab01fb60841'; 

app.post('/login-developer', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required',
    });
  }

  try {
    const developer = await DeveloperModel.findOne({ email });
    if (!developer) {
      return res.status(404).json({ success: false, message: 'Developer not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, developer.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ id: developer._id, email: developer.email }, secretKey, {
      expiresIn: '1h', // Token expires in 1 hour
    });


    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      developer
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



app.post('/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required for logout' });
  }

  // Add token to blacklist
  tokenBlacklist.add(token);

  res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
});


app.post('/generate-payment-request', async (req, res) => {
  const { amount, recipientWallet } = req.body;

  // Validate that the amount and recipientWallet are provided and valid
  if (!amount || !recipientWallet) {
    return res.status(400).json({ success: false, error: 'Amount and recipientWallet are required' });
  }

  // Ensure amount is a valid number
  if (isNaN(amount) || Number(amount) <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be a valid positive number' });
  }

  // Ensure the recipient wallet address is a valid Solana wallet (basic validation)
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Basic regex for Solana addresses
  if (!solanaAddressRegex.test(recipientWallet)) {
    return res.status(400).json({ success: false, error: 'Invalid Solana wallet address' });
  }

  try {
    // Create the Solana Pay URL
    const solanaPayUrl = `solana:${recipientWallet}?amount=${amount}&network=devnet`;

    // Generate the QR code for the payment URL
    const qrSvg = qr.imageSync(solanaPayUrl, { type: 'svg' });

    // Return the QR code as SVG
    res.type('svg').send(qrSvg);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/verify-payment', async (req, res) => {
  const { 
    transactionSignature, 
    recipientWallet, 
    amount, 
    userEmail, 
    developerApiKey, 
    userWallet, 
    planId 
  } = req.body;

  // Validate request body
  if (!transactionSignature || !recipientWallet || !amount || !userEmail || !developerApiKey || !userWallet || !planId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const recipientPublicKey = new PublicKey(recipientWallet);
    const userPublicKey = new PublicKey(userWallet);  // User wallet (sender)
    const expectedAmount = Number(amount); // Amount in lamports

    // Poll transaction status to ensure it's finalized
    let isTransactionConfirmed = false;
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await connection.getSignatureStatuses([transactionSignature]);
      const transactionStatus = status?.value[0];

      if (transactionStatus?.confirmationStatus === 'finalized') {
        isTransactionConfirmed = true;
        break;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds
    }

    if (!isTransactionConfirmed) {
      return res.status(400).json({ success: false, error: 'Transaction not finalized. Please try again.' });
    }

    // Fetch the transaction details to confirm the sender (user's wallet)
    const transactionDetails = await connection.getTransaction(transactionSignature);

    // Ensure the sender's wallet is the user's wallet
    if (transactionDetails.transaction.message.accountKeys[0].toBase58() !== userWallet) {
      return res.status(400).json({ success: false, error: 'Payment was not made by the correct wallet.' });
    }

    // Validate the transaction with the Solana Pay library
    const isValid = await validateTransfer(connection, transactionSignature, {
      recipient: recipientPublicKey,
      amount: expectedAmount,
    });

    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Payment details do not match' });
    }

    // Find the developer by API key
    const developer = await DeveloperModel.findOne({ apiKey: developerApiKey });

    if (!developer) {
      return res.status(404).json({ success: false, error: 'Developer not found' });
    }

    // Check if the user already exists
    const existingUser = await UserModel.findOne({
      email: userEmail,
      developerId: developer._id,
    });

    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully, user already exists',
      });
    }

    // Create a new user record with dynamic planId
    const newUser = new UserModel({
      email: userEmail,
      walletAddress: userWallet, 
      planId: planId, // Save the planId dynamically
      transactionSignature: transactionSignature,
      developerId: developer._id,
    });

    await newUser.save();

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully, user saved',
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/get-verified-payments', async (req, res) => {
  const { developerApiKey } = req.query; // Extract the API key from the query params

  if (!developerApiKey) {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }

  try {
    // Validate the developer API key
    const developer = await DeveloperModel.findOne({ apiKey: developerApiKey });
    if (!developer) {
      return res.status(404).json({ success: false, error: 'Developer not found' });
    }

    // Fetch users associated with the developer
    const users = await UserModel.find({ developerId: developer._id });
    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, error: 'No users found for this developer' });
    }

    // Format user details
    const userDetails = users.map(user => ({
      email: user.email || 'N/A',
      walletAddress: user.walletAddress || 'N/A',
      planId: user.planId || 'N/A',
      transactionSignature: user.transactionSignature || 'N/A',
      createdAt: user.createdAt || 'N/A',
    }));

    // Return success response
    return res.status(200).json({
      success: true,
      users: userDetails,
    });
   
  } catch (error) {
    console.error('Error fetching user data:', error.message);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});



app.get("*", (req, res) => {
  res.status(404).json("not found")
})




const port = process.env.PORT || 5000;
app.listen(port, async () => {
    try {
        await connection;
       
    } catch (error) {
      console.log(error);
    }

})
