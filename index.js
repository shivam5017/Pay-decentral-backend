const express = require('express');
const cors = require('cors');
const qr = require('qr-image');
const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { validateTransfer } = require('@solana/pay'); 

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Endpoint to generate a Solana Pay URL
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
  const { transactionSignature, recipientWallet, amount } = req.body;

  if (!transactionSignature || !recipientWallet || !amount) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const recipientPublicKey = new PublicKey(recipientWallet);
    
    // Convert amount to lamports (check if it's already passed as lamports)
    const expectedAmount = Number(amount); // The backend expects lamports directly
    console.log('Expected Amount (Lamports):', expectedAmount);

    // Poll transaction status to ensure it's finalized
    let isTransactionConfirmed = false;
    const maxAttempts = 10;
    let attempts = 0;

    // Debug: Log the transaction signature and recipient
    console.log('Checking transaction:', transactionSignature);
    console.log('Recipient Wallet:', recipientWallet);

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

    // Validate the transaction with the Solana Pay library
    const isValid = await validateTransfer(connection, transactionSignature, {
      recipient: recipientPublicKey,
      amount: expectedAmount,
    });

    if (isValid) {
      return res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
      return res.status(400).json({ success: false, error: 'Payment details do not match' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
