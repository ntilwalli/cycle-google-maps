//const webpack = require('webpack'); //to access built-in plugins
const path = require('path');

const config = {
  devtool: 'inline-source-map',
  entry: {
    main: './test/main.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/test'),
    filename: 'main.js'
  },
  module: {
    rules: [{ 
      test: /\.ts$/, 
      exclude: /node_modules/,
      use: [
        "awesome-typescript-loader"
      ]
    }],
  },
  resolve: {
    extensions: [ ".ts", ".js" ]
  },
};

module.exports = config;