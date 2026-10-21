const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const production = argv.mode === 'production';
  return {
    entry: './client/index.jsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: production ? 'assets/[name].[contenthash:10].js' : 'assets/[name].js',
      publicPath: '/',
      clean: true
    },
    resolve: { extensions: ['.js', '.jsx'] },
    devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic', development: !production }]
              ]
            }
          }
        },
        { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './client/index.html' }),
      new MiniCssExtractPlugin({ filename: production ? 'assets/[name].[contenthash:10].css' : 'assets/[name].css' }),
      new CopyWebpackPlugin({ patterns: [{ from: 'client/public', to: '.' }] })
    ],
    optimization: { splitChunks: { chunks: 'all', cacheGroups: { vendor: { test: /node_modules/, name: 'vendor' } } } },
    performance: { hints: false }
  };
};
