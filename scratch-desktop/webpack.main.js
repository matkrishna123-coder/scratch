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
//--------------------------------------------------------------------------------------------

// webpack.main.js
// const path = require('path');
// const makeConfig = require('./webpack.makeConfig.js');
// 
// module.exports = makeConfig(
//   {
//     target: 'electron-main',
//     context: __dirname,
//     entry: { main: './src/main/index.js', preload: './src/main/preload.js' },
//     resolve: { extensions: ['.js', '.json'] },
//     externals: ['electron', 'source-map-support'],
//     module: {
//       rules: [
//         {
//           test: /\.m?js$/,
//           //  Do not transpile node_modules in the main process
//           exclude: /node_modules/,
//           use: { loader: 'babel-loader' } // your presets/plugins as usual
//         }
//       ],
//       //  Don’t even parse this minilog file (avoids strict-mode octal escape error)
//       noParse: /minilog[\\/]lib[\\/]node[\\/]formatters[\\/]util\.js$/
//     },
//     output: {
//       filename: '[name].js',
//       path: path.resolve(__dirname, 'dist/main'),
//       libraryTarget: 'commonjs2'
//     }
//   },
//   {
//     name: 'main',
//     // Ensure only your source is transpiled
//     disableDefaultRulesForExtensions: ['js'],
//     babelPaths: [
//       path.resolve(__dirname, 'src', 'main'),
//       path.resolve(__dirname, 'src', 'common')
//     ]
//   }
// );
// const path = require('path');
// const makeConfig = require('./webpack.makeConfig.js');

// const OUT = path.resolve(__dirname, 'dist/main');

// module.exports = makeConfig({
//   target: 'electron-main', 
//    entry: {
//             main: './src/main/index.js',
//             preload: './src/main/preload.js'
//         },
//   output: { filename: '[name].js', path: OUT },

//   // ⬇️ Keep minilog out of the bundle so Babel never sees it
//   externals: {
//     minilog: 'commonjs2 minilog'
//   },

//   module: {
//     rules: [
//       {
//         test: /\.m?js$/,
//         // ⬇️ Only transpile your source, not node_modules
//         include: path.resolve(__dirname, 'src'),
//         use: { loader: 'babel-loader' }
//       }
//     ],
//     // Optional extra guard; webpack won’t parse these files at all if they get pulled in
//     noParse: /minilog[\\/]lib[\\/]node[\\/]formatters[\\/](util|npm)\.js$/
//   }
// }, { name: 'main' });


const path = require('path');
const fsExtra = require('fs-extra');

const HtmlWebpackPlugin = require('html-webpack-plugin');

const CopyWebpackPlugin = require('copy-webpack-plugin');

const makeConfig = require('./webpack.makeConfig.js');

const getModulePath = moduleName => path.dirname(require.resolve(`${moduleName}`));

const generateIndexFile = template => {
    let html = template;

    html = html.replace(
        '</head>', '<script>require("source-map-support/source-map-support.js").install()</script></head>'
    );

    const filePath = path.join('dist', '.renderer-index-template.html');
    fsExtra.outputFileSync(filePath, html);
    return `!!html-loader?minimize=false&attributes=false!${filePath}`;
};

const template = fsExtra.readFileSync('src/renderer/index.html', {encoding: 'utf8'});

module.exports = makeConfig(
    {
        target: 'electron-renderer',
        entry: {
            renderer: './src/renderer/index.js'
        },
        context: path.resolve(__dirname),
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
            path: path.resolve(__dirname, 'dist/renderer')
        },
        module: {
            rules: [
                {
                    test: /\.node$/,
                    use: 'node-loader'
                },
                {
                    test: /\.(html)$/,
                    use: {loader: 'html-loader'}
                }
            ]
        }
    },
    {
        name: 'renderer',
        useReact: true,
        disableDefaultRulesForExtensions: ['js', 'jsx', 'css', 'svg', 'png', 'wav', 'gif', 'jpg', 'ttf'],
        babelPaths: [
            path.resolve(__dirname, 'src', 'renderer'),
            /node_modules[\\/]+@scratch[\\/]+[^\\/]+[\\/]+src/,
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
                    {
                        from: path.join(getModulePath('@scratch/scratch-gui'), 'static'),
                        to: 'static'
                    },
                    {
                        from: 'extension-worker.{js,js.map}',
                        context: getModulePath('@scratch/scratch-gui')
                    },
                    {
                        from: path.join(getModulePath('@scratch/scratch-gui'), 'libraries'),
                        to: 'static/libraries',
                        flatten: true
                    },
                    {
                        // We need to copy the chunks for translating tutorial images for
                        // the tutorial translations to work.
                        from: path.join(getModulePath('@scratch/scratch-gui'), 'chunks'),
                        to: 'chunks'
                    }
                    // This still results in a missing fetch worker error, because the fetch-worker
                    // is attempted to be resolved on an absolute path (e.g. file:///chunks/fetch-worker..)
                    // That is still fine, because we don't need the fetch-worker to retrieve information.
                    // TODO: For a long term fix, change how the fetch-worker is resolved in `scratch-storage`
                    // {
                    //     context: getModulePath('@scratch/scratch-gui'),
                    //     from: 'chunks/fetch-worker.*.{js,js.map}',
                    //     noErrorOnMissing: true
                    // }
                ]
            })
        ]
    }
);
