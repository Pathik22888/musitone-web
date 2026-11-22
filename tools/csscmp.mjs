import postcss from "postcss";import fs from "fs";
const N=s=>s.replace(/\[([a-z-]+)=("|')([^"'\]]*)\2\]/g,"[$1=$3]").replace(/(^|[^0-9.])0\.(\d)/g,"$1.$2").replace(/\s+/g," ").replace(/\s*([>+~,():*\/])\s*/g,"$1").replace(/'/g,"\"").replace(/\s*!important/,"!important").trim().toLowerCase();
const flat=f=>{const out=[];postcss.parse(fs.readFileSync(f,"utf8")).walk(n=>{if(n.type==="rule")out.push("R:"+N(n.selector)+"|"+(n.parent.type==="atrule"?N(n.parent.params):""));else if(n.type==="decl")out.push("D:"+N(n.prop)+":"+N(n.value)+(n.important?"!":""));else if(n.type==="atrule")out.push("A:"+n.name+" "+N(n.params))});return out};
const a=flat(process.argv[2]),b=flat(process.argv[3]);let d=0;for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i]){console.log(i,a[i],"||",b[i]);if(++d>8)break}
console.log(a.length,b.length,d?"CSS DIFFERENT":"CSS IDENTIQUE");
