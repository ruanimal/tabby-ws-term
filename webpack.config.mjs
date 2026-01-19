import * as path from 'path'
import * as url from 'url'
import * as fs from 'fs'
import webpack from 'webpack'
import { AngularWebpackPlugin } from '@ngtools/webpack'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default () => {
  const isDev = !!process.env.TABBY_DEV

  return {
    target: 'node',
    entry: './src/index.ts',
    context: __dirname,
    devtool: 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'index.js',
      pathinfo: true,
      libraryTarget: 'umd',
      publicPath: 'auto',
    },
    mode: isDev ? 'development' : 'production',
    optimization: {
      minimize: false,
    },
    resolve: {
      modules: ['.', 'src', 'node_modules'],
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: '@ngtools/webpack',
        },
        {
          test: /\.pug$/,
          use: [
            'apply-loader',
            {
              loader: 'pug-loader',
              options: { pretty: true },
            },
          ],
        },
        {
          test: /\.scss$/,
          use: ['style-loader', 'css-loader', 'sass-loader'],
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    externals: [
      'fs',
      'path',
      'os',
      'net',
      'child_process',
      'electron',
      '@electron/remote',
      'ngx-toastr',
      /^@angular/,
      /^@ng-bootstrap/,
      /^rxjs/,
      /^tabby-/,
    ],
    plugins: [
      new AngularWebpackPlugin({
        tsconfig: path.resolve(__dirname, 'tsconfig.json'),
        directTemplateLoading: false,
        jitMode: true,
      }),
    ],
  }
}
