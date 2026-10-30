
function verifyGatewaySecret(req, res, next) {
  const secret = req.headers['x-gateway-secret'];

  if (
    !secret ||
    !process.env.GATEWAY_SECRET ||
    secret !== process.env.GATEWAY_SECRET
  ) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Gateway secret tidak valid'
    });
  }

  next();
}

module.exports = { verifyGatewaySecret };
