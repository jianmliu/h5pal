const { src, dest, series, parallel, watch } = require('gulp');
const del = require('del');
const connect = require('gulp-connect');
const sourcemaps = require('gulp-sourcemaps');
const babel = require('gulp-babel');
const stylus = require('gulp-stylus');
const rename = require('gulp-rename');
const path = require('path');

const JS = ['src/**/*.js'];
const port = 8005;

function clean() {
  return del(['.tmp', 'dist']);
}

function js() {
  return src(JS)
    .pipe(sourcemaps.init())
    .pipe(babel({
      presets: [['@babel/preset-env', { modules: 'amd' }]]
    }))
    .pipe(rename({ extname: '.js' }))
    .pipe(sourcemaps.write('.'))
    .pipe(dest('dist/'));
}

function style() {
  return src(['src/stylus/*.styl', 'src/css/**/*.css'])
    .pipe(sourcemaps.init())
    .pipe(stylus({}))
    .pipe(sourcemaps.write('.'))
    .pipe(dest('dist/css/'));
}

function buildLib() {
  const libs = {
    jquery: 'dist/*',
    requirejs: 'require.js',
    sprintf: 'dist/sprintf.*',
    q: 'q.js',
    co: 'co.js'
  };

  const promises = Object.keys(libs).map(name => new Promise((resolve, reject) => {
    src(path.join('bower_components', name, libs[name]))
      .pipe(dest(path.join('dist/lib', name)))
      .on('end', resolve)
      .on('error', reject);
  }));

  return Promise.all(promises);
}

const build = series(buildLib, parallel(js, style));

function serve() {
  connect.server({
    host: '0.0.0.0',
    port: port
  });
}

function watchFiles() {
  watch(['src/js/**'], { delay: 1000 }, js);
}

const dev = series(build, parallel(serve, watchFiles));
const defaultTask = series(clean, build);

exports.clean = clean;
exports.js = js;
exports.style = style;
exports.buildLib = buildLib;
exports.build = build;
exports.serve = serve;
exports.dev = dev;
exports.default = defaultTask;
