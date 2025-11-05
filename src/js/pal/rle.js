console.trace('rle module load');

const RLE_DECORATED = Symbol('rleDecorated');

const RLE_STATS = {
  calls: 0,
  decorated: 0,
  reused: 0,
  totalBytes: 0,
  histogram: Object.create(null),
  last: null
};

function recordRLEStats(alreadyDecorated, buffer) {
  RLE_STATS.calls += 1;
  if (alreadyDecorated) {
    RLE_STATS.reused += 1;
  } else {
    RLE_STATS.decorated += 1;
  }
  const length = buffer ? buffer.length : 0;
  RLE_STATS.totalBytes += length;
  if (length) {
    RLE_STATS.histogram[length] = (RLE_STATS.histogram[length] || 0) + 1;
  }
  if (buffer && buffer.length >= 4) {
    const width = buffer[0] | (buffer[1] << 8);
    const height = buffer[2] | (buffer[3] << 8);
    RLE_STATS.last = { length, width, height, reused: alreadyDecorated };
  } else {
    RLE_STATS.last = { length, reused: alreadyDecorated };
  }
}

/**
 * RLE，对Uint8Array进行一次封装，封装了width/height/content属性
 * @param {Uint8Array} buf
 */
var RLEMixin = {
  width: {
    get: function() {
      return this.reader.getUint16(0);
    }
  },
  height: {
    get: function() {
      return this.reader.getUint16(2);
    }
  },
  content: {
    get: function() {
      return this.tmp.subarray(4);
    }
  }
};

var RLE = function(buf) {
  var tmp = buf;
  if (!buf) return null;
  // Skip the 0x00000002 in the file header.
  if (tmp[0] === 0x02 && tmp[1] === 0x00 &&
      tmp[2] === 0x00 && tmp[3] === 0x00) {
    tmp = tmp.subarray(4);
  }

  buf.tmp = tmp;
  buf.reader = new BinaryReader(tmp);
  var alreadyDecorated = !!buf[RLE_DECORATED];
  if (!alreadyDecorated) {
    Object.defineProperties(buf, RLEMixin);
    Object.defineProperty(buf, RLE_DECORATED, {
      value: true,
      enumerable: false,
      configurable: true
    });
  }
  recordRLEStats(alreadyDecorated, tmp);

  // Get the width and height of the bitmap.
  //buf.width = tmp[0] | (tmp[1] << 8);
  //buf.height = tmp[2] | (tmp[3] << 8);

  //buf.content = tmp.subarray(4);

  return buf;
};

export default RLE;
export { RLE_STATS };
