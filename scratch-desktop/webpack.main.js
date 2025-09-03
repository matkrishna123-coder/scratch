// const path = require('path');

// const makeConfig = require('./webpack.makeConfig.js');

// module.exports = makeConfig(
//     {
//         target: 'electron-main',
//         entry: {
//             main: './src/main/index.js',
//             preload: './src/main/preload.js'
//         },
//         context: path.resolve(__dirname),
//         externals: [
//             'source-map-support',
//             'electron',
//             'webpack',
//             'webpack/hot/log-apply-result',
//             'electron-webpack/out/electron-main-hmr/HmrClient',
//             'source-map-support/source-map-support.js'
//         ],
//         output: {
//             filename: '[name].js',
//             chunkFilename: '[name].bundle.js',
//             assetModuleFilename: 'static/assets/[name].[hash][ext]',
//             libraryTarget: 'commonjs2',
//             path: path.resolve(__dirname, 'dist/main')
//         },
//         module: {rules: []},
//         node: {__dirname: false, __filename: false}
//     },
//     {
//         name: 'main',
//         useReact: false,
//         disableDefaultRulesForExtensions: ['js'],
//         babelPaths: [
//             path.resolve(__dirname, 'src', 'main')
//         ]
//     }
// );


// webpack.main.js
const path = require('path');
const makeConfig = require('./webpack.makeConfig.js');

module.exports = makeConfig(
  {
    target: 'electron-main',
    context: __dirname,
    entry: { main: './src/main/index.js' },
    resolve: { extensions: ['.js', '.json'] },
    externals: ['electron', 'source-map-support'],
    module: {
      rules: [
        {
          test: /\.m?js$/,
          // 🚫 Do not transpile node_modules in the main process
          exclude: /node_modules/,
          use: { loader: 'babel-loader' } // your presets/plugins as usual
        }
      ],
      // ⛔ Don’t even parse this minilog file (avoids strict-mode octal escape error)
      noParse: /minilog[\\/]lib[\\/]node[\\/]formatters[\\/]util\.js$/
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist/main'),
      libraryTarget: 'commonjs2'
    }
  },
  {
    name: 'main',
    // Ensure only your source is transpiled
    disableDefaultRulesForExtensions: ['js'],
    babelPaths: [
      path.resolve(__dirname, 'src', 'main'),
      path.resolve(__dirname, 'src', 'common')
    ]
  }
);
