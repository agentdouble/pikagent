const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
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

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
