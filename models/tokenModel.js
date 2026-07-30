const { query } = require('../config/db');

// ---------- Refresh tokens ----------
const storeRefreshToken = async (userId, tokenHash, expiresAt) => {
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
};

const findValidRefreshToken = async (userId, tokenHash) => {
  const { rows } = await query(
    `SELECT * FROM refresh_tokens
     WHERE user_id = $1 AND token_hash = $2 AND revoked = FALSE AND expires_at > NOW()`,
    [userId, tokenHash]
  );
  return rows[0];
};

const revokeRefreshToken = async (tokenHash) => {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
};

const revokeAllUserRefreshTokens = async (userId) => {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
};

// ---------- Password reset tokens ----------
const storeResetToken = async (userId, tokenHash, expiresAt) => {
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
};

const findValidResetToken = async (tokenHash) => {
  const { rows } = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0];
};

const markResetTokenUsed = async (id) => {
  await query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [id]);
};

module.exports = {
  storeRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  storeResetToken,
  findValidResetToken,
  markResetTokenUsed,
};
