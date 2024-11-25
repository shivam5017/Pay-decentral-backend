// server.js
const express = require('express');
const qr = require('qr-image'); // To generate QR codes
const app = express();
const port = 5000;

app.use(express.json());

// Endpoint to generate a Solana Pay URL
app.post('/generate-payment-request', async (req, res) => {
  const { amount, recipientWallet } = req.body;

  try {
    // Create the Solana Pay URL
    const solanaPayUrl = `solana:${recipientWallet}?amount=${amount}`;
    
    // Generate the QR code for the payment URL
    const qrSvg = qr.imageSync(solanaPayUrl, { type: 'svg' });

    // Return the QR code as SVG
    res.type('svg').send(qrSvg);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
