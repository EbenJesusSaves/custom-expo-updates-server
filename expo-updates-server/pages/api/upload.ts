import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, File } from 'formidable';
import fs from 'fs/promises';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Add CORS headers for cross-origin requests
function setCorsHeaders(res: NextApiResponse) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.join(','));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function uploadEndpoint(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Expected POST.' });
    return;
  }

  try {
    const form = new IncomingForm({
      multiples: true,
      keepExtensions: true,
    });

    // Use callback-style parsing instead of promisify
    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });

    const runtimeVersion = Array.isArray(fields.runtimeVersion)
      ? fields.runtimeVersion[0]
      : fields.runtimeVersion;

    const updateId = Array.isArray(fields.updateId) ? fields.updateId[0] : fields.updateId;

    if (!runtimeVersion || !updateId) {
      res.status(400).json({ error: 'Missing runtimeVersion or updateId' });
      return;
    }

    // Create the update directory
    const updatePath = path.join(process.cwd(), 'updates', runtimeVersion, updateId);
    await fs.mkdir(updatePath, { recursive: true });

    // Handle uploaded files
    const fileEntries = Object.entries(files);
    for (const [fieldName, fileData] of fileEntries) {
      const file = Array.isArray(fileData) ? fileData[0] : (fileData as File);

      if (file && file.filepath) {
        let targetPath: string;

        if (fieldName === 'expoConfig') {
          targetPath = path.join(updatePath, 'expoConfig.json');
        } else if (fieldName === 'metadata') {
          targetPath = path.join(updatePath, 'metadata.json');
        } else if (fieldName.startsWith('bundle_')) {
          const bundlePath = path.join(updatePath, 'bundles');
          await fs.mkdir(bundlePath, { recursive: true });
          targetPath = path.join(
            bundlePath,
            path.basename(file.originalFilename || file.newFilename)
          );
        } else if (fieldName.startsWith('asset_')) {
          const assetPath = path.join(updatePath, 'assets');
          await fs.mkdir(assetPath, { recursive: true });
          targetPath = path.join(
            assetPath,
            path.basename(file.originalFilename || file.newFilename)
          );
        } else if (fieldName.startsWith('expo_static_')) {
          // Handle _expo/static files
          const relativePath = fieldName.replace('expo_static_', '').replace(/_/g, '/');
          const staticPath = path.join(updatePath, '_expo', 'static', relativePath);
          await fs.mkdir(path.dirname(staticPath), { recursive: true });
          targetPath = staticPath;
        } else {
          // Default case for other files
          targetPath = path.join(
            updatePath,
            path.basename(file.originalFilename || file.newFilename)
          );
        }

        await fs.copyFile(file.filepath, targetPath);
        await fs.unlink(file.filepath); // Clean up temp file
      }
    }

    res.status(200).json({
      success: true,
      message: 'Update uploaded successfully',
      updatePath: `${runtimeVersion}/${updateId}`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload update' });
  }
}
