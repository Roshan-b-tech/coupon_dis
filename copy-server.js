import { promises as fs } from 'fs';
import { join } from 'path';

async function copyServerFiles() {
    try {
        // Create server directories in dist
        await fs.mkdir('dist/server/models', { recursive: true });

        // Copy server files
        await fs.copyFile('index.js', 'dist/index.js');
        await fs.copyFile('server/models/Coupon.js', 'dist/server/models/Coupon.js');

        console.log('Server files copied successfully');
    } catch (error) {
        console.error('Error copying server files:', error);
        process.exit(1);
    }
}

copyServerFiles(); 