// a 1 m cube plus a camera at a known pose (eye, aim, roll, fov) -> test-camera.gltf
import fs from 'node:fs';
const eye = [2, 1, 3], aim = [0, .2, 0], roll = 12 * Math.PI / 180, fovY = 40 * Math.PI / 180;
const sub = (a, b) => a.map((v, i) => v - b[i]), nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const z = nrm(sub(eye, aim)); let x = nrm(cross([0,1,0], z)); let y = cross(z, x);
const xr = x.map((v, i) => v * Math.cos(roll) + y[i] * Math.sin(roll)), yr = y.map((v, i) => -x[i] * Math.sin(roll) + v * Math.cos(roll));
const m = [[xr[0], yr[0], z[0]], [xr[1], yr[1], z[1]], [xr[2], yr[2], z[2]]];
const tr = m[0][0] + m[1][1] + m[2][2]; let q;
if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[2][1]-m[1][2])/s, (m[0][2]-m[2][0])/s, (m[1][0]-m[0][1])/s, s/4]; }
else { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s/4, (m[0][1]+m[1][0])/s, (m[0][2]+m[2][0])/s, (m[2][1]-m[1][2])/s]; }
const P = [], I = [];
const v = [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
v.forEach(p => P.push(...p));
[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[0,4,7],[0,7,3]].forEach(t => I.push(...t));
const pb = Buffer.from(new Float32Array(P).buffer), ib = Buffer.from(new Uint16Array(I).buffer);
const buf = Buffer.concat([pb, ib, Buffer.alloc((4 - (pb.length + ib.length) % 4) % 4)]);
const gltf = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0, 1]}],
  nodes:[{mesh:0, name:'Box'}, {camera:0, name:'ShotCam', translation:eye, rotation:q}],
  cameras:[{type:'perspective', perspective:{yfov:fovY, aspectRatio:1.5, znear:.01, zfar:100}}],
  meshes:[{primitives:[{attributes:{POSITION:0}, indices:1}]}],
  buffers:[{byteLength:buf.length, uri:'data:application/octet-stream;base64,' + buf.toString('base64')}],
  bufferViews:[{buffer:0, byteOffset:0, byteLength:pb.length}, {buffer:0, byteOffset:pb.length, byteLength:ib.length}],
  accessors:[{bufferView:0, componentType:5126, count:8, type:'VEC3', min:[-.5,-.5,-.5], max:[.5,.5,.5]}, {bufferView:1, componentType:5123, count:I.length, type:'SCALAR'}]};
fs.writeFileSync('C:/Users/mdsha/AppData/Local/Temp/test-camera.gltf', JSON.stringify(gltf));
console.log(JSON.stringify({eye, aim, roll:12, fov:40, quat:q.map(v => +v.toFixed(4))}));
