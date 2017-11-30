const webpack = require('webpack'); //to access built-in plugins
const path = require('path');

const config = {
  entry: {
    main: './src/main.ts'
  },
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: 'main.js'
  },
  module: {
    rules: [{ 
      test: /\.ts$/, 
      use: [
        "awesome-typescript-loader"
      ],
      exclude: /node_modules/
    }],
  },
  resolve: {
    extensions: [ ".ts", ".js" ]
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin()
  ]
};

module.exports = config;