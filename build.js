const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const rendererOptions = {
  entryPoints: [path.join(__dirname, 'src', 'renderer.js')],
  bundle: true,
  outfile: path.join(__dirname, 'dist', 'renderer.js'),
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  loader: {
    '.css': 'empty',
  },
  external: [],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

const preloadOptions = {
  entryPoints: [path.join(__dirname, 'preload.js')],
  bundle: true,
  outfile: path.join(__dirname, 'dist', 'preload.js'),
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
};

async function build() {
  if (isWatch) {
    const [rendererCtx, preloadCtx] = await Promise.all([
      esbuild.context(rendererOptions),
      esbuild.context(preloadOptions),
    ]);
    await Promise.all([rendererCtx.watch(), preloadCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(rendererOptions),
      esbuild.build(preloadOptions),
    ]);
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
