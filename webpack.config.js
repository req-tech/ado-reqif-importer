// @ts-check
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** @type {import('webpack').ConfigurationFactory} */
module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: './src/hub/hub.tsx',
    output: {
      path: path.resolve(__dirname, 'dist/hub'),
      filename: 'hub.js',
      publicPath: isDev ? '/hub/' : '',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: isDev,
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf|svg)$/i,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/hub/hub.html',
        filename: 'hub.html',
        inject: 'body',
      }),
    ],
    devServer: {
      server: 'https',
      port: 3000,
      hot: true,
      // Serve in-memory assets; no static directory needed (avoids stale dist/ files)
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      // Allow ADO to load from https://localhost:3000 inside an iframe
      allowedHosts: 'all',
    },
    devtool: isDev ? 'inline-source-map' : false,
    performance: {
      hints: isDev ? false : 'warning',
      maxAssetSize: 50 * 1024 * 1024,
      maxEntrypointSize: 50 * 1024 * 1024,
    },
  };
};
