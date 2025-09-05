#!/usr/bin/env node
/**
 * Frontend Build Script for Network 2 (192.168.0.249)
 * Creates a production build with network-specific API endpoints
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Network 2 Configuration
const NETWORK_CONFIG = {
    networkId: 'network2',
    networkIp: '192.168.0.249',
    apiBaseUrl: 'http://192.168.0.249/api',
    buildDir: 'C:/barcode-app/frontend-network2',
    port: 80,
    sslPort: 443
};

console.log('🌐 Building Frontend for Network 2 (192.168.0.249)...');
console.log(`📡 API Base URL: ${NETWORK_CONFIG.apiBaseUrl}`);
console.log(`📁 Build Directory: ${NETWORK_CONFIG.buildDir}`);

// Create environment file for this network
const envContent = `# Network 2 Configuration
VITE_API_BASE_URL=${NETWORK_CONFIG.apiBaseUrl}
VITE_NETWORK_ID=${NETWORK_CONFIG.networkId}
VITE_NETWORK_IP=${NETWORK_CONFIG.networkIp}
VITE_APP_TITLE=Barcode Management System - Network 2
VITE_APP_VERSION=1.0.0
VITE_BUILD_TIMESTAMP=${new Date().toISOString()}
`;

const envPath = path.join(process.cwd(), '.env.production');
fs.writeFileSync(envPath, envContent);
console.log('✅ Created .env.production file for Network 2');

// Update vite.config.ts to use the correct base URL
const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
let viteConfig = fs.readFileSync(viteConfigPath, 'utf8');

// Add network-specific configuration
const networkConfig = `
// Network 2 specific configuration
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      '/api': {
        target: '${NETWORK_CONFIG.apiBaseUrl}',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu']
        }
      }
    }
  },
  define: {
    __NETWORK_CONFIG__: JSON.stringify({
      networkId: '${NETWORK_CONFIG.networkId}',
      networkIp: '${NETWORK_CONFIG.networkIp}',
      apiBaseUrl: '${NETWORK_CONFIG.apiBaseUrl}',
      buildTimestamp: '${new Date().toISOString()}'
    })
  }
});
`;

// Replace the export default defineConfig part
viteConfig = viteConfig.replace(
  /export default defineConfig\({[\s\S]*?}\);?$/,
  networkConfig.trim()
);

fs.writeFileSync(viteConfigPath, viteConfig);
console.log('✅ Updated vite.config.ts for Network 2');

try {
    // Install dependencies
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });

    // Build the application
    console.log('🔨 Building application for Network 2...');
    execSync('npm run build', { stdio: 'inherit' });

    // Create build directory
    if (!fs.existsSync(NETWORK_CONFIG.buildDir)) {
        fs.mkdirSync(NETWORK_CONFIG.buildDir, { recursive: true });
    }

    // Copy built files to network-specific directory
    console.log('📋 Copying built files...');
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
        execSync(`xcopy "${distPath}\\*" "${NETWORK_CONFIG.buildDir}\\" /E /I /Y`, { stdio: 'inherit' });
    }

    // Create network-specific index.html with updated API endpoints
    const indexPath = path.join(NETWORK_CONFIG.buildDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        let indexContent = fs.readFileSync(indexPath, 'utf8');
        
        // Add network-specific meta tags
        const networkMeta = `
    <meta name="network-id" content="${NETWORK_CONFIG.networkId}">
    <meta name="network-ip" content="${NETWORK_CONFIG.networkIp}">
    <meta name="api-base-url" content="${NETWORK_CONFIG.apiBaseUrl}">
    <meta name="build-timestamp" content="${new Date().toISOString()}">`;
        
        indexContent = indexContent.replace('</head>', `${networkMeta}\n  </head>`);
        
        // Add network configuration script
        const networkScript = `
  <script>
    window.NETWORK_CONFIG = {
      networkId: '${NETWORK_CONFIG.networkId}',
      networkIp: '${NETWORK_CONFIG.networkIp}',
      apiBaseUrl: '${NETWORK_CONFIG.apiBaseUrl}',
      buildTimestamp: '${new Date().toISOString()}'
    };
  </script>`;
        
        indexContent = indexContent.replace('</body>', `${networkScript}\n  </body>`);
        
        fs.writeFileSync(indexPath, indexContent);
    }

    // Create network-specific configuration file
    const configPath = path.join(NETWORK_CONFIG.buildDir, 'network-config.json');
    const configData = {
        networkId: NETWORK_CONFIG.networkId,
        networkIp: NETWORK_CONFIG.networkIp,
        apiBaseUrl: NETWORK_CONFIG.apiBaseUrl,
        buildTimestamp: new Date().toISOString(),
        version: '1.0.0'
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

    // Create health check endpoint for frontend
    const healthCheckPath = path.join(NETWORK_CONFIG.buildDir, 'health.json');
    const healthData = {
        status: 'healthy',
        network: NETWORK_CONFIG.networkId,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    };
    fs.writeFileSync(healthCheckPath, JSON.stringify(healthData, null, 2));

    console.log('✅ Frontend build for Network 2 completed successfully!');
    console.log(`📁 Build output: ${NETWORK_CONFIG.buildDir}`);
    console.log(`🌐 Network IP: ${NETWORK_CONFIG.networkIp}`);
    console.log(`📡 API Base URL: ${NETWORK_CONFIG.apiBaseUrl}`);

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
} finally {
    // Clean up temporary files
    if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
    }
    
    // Restore original vite.config.ts
    const originalViteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})`;
    fs.writeFileSync(viteConfigPath, originalViteConfig);
}
