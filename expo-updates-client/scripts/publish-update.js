#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { execSync } = require('child_process');

// Configuration
const SERVER_URL = process.env.EXPO_UPDATES_SERVER_URL || 'http://localhost:3000';
const RUNTIME_VERSION = process.env.EXPO_RUNTIME_VERSION || '1';

async function publishUpdate() {
  try {
    console.log('🚀 Starting Expo update publish process...');

    // Step 1: Export the Expo project
    console.log('📦 Exporting Expo project...');
    execSync('npx expo export', { stdio: 'inherit' });

    // Step 2: Generate unique update ID
    const updateId = Date.now().toString();
    console.log(`📝 Generated update ID: ${updateId}`);

    // Step 3: Generate Expo config
    console.log('⚙️ Generating Expo config...');
    const ExpoConfig = require('@expo/config');
    const { exp } = ExpoConfig.getConfig(process.cwd(), {
      skipSDKVersionRequirement: true,
      isPublicConfig: true,
    });

    // Step 4: Prepare form data
    const form = new FormData();
    form.append('runtimeVersion', RUNTIME_VERSION);
    form.append('updateId', updateId);

    // Add expo config
    form.append('expoConfig', JSON.stringify(exp), {
      filename: 'expoConfig.json',
      contentType: 'application/json'
    });

    const distPath = path.join(process.cwd(), 'dist');

    // Add metadata.json if it exists
    const metadataPath = path.join(distPath, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      form.append('metadata', fs.createReadStream(metadataPath), {
        filename: 'metadata.json'
      });
    }

    // Add bundles
    const bundlesPath = path.join(distPath, 'bundles');
    if (fs.existsSync(bundlesPath)) {
      const bundleFiles = fs.readdirSync(bundlesPath);
      bundleFiles.forEach(file => {
        const filePath = path.join(bundlesPath, file);
        form.append(`bundle_${file}`, fs.createReadStream(filePath), {
          filename: file
        });
      });
    }

    // Add assets
    const assetsPath = path.join(distPath, 'assets');
    if (fs.existsSync(assetsPath)) {
      const assetFiles = fs.readdirSync(assetsPath);
      assetFiles.forEach(file => {
        const filePath = path.join(assetsPath, file);
        form.append(`asset_${file}`, fs.createReadStream(filePath), {
          filename: file
        });
      });
    }

    // Add _expo/static files if they exist
    const expoStaticPath = path.join(distPath, '_expo', 'static');
    if (fs.existsSync(expoStaticPath)) {
      const addStaticFiles = (dir, prefix = '') => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            addStaticFiles(filePath, `${prefix}${file}_`);
          } else {
            const fieldName = `expo_static_${prefix}${file}`;
            form.append(fieldName, fs.createReadStream(filePath), {
              filename: file
            });
          }
        });
      };
      addStaticFiles(expoStaticPath);
    }

    // Step 5: Upload to server using form.submit()
    console.log(`🌐 Uploading update to ${SERVER_URL}/api/upload...`);

    return new Promise((resolve, reject) => {
      const url = new URL(`${SERVER_URL}/api/upload`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

      form.submit({
        host: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        protocol: url.protocol,
        method: 'POST',
        headers: form.getHeaders()
      }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        let body = '';
        response.on('data', chunk => {
          body += chunk;
        });

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const result = JSON.parse(body);
              console.log('✅ Update published successfully!');
              console.log(`📍 Update path: ${result.updatePath}`);
              console.log(`🆔 Update ID: ${updateId}`);
              resolve(result);
            } catch (parseError) {
              console.log('✅ Update published successfully!');
              console.log(`🆔 Update ID: ${updateId}`);
              resolve({ success: true });
            }
          } else {
            reject(new Error(`Upload failed: ${response.statusCode} ${response.statusMessage}\n${body}`));
          }
        });

        response.on('error', reject);
      });
    });

  } catch (error) {
    console.error('❌ Failed to publish update:', error.message);
    process.exit(1);
  }
}

publishUpdate();