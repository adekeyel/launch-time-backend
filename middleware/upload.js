const multer = require('multer');
const { ApiError } = require('../utils/response');

// Memory storage: files never touch disk here — the buffer is streamed
// straight to Cloudinary in the controller. This is what makes "upload
// directly from device" work without ever needing a client-supplied URL.
const storage = multer.memoryStorage();

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

const fileFilter = (req, file, cb) => {
  if (![...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(file.mimetype)) {
    return cb(new ApiError(400, 'Only JPEG, PNG, WEBP, GIF images or MP4/MOV/WEBM videos are allowed.'));
  }
  cb(null, true);
};

// 50MB covers a short (≈30-60s) video clip comfortably while still keeping
// requests reasonable; images will almost always be far smaller than this.
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = upload;
