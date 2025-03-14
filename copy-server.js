
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureDirectoryExists(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function copyFile(src, dest) {
    try {
        await fs.copyFile(src, dest);
        console.log(`Copied ${src} to ${dest}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`File not found: ${src}`);
        } else {
            console.error(`Error copying ${src} to ${dest}:`, error);
        }
        throw error;
    }
}

async function copyServerFiles() {
    try {
        console.log('Starting server files copy process...');

        // Ensure dist directory exists
        const distDir = join(__dirname, 'dist');
        const serverDir = join(distDir, 'server');
        const serverModelsDir = join(serverDir, 'models');

        await ensureDirectoryExists(distDir);
        await ensureDirectoryExists(serverDir);
        await ensureDirectoryExists(serverModelsDir);

        // Define files to copy (include all necessary server files)
        const filesToCopy = [
            { src: 'index.js', dest: 'dist/index.js' },
            { src: 'server/models/Coupon.js', dest: 'dist/server/models/Coupon.js' },
            { src: 'server/models/CouponClaim.js', dest: 'dist/server/models/CouponClaim.js' },
            { src: '.env', dest: 'dist/.env' }
        ];

        // Copy all files
        for (const file of filesToCopy) {
            await copyFile(file.src, file.dest);
        }

        console.log('Server files copied successfully');
    } catch (error) {
        console.error('Failed to copy server files:', error);
        process.exit(1);
    }
}

copyServerFiles(); 