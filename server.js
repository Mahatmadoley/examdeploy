require('dotenv').config();
const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup
const upload = multer({ dest: uploadDir });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AWS S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const bucketName = process.env.AWS_BUCKET_NAME;

// ----------------------
// API: List all files
// ----------------------
app.get('/api/files', async (req, res) => {
  try {
    const data = await s3.listObjectsV2({ Bucket: bucketName }).promise();
    const files = Array.isArray(data.Contents) ? data.Contents.map(f => f.Key) : [];
    res.json(files);
  } catch (err) {
    console.error("❌ S3 List Error:", err);
    res.status(500).json({
      error: 'Failed to list files',
      details: err.message,
      code: err.code || null
    });
  }
});

// ----------------------
// API: Upload file
// ----------------------
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileStream = fs.createReadStream(req.file.path);
  const params = {
    Bucket: bucketName,
    Key: req.file.originalname,
    Body: fileStream,
  };

  s3.upload(params, (err, data) => {
    // Remove temp file
    fs.unlink(req.file.path, unlinkErr => {
      if (unlinkErr) console.error("❌ Failed to delete temp file:", unlinkErr);
    });

    if (err) {
      console.error("❌ S3 Upload Error:", err);
      return res.status(500).json({
        error: 'Upload failed',
        details: err.message,
        code: err.code || null
      });
    }

    res.json({ message: 'Upload successful', url: data.Location });
  });
});

// ----------------------
// API: Get signed URL for download
// ----------------------
app.get('/api/download/:filename', (req, res) => {
  const params = { Bucket: bucketName, Key: req.params.filename, Expires: 60 }; // URL valid for 60 seconds

  s3.getSignedUrl('getObject', params, (err, url) => {
    if (err) {
      console.error("❌ S3 Download Error:", err);
      return res.status(404).json({
        error: 'File not found',
        details: err.message,
        code: err.code || null
      });
    }

    res.json({ url });
  });
});

// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
