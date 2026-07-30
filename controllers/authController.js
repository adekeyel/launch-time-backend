const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const vendorModel = require('../models/vendorModel');
const tokenModel = require('../models/tokenModel');
const { ApiError, ok } = require('../utils/response');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateRandomToken,
} = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/email');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth',
};

const buildAuthResponse = async (res, user) => {
  const payload = { sub: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await tokenModel.storeRefreshToken(user.id, hashToken(refreshToken), expiresAt);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
};

// POST /api/auth/register
const register = async (req, res) => {
  const { fullname, email, password, phone, role, businessName, address, tagline, categories, eta } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  // Only customer/vendor may self-register; admins are created via seed/admin panel only.
  const finalRole = role === 'vendor' ? 'vendor' : 'customer';

  const hashed = await bcrypt.hash(password, 12);
  const user = await userModel.create({ fullname, email, password: hashed, role: finalRole, phone });

  if (finalRole === 'vendor') {
    if (!businessName) {
      throw new ApiError(422, 'businessName is required when registering as a vendor.');
    }
    await vendorModel.create({
      userId: user.id,
      businessName,
      address,
      phone,
      description: null,
      tagline: tagline || null,
      categories: Array.isArray(categories) ? categories : [],
      eta: eta || null,
    });
  }

  const accessToken = await buildAuthResponse(res, user);
  return ok(res, { user, accessToken }, 'Registration successful.', 201);
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (!user.is_active) {
    throw new ApiError(403, 'This account has been deactivated. Contact support.');
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  delete user.password;
  const accessToken = await buildAuthResponse(res, user);
  return ok(res, { user, accessToken }, 'Login successful.');
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw new ApiError(401, 'No refresh token provided.');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Refresh token invalid or expired. Please log in again.');
  }

  const stored = await tokenModel.findValidRefreshToken(decoded.sub, hashToken(token));
  if (!stored) {
    throw new ApiError(401, 'Refresh token has been revoked. Please log in again.');
  }

  const user = await userModel.findById(decoded.sub);
  if (!user || !user.is_active) {
    throw new ApiError(401, 'Account not found or deactivated.');
  }

  // Rotate: revoke the old refresh token and issue a fresh pair
  await tokenModel.revokeRefreshToken(hashToken(token));
  const accessToken = await buildAuthResponse(res, user);
  return ok(res, { user, accessToken }, 'Token refreshed.');
};

// POST /api/auth/logout
const logout = async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await tokenModel.revokeRefreshToken(hashToken(token));
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  return ok(res, null, 'Logged out successfully.');
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await userModel.findByEmail(email);

  // Always return a generic success message so this endpoint can't be used
  // to enumerate which emails have accounts.
  if (user) {
    const rawToken = generateRandomToken();
    const expiresAt = new Date(
      Date.now() + (Number(process.env.RESET_TOKEN_EXPIRES_MIN) || 30) * 60 * 1000
    );
    await tokenModel.storeResetToken(user.id, hashToken(rawToken), expiresAt);

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, user.fullname, resetUrl);
  }

  return ok(res, null, 'If that email exists, a password reset link has been sent.');
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  const record = await tokenModel.findValidResetToken(hashToken(token));
  if (!record) {
    throw new ApiError(400, 'Reset link is invalid or has expired. Please request a new one.');
  }

  const hashed = await bcrypt.hash(password, 12);
  await userModel.updatePassword(record.user_id, hashed);
  await tokenModel.markResetTokenUsed(record.id);
  await tokenModel.revokeAllUserRefreshTokens(record.user_id); // force re-login everywhere

  return ok(res, null, 'Password has been reset successfully. Please log in.');
};

// GET /api/auth/me
const me = async (req, res) => {
  return ok(res, req.user, 'Current user fetched.');
};

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, me };
