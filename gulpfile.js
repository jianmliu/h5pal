import gulp from 'gulp';
import del from 'del';
import connect from 'gulp-connect';
import sourcemaps from 'gulp-sourcemaps';
import babel from 'gulp-babel';
import stylus from 'gulp-stylus';
import rename from 'gulp-rename';
import path from 'path';
import { exportGameData } from './scripts/export-game-data.mjs';
import buildMudVendor from './scripts/build-mud-vendor.mjs';

const JS = ['src/**/*.js'];

const port = 8005;

// Clean Output Directory
function clean() {
  console.log('Cleaning output directories...');
  return del(['.tmp', 'dist']);
}

// Process JavaScript files
function js() {
  console.log('Processing JavaScript files...');
  return gulp.src(JS)
    .pipe(sourcemaps.init())
    .pipe(babel({
      presets: ['@babel/preset-env'],
      plugins: ['@babel/plugin-transform-modules-amd']
    }))
    .pipe(rename({ extname: '.js' }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('dist/'));
}

// Process styles
function style() {
  console.log('Processing styles...');
  return gulp.src(['src/stylus/*.styl', 'src/css/**/*.css'])
    .pipe(sourcemaps.init())
    .pipe(stylus())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('dist/css/'));
}

// Copy HTML files
function html() {
  console.log('Copying HTML files...');
  return gulp.src(['h5pal.html', 'index.html', 'pal.ico'])
    .pipe(gulp.dest('dist/'));
}

// Export MKF tables to JSON for runtime fallbacks
async function exportGameDataTask() {
  console.log('Exporting game data tables...');
  const assetDir = path.resolve('pal-assets');
  const outputPath = path.resolve(assetDir, 'game-data.json');
  await exportGameData({ assets: assetDir, output: outputPath, pretty: true });
}

// Build libraries
async function buildLib() {
  console.log('Building libraries...');
  const libs = {
    'jquery': 'dist/*',
    'requirejs': 'require.js',
    'sprintf': 'dist/sprintf.*',
    'q': 'q.js',
    'co': 'co.js'
  };

  const tasks = Object.keys(libs).map((name) => {
    const src = path.join('bower_components', name, libs[name]);
    const dest = path.join('dist/lib', name);
    console.log(`Copying ${src} to ${dest}`);
    return new Promise((resolve, reject) => {
      gulp.src(src, { allowEmpty: true })
        .pipe(gulp.dest(dest))
        .on('end', resolve)
        .on('error', reject);
    });
  });

  const customRxjs = new Promise((resolve, reject) => {
    gulp.src(['lib/rxjs/**/*.js', 'lib/rxjs/**/*.map'], { allowEmpty: true })
      .pipe(gulp.dest('dist/lib/rxjs'))
      .on('end', resolve)
      .on('error', reject);
  });

  await Promise.all([...tasks, customRxjs]);
  await buildMudVendor();
}

// Serve files
function serve() {
  console.log('Starting development server...');
  connect.server({
    root: '.', // Set the root directory to the project root
    host: '0.0.0.0',
    port: port,
    livereload: true
  });
}

// Watch files for changes
function watchFiles() {
  console.log('Watching files for changes...');
  gulp.watch(['src/js/**'], { interval: 500, debounceDelay: 1000 }, js);
  gulp.watch(['src/**/*.html', 'h5pal.html', 'index.html'], html); // Watch for HTML changes
  gulp.watch(['src/stylus/*.styl', 'src/css/**/*.css'], style); // Watch for CSS changes
}


function symlinkAssets(done) {
  const src = path.resolve('pal-assets');
  const dest = path.resolve('dist/pal-assets');
  import('fs').then(({ default: fs }) => {
    fs.access(src, (err) => {
      if (err) {
        console.warn('[symlinkAssets] missing pal-assets directory, skipping link');
        done();
        return;
      }
      const removeExisting = (callback) => {
        fs.lstat(dest, (statErr, stats) => {
          if (statErr) {
            callback();
            return;
          }
          fs.rm(dest, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) {
              console.warn('[symlinkAssets] failed to remove existing target', rmErr);
            }
            callback();
          });
        });
      };
      const createLink = () => {
        fs.symlink(src, dest, 'dir', (linkErr) => {
          if (linkErr && linkErr.code !== 'EEXIST') {
            console.error('[symlinkAssets] failed to create symlink', linkErr);
          } else {
            console.log('[symlinkAssets] linked pal-assets -> dist/pal-assets');
          }
          done();
        });
      };
      removeExisting(createLink);
    });
  }).catch((err) => {
    console.error('[symlinkAssets] fs import failed', err);
    done(err);
  });
}

// Define tasks
const build = gulp.series(exportGameDataTask, buildLib, gulp.parallel(js, style, html), symlinkAssets);
const dev = gulp.series(build, gulp.parallel(serve, watchFiles));
const defaultTask = gulp.series(clean, build);

// Export tasks
export { clean, js, style, html, buildLib, build, serve, dev, exportGameDataTask, symlinkAssets, defaultTask as default };
