const path = require('path');

module.exports = {
  entry: {
    CogAdapter: ['babel-polyfill', './src/index.js'],
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.bundle.js',

    // mjh this allows "CogAdapter" variable in global context for use w/o import
    // following http://siawyoung.com/coding/javascript/exporting-es6-modules-as-single-scripts-with-webpack.html
    libraryTarget: 'var',
    // `library` determines the name of the global variable
    library: '[name]',
  },

  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        use: {
          loader: 'worker-loader',
          options: {
            inline: true,
          },
        },
      }, {
        test: /\.jsx?$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          // options are in .babelrc
        },
      }, {
        test: /\.css$/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
        ],
      },
    ],
  },

  resolve: {
    extensions: ['.js', '.jsx'],
  },

  node: {
    fs: 'empty',
  },

  devServer: {
    host: '0.0.0.0',
    port: 8091,
    inline: true,
    disableHostCheck: true,
    watchContentBase: true,
    overlay: {
      warnings: true,
      errors: true,
    },
  },

  devtool: 'source-map',
  cache: true,
};
