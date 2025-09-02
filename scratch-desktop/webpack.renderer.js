const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const makeConfig = require('./webpack.makeConfig.js');

// Resolve to the directory containing a module's package.json
const getModulePath = moduleName =>
    path.dirname(require.resolve(`${moduleName}/package.json`));

function safePkgRoot(pkg) {
  try { return path.dirname(require.resolve(`${pkg}/package.json`)); }
  catch (_) { return null; }
}

// Helpers to reliably locate package roots
function resolvePackageDir(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

// (Kept for future use if you ever want to import GUI's entry directly)
// Prefers dist/scratch-gui.js, falls back to src/index.js
function resolveGuiEntry() {
  const guiRoot = resolvePackageDir('@scratch/scratch-gui');
  const distPath = path.join(guiRoot, 'dist', 'scratch-gui.js');
  try { return require.resolve(distPath); } catch (_) {}
  const srcPath = path.join(guiRoot, 'src', 'index.js');
  try { return require.resolve(srcPath); } catch (e) {
    throw new Error(
      `Could not resolve @scratch/scratch-gui entry. Tried:\n` +
      ` - ${distPath}\n` +
      ` - ${srcPath}\n`
    );
  }
}

// const generateIndexFile = template => {
//   let html = template;
//   html = html.replace(
//     '</head>',
//     '<script>require("source-map-support/source-map-support.js").install()</script></head>'
//   );
//   const filePath = path.join('dist', '.renderer-index-template.html');
//   fsExtra.outputFileSync(filePath, html);
//   return `!!html-loader?minimize=false&attributes=false!${filePath}`;
// };

// -------------------------------------new -------------------------------
const generateIndexFile = template => {
  let html = template;
  html = html.replace(
    '</head>',
    `
    <script>
      // Make Node's \`global\` available for Webpack/runtime & Node-y deps
      window.global = window;
      // Only call Electron's require if it's actually available
      try {
        if (window.require) {
          window.require('source-map-support/source-map-support.js').install();
        }
      } catch (e) { /* ignore */ }
    </script>
    </head>
    `
  );
  const filePath = path.join('dist', '.renderer-index-template.html');
  fsExtra.outputFileSync(filePath, html);
//  return \`!!html-loader?minimize=false&attributes=false!\${filePath}\`;
  return `!!html-loader?minimize=false&attributes=false!${filePath}`;
};



const template = fsExtra.readFileSync('src/renderer/index.html', {encoding: 'utf8'});

// Use the GUI package root everywhere (works with published pkg or local folder)
const GUI_ROOT = resolvePackageDir('@scratch/scratch-gui');

// Prefer a workspace-local scratch-vm; otherwise try the GUI's own node_modules
const VM_ROOT =
  safePkgRoot('scratch-vm') ||
  (fs.existsSync(path.join(GUI_ROOT, 'node_modules', 'scratch-vm', 'package.json'))
    ? path.join(GUI_ROOT, 'node_modules', 'scratch-vm')
    : null);

module.exports = makeConfig(
  {
    target: 'electron-renderer',
    entry: {
      // desktop’s renderer; it imports GUI pieces internally
      renderer: './src/renderer/index.js'
      // If you ever need to point directly at GUI, use:
      // renderer: resolveGuiEntry()
    },
    context: path.resolve(__dirname),
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      alias: {
        // adapter we created that re-exports what desktop needs from GUI source
        '@scratch-gui-adapter$': path.resolve(__dirname, 'src/renderer/shims/scratch-gui-adapter.js'),
        // only set this if we found a VM root; avoid require.resolve at config-load time
        ...(VM_ROOT ? { 'scratch-vm$': VM_ROOT } : {}),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
        // If you ever want to force GUI entry:
        // '@scratch/scratch-gui$': resolveGuiEntry()
      },
      fallback: {
    canvas: false
  }
    },
    externals: [
      'source-map-support',
      'electron',
      'webpack'
    ],
    output: {
      filename: '[name].js',
      assetModuleFilename: 'static/assets/[name].[hash][ext]',
      chunkFilename: '[name].bundle.js',
      libraryTarget: 'commonjs2',
      path: path.resolve(__dirname, 'dist/renderer'),
      globalObject: 'globalThis'   // <-- add this
    },
    module: {
      rules: [
        { test: /\.node$/, use: 'node-loader' },
        { test: /\.(html)$/, use: { loader: 'html-loader' } }
      ]
    }
  },
  {
    name: 'renderer',
    useReact: true,
    // Let makeConfig set up default rules; we only extend inclusion paths for Babel
    //disableDefaultRulesForExtensions: ['js', 'jsx', 'css', 'svg', 'png', 'wav', 'gif', 'jpg', 'ttf'],
    disableDefaultRulesForExtensions: ['js', 'jsx'],
    babelPaths: [
      path.resolve(__dirname, 'src', 'renderer'),

      // Transpile @scratch/* package source (when linked)
      /node_modules[\\/]+@scratch[\\/]+[^\\/]+[\\/]+src/,

      // Explicitly include these common source roots
      /node_modules[\\/]@scratch[\\/]scratch-gui[\\/]src/,
      /node_modules[\\/]scratch-paint[\\/]src/,

      // Include VM source if we found a root
      ...(VM_ROOT ? [ path.join(VM_ROOT, 'src') ] : []),

      // Other known deps used by desktop
      /node_modules[\\/]+pify/,
      /node_modules[\\/]+@vernier[\\/]+godirect/
    ],
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: generateIndexFile(template),
        minify: false
      }),
      new CopyWebpackPlugin({
        patterns: [
          // GUI static assets (includes your face assets in static/assets/face)
          {
            from: path.join(GUI_ROOT, 'static'),
            to: 'static',
            noErrorOnMissing: true
          },
          // Extension worker (may not exist in local src)
          {
            from: 'extension-worker.{js,js.map}',
            context: GUI_ROOT,
            noErrorOnMissing: true
          },
          // Libraries: present in published GUI; may be absent in local src
          {
            from: path.join(GUI_ROOT, 'libraries'),
            to: 'static/libraries',
            flatten: true,
            noErrorOnMissing: true
          },
          // Tutorial translation chunks: present in published GUI; optional in local src
          {
            from: path.join(GUI_ROOT, 'chunks'),
            to: 'chunks',
            noErrorOnMissing: true
          }
          // If needed, you can also copy from GUI src:
          // { from: path.join(GUI_ROOT, 'src', 'lib', 'libraries'), to: 'static/libraries', noErrorOnMissing: true }
        ]
      })
    ]
  }
);
