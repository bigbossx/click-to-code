const path = require('node:path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')

module.exports = (_env, argv) => {
  const isDevelopment = argv.mode !== 'production'

  return {
    mode: isDevelopment ? 'development' : 'production',
    entry: './src/main.tsx',
    devtool: isDevelopment ? 'eval-source-map' : false,
    output: {
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                [
                  '@babel/preset-react',
                  { runtime: 'automatic', development: isDevelopment },
                ],
                '@babel/preset-typescript',
              ],
            },
          },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './public/index.html' }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          isDevelopment ? 'development' : 'production',
        ),
        __CLICK_TO_CODE_PROJECT_ROOT__: JSON.stringify(
          isDevelopment ? __dirname : '',
        ),
      }),
    ],
    devServer: {
      hot: true,
      port: 5174,
    },
  }
}
