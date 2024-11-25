// netlify/functions/generate-payment-request.js
const qr = require('qr-image'); // To generate QR codes

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const { amount, recipientWallet } = JSON.parse(event.body);

  if (!amount || !recipientWallet) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: amount or recipientWallet' }),
    };
  }

  try {
    // Create the Solana Pay URL
    const solanaPayUrl = `solana:${recipientWallet}?amount=${amount}`;
    
    // Generate the QR code for the payment URL
    const qrSvg = qr.imageSync(solanaPayUrl, { type: 'svg' });

    // Return the QR code as SVG
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
      },
      body: qrSvg.toString('utf8'), 
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
