#!/usr/bin/env node
import { main } from "../src/index.js";

main(process.argv.slice(2)).catch((err) => {
  console.error(`costra: ${err.message}`);
  process.exit(1);
});
