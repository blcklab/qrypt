import { readMatrixData } from './matrix.js'
import { decodePayload } from './payload.js'
import type { DecodedQR } from './payload.js'

/** Raw, tightly packed image pixels (no DOM, Canvas or image file decoder needed). */
export interface QRImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array | Uint8ClampedArray
  readonly format?: 'rgba' | 'rgb' | 'gray'
}

export interface QRPoint { readonly x: number; readonly y: number }

export interface ImageDecodeOptions {
  /** Maximum candidate triples to decode after finder detection; 1–64, default 24. */
  readonly maxCandidates?: number
  /** Maximum candidate finder centers kept for grouping; 3–32, default 16. */
  readonly maxFinders?: number
}

export interface ImageDecodedQR extends DecodedQR {
  /** Approximate four outer QR corners, in original image pixel coordinates. */
  readonly corners: readonly [QRPoint, QRPoint, QRPoint, QRPoint]
}

const MAX_IMAGE_PIXELS = 4_194_304

function validateImage(image: QRImage): { width: number; height: number; stride: number } {
  if (!image || typeof image !== 'object') throw new TypeError('QR image must be a raw pixel buffer.')
  const { width, height } = image
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 21 || height < 21 || width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError(`QR image dimensions must be at least 21×21 and at most ${MAX_IMAGE_PIXELS} pixels total.`)
  }
  const stride = image.format === 'gray' ? 1 : image.format === 'rgb' ? 3 : image.format === undefined || image.format === 'rgba' ? 4 : 0
  if (!stride) throw new TypeError('QR image format must be rgba, rgb or gray.')
  if (!(image.data instanceof Uint8Array) && !(image.data instanceof Uint8ClampedArray)) throw new TypeError('QR pixels must be Uint8Array or Uint8ClampedArray.')
  if (image.data.length !== width * height * stride) throw new RangeError('QR image byte length does not match its dimensions and format.')
  return { width, height, stride }
}

function grayscale(image: QRImage, width: number, height: number, stride: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  const bytes = image.data
  for (let p = 0, i = 0; p < gray.length; p++, i += stride) {
    if (stride === 1) { gray[p] = bytes[i]!; continue }
    const value = (bytes[i]! * 77 + bytes[i + 1]! * 150 + bytes[i + 2]! * 29 + 128) >> 8
    const a = stride === 4 ? bytes[i + 3]! : 255
    // Alpha is composited over white; transparent pixels cannot create black modules.
    gray[p] = Math.round((value * a + 255 * (255 - a)) / 255)
  }
  return gray
}

function binarize(gray: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(gray.length)
  const histogram = new Uint32Array(256)
  let sum = 0
  for (const value of gray) { histogram[value]!++; sum += value }
  let betweenMax = -1, threshold = 127, leftCount = 0, leftSum = 0
  for (let t = 0; t < 255; t++) {
    leftCount += histogram[t]!
    leftSum += t * histogram[t]!
    if (leftCount === 0 || leftCount === gray.length) continue
    const score = (sum * leftCount - leftSum * gray.length) ** 2 / (leftCount * (gray.length - leftCount))
    if (score > betweenMax) { betweenMax = score; threshold = t }
  }
  // Inclusive Otsu threshold avoids losing exact black modules on binary images.
  if (betweenMax <= 0) return result
  // Integral image enables local thresholds for uneven illumination.
  const radius = Math.max(8, Math.min(36, Math.floor(Math.min(width, height) / 24)))
  const stride = width + 1
  const integral = new Float64Array((height + 1) * stride)
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += gray[(y - 1) * width + x - 1]!
      integral[y * stride + x] = integral[(y - 1) * stride + x]! + row
    }
  }
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1)
      const local = (integral[bottom * stride + right]! - integral[top * stride + right]! - integral[bottom * stride + left]! + integral[top * stride + left]!) / ((bottom - top) * (right - left))
      // Use Otsu globally for clean binary images; adapt only when local light differs.
      const cutoff = Math.max(threshold, Math.min(threshold + 18, local - 8))
      result[y * width + x] = gray[y * width + x]! <= cutoff ? 1 : 0
    }
  }
  return result
}

interface Finder { x: number; y: number; module: number; count: number }
interface Run { color: number; start: number; length: number }
const ratio = (runs: readonly number[]): number => {
  const total = runs.reduce((a,b) => a+b, 0)
  const unit = total / 7
  if (unit < 0.9) return 0
  const expected = [unit, unit, unit * 3, unit, unit]
  let penalty = 0
  for (let i = 0; i < 5; i++) {
    const delta = Math.abs(runs[i]! - expected[i]!) / unit
    if (delta > (i === 2 ? 1.8 : 1.25)) return 0
    penalty += delta
  }
  return penalty < 3.1 ? unit : 0
}

function crossCheck(bits: Uint8Array, width: number, height: number, cx: number, cy: number, vertical: boolean, expected: number): number | undefined {
  const limit = vertical ? height : width
  const start = vertical ? cy : cx
  const get = (position: number): number => vertical ? bits[position * width + cx]! : bits[cy * width + position]!
  if (start < 0 || start >= limit || get(start) !== 1) return undefined
  const max = Math.ceil(expected * 6 + 3)
  let left = start, right = start
  while (left > 0 && get(left - 1) === 1 && start - left < max) left--
  while (right + 1 < limit && get(right + 1) === 1 && right - start < max) right++
  const centerLen = right - left + 1
  if (Math.abs(centerLen - 3 * expected) > expected * 2) return undefined
  let a = left - 1, b = right + 1
  while (a >= 0 && get(a) === 0 && left - a <= max) a--
  const innerLeft = left - a - 1
  while (b < limit && get(b) === 0 && b - right <= max) b++
  const innerRight = b - right - 1
  const outerLeftEnd = a, outerRightStart = b
  while (a >= 0 && get(a) === 1 && outerLeftEnd - a < max) a--
  while (b < limit && get(b) === 1 && b - outerRightStart < max) b++
  const outerLeft = outerLeftEnd - a, outerRight = b - outerRightStart
  const measured = ratio([outerLeft, innerLeft, centerLen, innerRight, outerRight])
  if (!measured || Math.abs(measured - expected) > Math.max(expected * .7, 1.5)) return undefined
  return (left + right) / 2
}

function detectFinders(bits: Uint8Array, width: number, height: number, maxFinders: number): Finder[] {
  const found: Finder[] = []
  // Row stepping adapts to symbol scale; never skip more than two pixels.
  const step = Math.min(2, Math.max(1, Math.floor(height / 250)))
  for (let y = 0; y < height; y += step) {
    const runs: Run[] = []
    let start = 0, color = bits[y * width]!
    for (let x = 1; x <= width; x++) {
      const current = x < width ? bits[y * width + x]! : 1 - color
      if (x !== width && current === color) continue
      runs.push({ color, start, length: x - start })
      start = x; color = current
      if (runs.length > 5) runs.shift()
      if (runs.length < 5 || runs[0]!.color !== 1 || runs[2]!.color !== 1 || runs[4]!.color !== 1) continue
      const module = ratio(runs.map(r => r.length))
      if (!module) continue
      const xCenter = runs[2]!.start + runs[2]!.length / 2
      const xc = Math.floor(xCenter)
      const refinedY = crossCheck(bits, width, height, xc, y, true, module)
      if (refinedY === undefined) continue
      const refinedX = crossCheck(bits, width, height, xc, Math.round(refinedY), false, module)
      if (refinedX === undefined) continue
      let matched = false
      for (const finder of found) {
        if (Math.abs(finder.x - refinedX) < module * 2.5 && Math.abs(finder.y - refinedY) < module * 2.5 && Math.abs(finder.module - module) < module * .75) {
          finder.x = (finder.x * finder.count + refinedX) / (finder.count + 1)
          finder.y = (finder.y * finder.count + refinedY) / (finder.count + 1)
          finder.module = (finder.module * finder.count + module) / (finder.count + 1)
          finder.count++
          matched = true
          break
        }
      }
      if (!matched) found.push({x: refinedX, y: refinedY, module, count: 1})
    }
  }
  return found.sort((a,b) => b.count - a.count).slice(0, maxFinders)
}

const distance = (a: QRPoint, b: QRPoint): number => Math.hypot(a.x-b.x, a.y-b.y)
const plus = (a: QRPoint, b: QRPoint): QRPoint => ({x:a.x+b.x,y:a.y+b.y})
const minus = (a: QRPoint, b: QRPoint): QRPoint => ({x:a.x-b.x,y:a.y-b.y})

/** Solve eight homography coefficients, leaving h33 fixed at one. */
function homography(src: readonly QRPoint[], dst: readonly QRPoint[]): number[] | undefined {
  const rows: number[][] = []
  for (let i=0;i<4;i++) {
    const {x,y} = src[i]!, {x:u,y:v} = dst[i]!
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v])
  }
  for (let i=0;i<8;i++) {
    let best=i
    for (let r=i+1;r<8;r++) if(Math.abs(rows[r]![i]!)>Math.abs(rows[best]![i]!)) best=r
    if (Math.abs(rows[best]![i]!)<1e-10) return undefined
    ;[rows[i],rows[best]]=[rows[best]!,rows[i]!]
    const divisor=rows[i]![i]!
    for (let c=i;c<9;c++) rows[i]![c] = rows[i]![c]! / divisor
    for (let r=0;r<8;r++) {
      if(r===i) continue
      const k=rows[r]![i]!
      for (let c=i;c<9;c++) rows[r]![c] = rows[r]![c]! - k*rows[i]![c]!
    }
  }
  return rows.map(row=>row[8]!)
}
function project(h: number[], x: number, y: number): QRPoint {
  const den=h[6]!*x+h[7]!*y+1
  return {x:(h[0]!*x+h[1]!*y+h[2]!)/den,y:(h[3]!*x+h[4]!*y+h[5]!)/den}
}
function sample(bits: Uint8Array, width: number, height: number, h: number[], size: number): boolean[][] | undefined {
  const result: boolean[][]=[]
  for(let y=0;y<size;y++) {
    const row:boolean[]=[]
    for(let x=0;x<size;x++) {
      const pt=project(h,x+.5,y+.5)
      const ix=Math.round(pt.x),iy=Math.round(pt.y)
      if (!Number.isFinite(ix) || !Number.isFinite(iy) || ix<0 || iy<0 || ix>=width || iy>=height) return undefined
      row.push(bits[iy*width+ix]===1)
    }
    result.push(row)
  }
  return result
}
function alignmentScore(bits: Uint8Array,width:number,height:number,center:QRPoint,basisX:QRPoint,basisY:QRPoint):number {
  let score=0
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const x=Math.round(center.x+basisX.x*dx+basisY.x*dy)
    const y=Math.round(center.y+basisX.y*dx+basisY.y*dy)
    if(x<0||y<0||x>=width||y>=height) continue
    const expected = Math.max(Math.abs(dx),Math.abs(dy)) !== 1
    if ((bits[y*width+x] === 1) === expected) score++
  }
  return score
}

/** The 7×7 finder pattern refines centers that have been biased by adjacent data modules. */
function refineFinder(bits: Uint8Array, width: number, height: number, center: Finder,
                      basisX: QRPoint, basisY: QRPoint, pitch: number): Finder {
  let best = -1, point: QRPoint = center
  const radius = Math.min(16, Math.ceil(pitch * 1.8))
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    let score = 0
    const px = center.x + dx, py = center.y + dy
    for (let my = -3; my <= 3; my++) for (let mx = -3; mx <= 3; mx++) {
      const x = Math.round(px + pitch * (mx * basisX.x + my * basisY.x))
      const y = Math.round(py + pitch * (mx * basisX.y + my * basisY.y))
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const dark = Math.max(Math.abs(mx), Math.abs(my)) !== 2
      if ((bits[y * width + x] === 1) === dark) score++
    }
    if (score > best) { best = score; point = { x: px, y: py } }
  }
  // Do not trust an optimized finder location without a strong finder-shaped signal.
  return best >= 42 ? { ...center, x: point.x, y: point.y, module: pitch } : center
}

function decodeCandidate(bits: Uint8Array,width: number,height: number,tl: Finder,tr: Finder,bl: Finder,size: number): ImageDecodedQR | undefined {
    const nominal= size-7
    const dx=minus(tr,tl),dy=minus(bl,tl)
    const moduleX={x:dx.x/nominal,y:dx.y/nominal},moduleY={x:dy.x/nominal,y:dy.y/nominal}
    const src:QRPoint[]=[{x:3.5,y:3.5},{x:size-3.5,y:3.5},{x:3.5,y:size-3.5},{x:size-6.5,y:size-6.5}]
    const expected=plus(tl,{x:(moduleX.x+moduleY.x)*(size-10),y:(moduleX.y+moduleY.y)*(size-10)})
    const fourth:QRPoint[]=[]
    if (size>21) {
      let best=-1,position:QRPoint|undefined
      // Search the alignment marker near the predicted bottom-right.
      const radius=Math.max(2,Math.min(18,Math.round((tl.module+tr.module+bl.module)*3)))
      const step=Math.max(1,Math.floor(radius/8))
      for(let oy=-radius;oy<=radius;oy+=step)for(let ox=-radius;ox<=radius;ox+=step){
        const pt={x:expected.x+ox,y:expected.y+oy}
        const score=alignmentScore(bits,width,height,pt,moduleX,moduleY)
        if(score>best){best=score;position=pt}
      }
      if(best>=20 && position)fourth.push(position)
    }
    fourth.push(expected)
    for(const p of fourth){
      const h=homography(src,[tl,tr,bl,p]);if(!h)continue
      const matrix=sample(bits,width,height,h,size)
      if(!matrix)continue
      try {
        const decoded=decodePayload(readMatrixData(matrix))
        const corners=[project(h,0,0),project(h,size,0),project(h,size,size),project(h,0,size)] as const
        return {...decoded,corners}
      }catch { /* Detector candidates can be false positives or sampled poorly. */ }
    }

  return undefined
}

function attempts(bits:Uint8Array,width:number,height:number,finders:Finder[],limit:number):ImageDecodedQR|undefined {
  const candidates:{tl:Finder;tr:Finder;bl:Finder;size:number;penalty:number}[]=[]
  for(let i=0;i<finders.length;i++)for(let j=i+1;j<finders.length;j++)for(let k=j+1;k<finders.length;k++){
    const pts=[finders[i]!,finders[j]!,finders[k]!]
    // Right-angle point is opposite the longest side.
    const sides=[distance(pts[1]!,pts[2]!),distance(pts[0]!,pts[2]!),distance(pts[0]!,pts[1]!)]
    const cornerIndex=sides.indexOf(Math.max(...sides))
    const tl=pts[cornerIndex]!, rest=pts.filter((_,n)=>n!==cornerIndex)
    const va=minus(rest[0]!,tl), vb=minus(rest[1]!,tl)
    const dot=(va.x*vb.x+va.y*vb.y)/(Math.hypot(va.x,va.y)*Math.hypot(vb.x,vb.y))
    const lenA=distance(tl,rest[0]!),lenB=distance(tl,rest[1]!)
    if (Math.abs(dot)>.35||Math.min(lenA,lenB)/Math.max(lenA,lenB)<.55)continue
    const cross=va.x*vb.y-va.y*vb.x
    const tr=cross>0?rest[0]!:rest[1]!, bl=cross>0?rest[1]!:rest[0]!
    const module=(tl.module+tr.module+bl.module)/3
    if ([tl,tr,bl].some(p=>Math.abs(p.module-module)>module*.55)) continue
    // Horizontal finder runs enlarge under rotation; project back onto the nearest image axis.
    const axisA=Math.max(Math.abs(va.x),Math.abs(va.y))/lenA
    const axisB=Math.max(Math.abs(vb.x),Math.abs(vb.y))/lenB
    const pitch=module*(axisA+axisB)/2
    const approximate=((lenA+lenB)/2)/pitch+7
    const version=Math.round((approximate-17)/4)
    if(version<1||version>40)continue
    const size=17+4*version
    const penalty=Math.abs(size-approximate)/4+Math.abs(dot)*4+Math.abs(lenA-lenB)/Math.max(lenA,lenB) - Math.log2(1+tl.count+tr.count+bl.count) * 0.3
    candidates.push({tl,tr,bl,size,penalty})
  }
  candidates.sort((a,b)=>a.penalty-b.penalty)
  const tried=new Set<string>()
  let count=0
  for(const candidate of candidates){
    let {tl,tr,bl,size} = candidate
    if(count++ >= limit)break
    const key=[tl.x,tl.y,tr.x,tr.y,bl.x,bl.y].map(v=>Math.round(v)).join(':')
    if(tried.has(key))continue
    tried.add(key)
    // Sample the first geometric estimate before refinement: refinement can
    // overfit an interior pattern when a large symbol has many alignment marks.
    const initial = decodeCandidate(bits,width,height,tl,tr,bl,size)
    if (initial) return initial
    // Refine against the actual 7×7 finder geometry. A horizontal run can
    // overestimate pitch if neighboring data modules merge with a finder.
    const dx0 = minus(tr,tl), dy0 = minus(bl,tl)
    const lenX = distance(tr,tl), lenY = distance(bl,tl)
    const basisX = {x:dx0.x/lenX,y:dx0.y/lenX}, basisY = {x:dy0.x/lenY,y:dy0.y/lenY}
    const orientation = (Math.max(Math.abs(basisX.x), Math.abs(basisX.y)) +
                         Math.max(Math.abs(basisY.x), Math.abs(basisY.y))) / 2
    const pitch = Math.min(tl.module,tr.module,bl.module) * orientation
    if (pitch >= 1.5) {
      const refinedTL = refineFinder(bits,width,height,tl,basisX,basisY,pitch)
      const refinedTR = refineFinder(bits,width,height,tr,basisX,basisY,pitch)
      const refinedBL = refineFinder(bits,width,height,bl,basisX,basisY,pitch)
      const newSize = 17 + 4 * Math.round((((distance(refinedTL,refinedTR)+distance(refinedTL,refinedBL))/2)/pitch + 7 - 17)/4)
      if (newSize >= 21 && newSize <= 177) {
        const refined = decodeCandidate(bits,width,height,refinedTL,refinedTR,refinedBL,newSize)
        if (refined) return refined
      }
    }
  }
  return undefined
}

/** Decode the first QR Code Model 2 symbol found in a raw image buffer.
 * Detects finder patterns, rectifies the symbol, samples module centers, and
 * delegates error correction / text decoding to decodeMatrix().
 * No image file decoders, camera access or network APIs are involved.
 * Returns null when no supported QR symbol can be decoded.
 */
export function decodePixels(image:QRImage,options:ImageDecodeOptions={}):ImageDecodedQR|null {
  const {width,height,stride}=validateImage(image)
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Image decode options must be an object.')
  const maxCandidates=options.maxCandidates??24,maxFinders=options.maxFinders??16
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>64||!Number.isInteger(maxFinders)||maxFinders<3||maxFinders>32)throw new RangeError('Invalid image decoding candidate limits.')
  const gray=grayscale(image,width,height,stride)
  const bits=binarize(gray,width,height)
  const finders=detectFinders(bits,width,height,maxFinders)
  if(finders.length<3)return null
  return attempts(bits,width,height,finders,maxCandidates)??null
}
