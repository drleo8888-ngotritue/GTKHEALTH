/**
 * Tạo file patch nhỏ để cập nhật app mà không cần đóng gói lại toàn bộ.
 * Chạy: node create-patch.js
 * Output: patch-vX.Y.Z-YYYYMMDD.zip (chỉ chứa app.asar ~5-15MB)
 */
const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

function copyDir(src, dst) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

async function main() {
  const ROOT = __dirname;
  const pkg = require('./package.json');
  const version = pkg.version;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const patchName = `patch-v${version}-${date}.zip`;
  const TEMP = path.join(ROOT, '.patch-temp', 'src');
  const ASAR_DIR = path.join(ROOT, '.patch-temp', 'out');
  const ASAR_OUT = path.join(ASAR_DIR, 'app.asar');
  const PATCH_OUT = path.join(ROOT, patchName);

  // --- 1. Build frontend ---
  console.log('\n🔨 Building frontend (Vite)...');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });

  // --- 2. Thu thập app files (không có node_modules) ---
  console.log('\n📁 Collecting app files...');
  const PATCH_TEMP_ROOT = path.join(ROOT, '.patch-temp');
  if (fs.existsSync(PATCH_TEMP_ROOT)) fs.rmSync(PATCH_TEMP_ROOT, { recursive: true });
  fs.mkdirSync(TEMP, { recursive: true });
  fs.mkdirSync(ASAR_DIR, { recursive: true });

  const FILES = ['main.js', 'preload.js', 'db-service.js', 'ipc-handlers.js', 'sync-service.js', 'package.json'];
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(TEMP, f));
      console.log(`  ✓ ${f}`);
    }
  }

  const distSrc = path.join(ROOT, 'dist');
  const distDst = path.join(TEMP, 'dist');
  if (fs.existsSync(distSrc)) {
    fs.mkdirSync(distDst, { recursive: true });
    copyDir(distSrc, distDst);
    console.log(`  ✓ dist/ (${fs.readdirSync(distSrc).length} items)`);
  }

  // --- 3. Pack thành app.asar ---
  console.log('\n📦 Packing app.asar...');
  const { createPackage } = require('@electron/asar');
  await createPackage(TEMP, ASAR_OUT);
  const asarSizeMB = (fs.statSync(ASAR_OUT).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ app.asar (${asarSizeMB} MB)`);

  // --- 4. Zip lại (dùng %TEMP% để tránh vấn đề path Unicode + file lock) ---
  console.log(`\n🗜️  Creating ${patchName}...`);
  const os = require('os');
  const ASCII_TEMP = path.join(os.tmpdir(), 'gvc-patch-' + Date.now());
  const ASCII_ASAR = path.join(ASCII_TEMP, 'app.asar');
  const ASCII_ZIP  = path.join(ASCII_TEMP, patchName);
  fs.mkdirSync(ASCII_TEMP, { recursive: true });
  fs.copyFileSync(ASAR_OUT, ASCII_ASAR);
  execSync(`powershell -Command "Compress-Archive -Path '${ASCII_ASAR}' -DestinationPath '${ASCII_ZIP}' -Force"`);
  fs.copyFileSync(ASCII_ZIP, PATCH_OUT);
  const zipSizeMB = (fs.statSync(PATCH_OUT).size / 1024 / 1024).toFixed(1);

  // --- Cleanup ---
  fs.rmSync(PATCH_TEMP_ROOT, { recursive: true });
  fs.rmSync(ASCII_TEMP, { recursive: true });

  console.log(`\n✅ Patch tạo thành công: ${patchName} (${zipSizeMB} MB)`);
  console.log(`   Chia sẻ file này cho người dùng → Admin → Cập nhật ứng dụng → Chọn file\n`);
}

main().catch(e => {
  console.error('\n❌ Lỗi:', e.message);
  process.exit(1);
});
