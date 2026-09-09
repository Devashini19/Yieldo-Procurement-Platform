import fs from "fs";
const buf = fs.readFileSync("frontend/public/logo.jpg");
let i = 2;
while (i < buf.length) {
  if (buf[i] === 0xff && (buf[i+1] >= 0xc0 && buf[i+1] <= 0xc3)) {
    console.log("Image size:", { width: buf.readUInt16BE(i+7), height: buf.readUInt16BE(i+5) });
    break;
  }
  i++;
}
