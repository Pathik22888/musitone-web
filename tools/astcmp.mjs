import * as acorn from "acorn";import fs from "fs";import crypto from "crypto";
const norm=src=>{const ast=acorn.parse(src,{ecmaVersion:"latest",sourceType:"script",allowReturnOutsideFunction:true});
  const strip=o=>{if(Array.isArray(o))return o.filter(x=>!(x&&x.type==="EmptyStatement")).map(strip);if(o&&typeof o==="object"){const r={};for(const k of Object.keys(o)){if(["start","end","loc","range","raw"].includes(k))continue;r[k]=strip(o[k])}
    if(r.type==="TemplateElement"&&r.value)r.value={cooked:r.value.cooked};return r}return o};
  return JSON.stringify(strip(ast))};
const files=process.argv.slice(2);const h=files.map(f=>{const n=norm(fs.readFileSync(f,"utf8"));return crypto.createHash("sha256").update(n).digest("hex")});
console.log(h.join("\n"));console.log(h.every(x=>x===h[0])?"AST IDENTIQUE":"AST DIFFERENT");
