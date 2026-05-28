/**
 * SHADDAI File Handler
 * Upload PDF/DOCX/TXT files — extract text — inject as agent context
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

// Multer storage: save with unique ID, keep original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(12).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.docx', '.doc', '.md', '.csv', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not supported. Allowed: ${allowed.join(', ')}`));
  }
});

// Extract text from uploaded file based on type
async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  // txt, md, csv, json — read directly
  return fs.readFileSync(filePath, 'utf8');
}

// In-memory file registry (persists until server restart)
// For production: move to database-real.js
const _fileRegistry = new Map();

function registerFile(fileId, meta) {
  _fileRegistry.set(fileId, { ...meta, uploadedAt: new Date().toISOString() });
}

function getFile(fileId) {
  return _fileRegistry.get(fileId) || null;
}

function listFiles() {
  return [..._fileRegistry.values()];
}

function deleteFile(fileId) {
  const meta = _fileRegistry.get(fileId);
  if (meta) {
    try { fs.unlinkSync(meta.diskPath); } catch {}
    try { fs.unlinkSync(meta.textPath); } catch {}
    _fileRegistry.delete(fileId);
    return true;
  }
  return false;
}

module.exports = { upload, extractText, registerFile, getFile, listFiles, deleteFile, UPLOAD_DIR };
