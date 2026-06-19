#!/usr/bin/env node

const { main } = require('../main/flow-hook-cli');

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`[pickagent-hook] ${err.message}\n`);
    process.exitCode = 1;
  });
