/* eslint-disable global-require */
const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

const makeConfig = require('./webpack.makeConfig.js');

/* ------------------------- helpers ------------------------- */
function resolvePackageDir(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}
function safePkgRoot(pkg) {
  try { return path.dirname(require.resolve(`${pkg}/package.json`)); }
  catch (_) { return null; }
}

/* ---- inject tiny bootstrap into index.html (for source maps) ---- */
const generateIndexFile = template => {
  let html = template;
  html = html.replace(
    '</head>',
    `
    <script>
      // Expose "global" to any Node-y dependency that expects it
      window.global = window;
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
  return `!!html-loader?minimize=false&attributes=false!${filePath}`;
};

/* -------------------- order matters below -------------------- */
const template = fsExtra.readFileSync('src/renderer/index.html', {encoding: 'utf8'});

/** MUST exist before anything that depends on it */
const GUI_ROOT = resolvePackageDir('@scratch/scratch-gui');

/** Where the real fetch-worker lives (hashed filename) */
const STORAGE_CHUNKS_WEB = path.join(
  GUI_ROOT, 'node_modules', 'scratch-storage', 'dist', 'web', 'chunks'
);

/** Prefer a workspace-local VM; else use GUI’s node_modules */
const VM_ROOT =
  safePkgRoot('scratch-vm') ||
  (fs.existsSync(path.join(GUI_ROOT, 'node_modules', 'scratch-vm', 'package.json'))
    ? path.join(GUI_ROOT, 'node_modules', 'scratch-vm')
    : null);

/* ------------------------- config ------------------------- */
module.exports = makeConfig(
  {
    target: 'electron-renderer',
    context: path.resolve(__dirname),

    entry: {
      renderer: './src/renderer/index.js'
    },

    // Let webpack know this is an Electron renderer build; don’t pull core Node polyfills automatically
    externalsPresets: { electronRenderer: true, node: false },

    // Keep externals minimal so WDS client can bundle
    externals: {
      'source-map-support': 'commonjs2 source-map-support'
    },

    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      // Prefer browser fields to avoid server/Node variants (e.g., jsdom)
      mainFields: ['browser', 'module', 'main'],

      alias: {
        // Adapter that re-exports what desktop needs from GUI source
        '@scratch-gui-adapter$': path.resolve(__dirname, 'src/renderer/shims/scratch-gui-adapter.js'),
        // Guard so accidental `import 'electron'` in renderer won't break (must exist if you keep it)
        electron$: path.resolve(__dirname, 'src/renderer/shims/electron-guard.js'),

        // Only set this if we found a VM root
        ...(VM_ROOT ? { 'scratch-vm$': VM_ROOT } : {}),

        // Force single React copy
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),

        // Hard-disable server-only libs that sometimes sneak in
        jsdom$: false,
        'http-proxy-agent$': false,
        'https-proxy-agent$': false,
        'agent-base$': false
      },

      // Webpack 5: explicitly polyfill only what dev client needs; stub the rest
      fallback: {
        // Needed by webpack-dev-server client / HMR
        events: require.resolve('events/'),
        process: require.resolve('process/browser'),
        buffer: require.resolve('buffer/'),
        url: require.resolve('url/'),

        // Optional: allow safe usage of path in the browser
        path: require.resolve('path-browserify'),

        // Everything Node-only -> stub out to avoid bundling & errors
        assert: false,
        child_process: false,
        crypto: false,
        fs: false,
        http: false,
        https: false,
        net: false,
        os: false,
        stream: false,
        string_decoder: false,
        tls: false,
        util: false,
        vm: false,
        zlib: false,

        canvas: false
      }
    },

    output: {
      filename: '[name].js',
      chunkFilename: '[name].bundle.js',
      assetModuleFilename: 'static/assets/[name].[hash][ext]',
      path: path.resolve(__dirname, 'dist/renderer'),
      publicPath: '/',
      globalObject: 'globalThis'
    },

    module: {
      rules: [
        { test: /\.node$/, use: 'node-loader' },
        { test: /\.(html)$/, use: { loader: 'html-loader' } },
        {
          test: /\.(svg|png|gif|jpe?g|woff2?|ttf|eot)$/i,
          type: 'asset/resource',
          generator: { filename: 'static/assets/[name].[contenthash][ext]' }
        }
      ]
    },

    plugins: [
      // Drop any accidental Node/server-only imports
      new webpack.IgnorePlugin({ resourceRegExp: /^jsdom$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^(http|https)-proxy-agent$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^agent-base$/ }),

      // Provide shims needed by WDS client & some libs
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer']
      }),

      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: generateIndexFile(template),
        minify: false
      }),

      // Copy assets needed at runtime (dev server serves them from memory; prod writes to disk)
      new CopyWebpackPlugin({
        patterns: [
          // static assets (GUI may place them in root or dist/static)
          { from: path.join(GUI_ROOT, 'static'),            to: 'static', noErrorOnMissing: true },
          { from: path.join(GUI_ROOT, 'dist', 'static'),    to: 'static', noErrorOnMissing: true },

          // extension worker (handle either location)
          { from: path.join(GUI_ROOT, 'extension-worker.js'),        to: 'extension-worker.js',     noErrorOnMissing: true },
          { from: path.join(GUI_ROOT, 'extension-worker.js.map'),    to: 'extension-worker.js.map', noErrorOnMissing: true },
          { from: path.join(GUI_ROOT, 'dist', 'extension-worker.js'),     to: 'extension-worker.js',     noErrorOnMissing: true },
          { from: path.join(GUI_ROOT, 'dist', 'extension-worker.js.map'), to: 'extension-worker.js.map', noErrorOnMissing: true },

          // fetch-worker from scratch-storage (actual location with hashed filename)
          { from: path.join(STORAGE_CHUNKS_WEB, 'fetch-worker.*.js'),     to: 'chunks/[name][ext]', noErrorOnMissing: true },
          { from: path.join(STORAGE_CHUNKS_WEB, 'fetch-worker.*.js.map'), to: 'chunks/[name][ext]', noErrorOnMissing: true },

          // optional: other GUI chunks (tutorials/translations, etc.) – keep ONE of these to avoid duplicates
          { from: path.join(GUI_ROOT, 'chunks'), to: 'chunks', noErrorOnMissing: true },

          // libraries (present in published GUI)
          { from: path.join(GUI_ROOT, 'libraries'), to: 'static/libraries', flatten: true, noErrorOnMissing: true }
        ]
      })
    ],

    // Dev server: serve ONLY the compiled output to avoid double-serving the same URLs
    devServer: {
      hot: true,
      historyApiFallback: true,
      static: false,
      // static: {
      //   directory: path.resolve(__dirname, 'dist/renderer'),
      //   publicPath: '/',
      //   watch: true
      // },
      devMiddleware: {  publicPath: '/', writeToDisk: false },
      client: { overlay: true }
    }
  },

  /* -------- makeConfig options -------- */
  {
    name: 'renderer',
    useReact: true,
    // Keep default CSS rules; only replace JS rules (we supply babelPaths)
    disableDefaultRulesForExtensions: ['js', 'jsx'],
    babelPaths: [
      path.resolve(__dirname, 'src', 'renderer'),

      // Transpile @scratch/* package source (when linked)
      /node_modules[\\/]+@scratch[\\/]+[^\\/]+[\\/]+src/,

      // Common source roots
      /node_modules[\\/]@scratch[\\/]scratch-gui[\\/]src/,
      /node_modules[\\/]scratch-paint[\\/]src/,

      // Include VM source if present
      ...(VM_ROOT ? [ path.join(VM_ROOT, 'src') ] : []),

      // Other known deps
      /node_modules[\\/]+pify/,
      /node_modules[\\/]+@vernier[\\/]+godirect/
    ]
  }
);


