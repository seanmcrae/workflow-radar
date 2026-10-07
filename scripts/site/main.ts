import { buildSite } from "./build.js";

const outDir = process.argv[2] ?? "site";
const site = await buildSite(outDir);
process.stdout.write(`Built ${site.files.length} files into ${site.outDir}/\n`);
