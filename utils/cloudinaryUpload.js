const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

/**
 * Uploads an in-memory file buffer straight to Cloudinary — no temp files,
 * no client ever needs to send a URL. resource_type "auto" lets one
 * endpoint accept both images and short video clips.
 *
 * @param {Buffer} buffer   raw file bytes from multer's memory storage
 * @param {Object} opts
 * @param {string} opts.folder        Cloudinary folder, e.g. "launch-time/foods"
 * @param {number} [opts.maxDuration] for videos, reject anything longer than this (seconds)
 * @returns {Promise<{url: string, publicId: string, resourceType: 'image'|'video', duration?: number}>}
 */
function uploadBufferToCloudinary(buffer, { folder, maxDuration } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto', // auto-detects image vs video
      },
      (error, result) => {
        if (error) return reject(error);

        if (result.resource_type === 'video' && maxDuration && result.duration > maxDuration) {
          // Clean up the just-uploaded oversized clip so it doesn't linger in the account
          cloudinary.uploader.destroy(result.public_id, { resource_type: 'video' }).catch(() => {});
          return reject(
            new Error(`Video is too long (${Math.round(result.duration)}s). Max allowed is ${maxDuration}s.`)
          );
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type, // 'image' | 'video'
          duration: result.duration || null,
        });
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

/**
 * Deletes a previously uploaded asset (used when replacing/removing media
 * so orphaned files don't pile up in the Cloudinary account).
 */
function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});
}

module.exports = { uploadBufferToCloudinary, deleteFromCloudinary };
