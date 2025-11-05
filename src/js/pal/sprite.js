import utils from './utils';
import RLE from './rle';

console.trace('sprite module load');

/**
 * 一组Sprite动画
 * @constructor
 * @param  {Uint8Array} buf
 */
var Sprite = function(buf) {
  if (buf && buf.uint8Array instanceof Uint8Array) {
    buf = buf.uint8Array;
  } else if (buf && !(buf instanceof Uint8Array) && buf.buffer instanceof ArrayBuffer) {
    var byteOffset = buf.byteOffset || 0;
    var byteLength = buf.byteLength || 0;
    buf = new Uint8Array(buf.buffer, byteOffset, byteLength);
  }
  this.buf = buf instanceof Uint8Array ? buf : new Uint8Array(0);
  /**
   * 帧数
   * @name frameCount
   * @memberof Sprite
   * @type {int}
   */
  this.reader = this.buf.length >= 2 ? new BinaryReader(this.buf) : null;
  this.frameCount = this.getFrameCount();
  this.readAll();
};

utils.extend(Sprite.prototype, {
  /**
   * 获取帧数
   * @memberOf Sprite#
   * @return {int}
   */
  getFrameCount: function() {
    if (!this.reader || this.buf.length < 2) {
      return 0;
    }
    var frameTableCount = this.reader.getUint16(0);
    if (!Number.isFinite(frameTableCount) || frameTableCount <= 0) {
      return 0;
    }
    return frameTableCount - 1;
  },
  /**
   * 获取帧偏移量
   * @memberOf Sprite#
   * @param  {int} frameNum
   * @return {int}
   */
  getFrameOffset: function(frameNum) {
    if (!this.reader) {
      return false;
    }
    if (frameNum >= this.frameCount) {
      return false;
    }
    var tableOffset = frameNum << 1;
    if (tableOffset < 0 || tableOffset + 2 > this.buf.length) {
      return false;
    }
    var offsetWord = this.reader.getUint16(tableOffset);
    var offset = WORD(offsetWord << 1);
    if (!Number.isFinite(offset) || offset < 0 || offset >= this.buf.length) {
      return false;
    }
    return offset;
  },
  /**
   * 获取某一帧
   * @memberOf Sprite#
   * @param  {int} frameNum
   * @return {Uint8Array}
   */
  getFrame: function(frameNum) {
    var offset = this.getFrameOffset(frameNum);
    if (offset === false) return false;

    if (offset >= this.buf.length) {
      return false;
    }
    var ret = this.buf.subarray(offset);
    //ret.width = PAL_RLEGetWidth(ret);
    //ret.height = PAL_RLEGetHeight(ret);
    var rle = RLE(ret);
    return rle;
  },
  /**
   * 读取所有帧到this.frames
   * @memberOf Sprite#
   * @return {Array}
   */
  readAll: function() {
    if (this.frames) return this.frames;
    var count = this.frameCount;
    if (!this.reader || count <= 0) {
      this.frames = [];
      return;
    }
    this.frames = new Array(count);
    for (var i=0; i<count; ++i) {
      this.frames[i] = this.getFrame(i);
    }
  }
});

/**
 * 从MKF构建所有的Sprite
 * @param  {MKF} mkf
 * @return {Array} 内含若干个Sprite（可能为null）
 */
Sprite.fromMKF = function(mkf, decompress){
  var count = mkf.getChunkCount();
  var arr = new Array(count);
  decompress = decompress || false;
  for (var i=0; i<count; ++i) {
    var buf = mkf[decompress ? 'decompressChunk' : 'readChunk'](i);
    if (buf) {
      var sprite = new Sprite(buf);
      arr[i] = sprite;
    } else {
      arr[i] = null;
    }
  }
  return arr;
};

export default Sprite;
