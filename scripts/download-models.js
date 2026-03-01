/**
 * Script to download ONNX models for background removal
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(process.cwd(), 'public', 'models');

// Ensure models directory exists
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Model download URLs - using Hugging Face and alternative sources
const models = [
  {
    name: 'u2net.onnx',
    urls: [
      'https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx', // Alternative: ISNet (better for portraits)
      'https://github.com/bmaltais/kohya_ss/raw/master/scripts/u2net.onnx',
      'https://huggingface.co/briaai/RMBG-1.4-onnx/resolve/main/model.onnx', // RMBG model (similar to U²-Net)
    ],
  },
  {
    name: 'modnet.onnx',
    urls: [
      'https://huggingface.co/skytnt/anime-seg/resolve/main/modnet.onnx',
      'https://github.com/ZHKKKe/MODNet/releases/download/v1.0.0/modnet.onnx',
    ],
  },
];

/**
 * Download a file from URL
 */
function downloadFile(url, dest, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (attemptNumber) => {
      console.log(
        `Downloading ${path.basename(dest)} from ${url} (attempt ${attemptNumber}/${retries})...`
      );

      const file = fs.createWriteStream(dest);
      https
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirect
            file.close();
            fs.unlinkSync(dest);
            return attempt(attemptNumber); // Retry with same attempt number
          }

          if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(dest);
            reject(
              new Error(
                `Failed to download: ${response.statusCode} ${response.statusMessage}`
              )
            );
            return;
          }

          const totalSize = Number.parseInt(
            response.headers['content-length'],
            10
          );
          let downloadedSize = 0;

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize) {
              const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
              process.stdout.write(`\rProgress: ${percent}%`);
            }
            file.write(chunk);
          });

          response.on('end', () => {
            file.end();
            console.log('\nDownload completed!');
            resolve();
          });
        })
        .on('error', (error) => {
          file.close();
          if (fs.existsSync(dest)) {
            fs.unlinkSync(dest);
          }
          if (attemptNumber < retries) {
            console.log(`\nError: ${error.message}, retrying...`);
            setTimeout(() => attempt(attemptNumber + 1), 2000);
          } else {
            reject(error);
          }
        });
    };

    attempt(1);
  });
}

/**
 * Main download function
 */
async function downloadModels() {
  console.log('Starting model downloads...\n');

  for (const model of models) {
    const dest = path.join(modelsDir, model.name);

    // Skip if file already exists
    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      console.log(
        `${model.name} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB), skipping...\n`
      );
      continue;
    }

    let downloaded = false;
    const urls =
      model.urls ||
      (model.url ? [model.url, model.fallback].filter(Boolean) : []);

    for (let i = 0; i < urls.length; i++) {
      try {
        console.log(`Trying URL ${i + 1}/${urls.length} for ${model.name}...`);
        await downloadFile(urls[i], dest);
        downloaded = true;
        break;
      } catch (error) {
        console.error(`✗ Failed: ${error.message}`);
        if (i < urls.length - 1) {
          console.log('Trying next URL...');
        }
      }
    }

    if (!downloaded) {
      console.error(`\n✗ Failed to download ${model.name} from all URLs.`);
      console.log(
        `Please download ${model.name} manually from one of these sources:`
      );
      urls.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
      console.log(`And place it in: ${modelsDir}\n`);
    }

    console.log('');
  }

  console.log('Model download process completed!');
  console.log(`Models directory: ${modelsDir}`);

  // Check which models are available
  const availableModels = models.filter((m) =>
    fs.existsSync(path.join(modelsDir, m.name))
  );
  if (availableModels.length > 0) {
    console.log('\n✓ Successfully downloaded models:');
    availableModels.forEach((m) => {
      const filePath = path.join(modelsDir, m.name);
      const stats = fs.statSync(filePath);
      console.log(
        `  - ${m.name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      );
    });
  }
}

// Run the download
downloadModels().catch(console.error);
