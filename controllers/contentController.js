const siteContentModel = require('../models/siteContentModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary } = require('../utils/cloudinaryUpload');
const {
  SECTION_MAP,
  allEffective,
  effectiveSection,
  validateSection,
  publicSchema,
} = require('../utils/contentSchema');

const savedByKey = async () => {
  const rows = await siteContentModel.findAll();
  return Object.fromEntries(rows.map((r) => [r.section, r.content]));
};

// GET /api/settings/content  (public)
// The whole site's editable content: defaults merged with whatever the admin
// has saved. Always complete, so the website never has a hole to fill.
const getContent = async (req, res) => {
  return ok(res, allEffective(await savedByKey()));
};

// GET /api/admin/content  (admin)
// The form definitions plus the current content of every section, and which
// sections have been customised (so the screen can offer "reset to defaults").
const getAdminContent = async (req, res) => {
  const rows = await siteContentModel.findAll();
  const saved = Object.fromEntries(rows.map((r) => [r.section, r.content]));
  return ok(res, {
    schema: publicSchema(),
    content: allEffective(saved),
    customised: Object.fromEntries(rows.map((r) => [r.section, r.updated_at])),
  });
};

// PUT /api/admin/content/:section  { content }  (admin)
const saveSection = async (req, res) => {
  const { section } = req.params;
  if (!SECTION_MAP[section]) throw new ApiError(404, 'Unknown content section.');

  const clean = validateSection(section, req.body?.content);
  const row = await siteContentModel.upsert(section, clean, req.user?.id);
  return ok(
    res,
    { section, content: effectiveSection(section, row.content), updated_at: row.updated_at },
    'Saved. The website now shows this.'
  );
};

// DELETE /api/admin/content/:section  (admin) — back to the built-in defaults
const resetSection = async (req, res) => {
  const { section } = req.params;
  if (!SECTION_MAP[section]) throw new ApiError(404, 'Unknown content section.');
  await siteContentModel.remove(section);
  return ok(res, { section, content: effectiveSection(section, null) }, 'Back to the original content.');
};

// POST /api/admin/content/image  (multipart "image")  (admin)
// For logo fields: uploads straight to Cloudinary and returns the address to
// save in the field. Images only (no video).
const uploadContentImage = async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Choose an image to upload.');
  if (!/^image\//.test(req.file.mimetype)) throw new ApiError(422, 'Only images can be used here.');

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/site' });
  if (uploaded.resourceType !== 'image') throw new ApiError(422, 'Only images can be used here.');
  return ok(res, { url: uploaded.url }, 'Image uploaded.', 201);
};

module.exports = { getContent, getAdminContent, saveSection, resetSection, uploadContentImage };
