import * as prettier from "prettier";import fs from "fs";
const [,,inp,out,parser]=process.argv;
const src=fs.readFileSync(inp,"utf8");
const opts=JSON.parse(fs.readFileSync(new URL("../.prettierrc.json",import.meta.url),"utf8"));const r=await prettier.format(src,{parser,...opts});
fs.writeFileSync(out,r);console.log(parser,src.length,"->",r.length,"lines",r.split("\n").length);
