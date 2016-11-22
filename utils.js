const debug = require('debug')('ble2mqtt:utils')
const _ = require('underscore')

module.exports = {}

/* IEEE-11073 conversion algorithm shamelessly ripped off from Antidote:
 * http://oss.signove.com/index.php/Antidote:_IEEE_11073-20601_stack */
function numberToIeee11073(number, FLOAT_NAN, FLOAT_MAX, FLOAT_MIN,
  FLOAT_POSITIVE_INFINITY, FLOAT_NEGATIVE_INFINITY, FLOAT_EPSILON,
  FLOAT_MANTISSA_MAX, FLOAT_EXPONENT_MAX, FLOAT_EXPONENT_MIN,
  FLOAT_EXPONENT_MASK, FLOAT_EXPONENT_SHIFT, FLOAT_MANTISSA_MASK,
  FLOAT_PERCISION)
{
  var result;

  if (isNaN(number))
    return FLOAT_NAN;
  if (number > FLOAT_MAX)
    return FLOAT_POSITIVE_INFINITY;
  if (number < FLOAT_MIN)
    return FLOAT_NEGATIVE_INFINITY;
  if (number >= -FLOAT_EPSILON && number <= FLOAT_EPSILON)
    return 0;

  var sgn = number > 0 ? +1 : -1;
  var mantissa = Math.abs(number);
  var exponent = 0; /* Note: 10**x exponent, not 2**x */

  /* Scale up if number is too big */
  while (mantissa > FLOAT_MANTISSA_MAX) {
    mantissa /= 10.0;
    exponent++;
    if (exponent > FLOAT_EXPONENT_MAX) {
      /* Argh, should not happen */
      if (sgn > 0)
        return FLOAT_POSITIVE_INFINITY;
      else
        return FLOAT_NEGATIVE_INFINITY;
    }
  }

  /* Scale down if number is too small */
  while (mantissa < 1) {
    mantissa *= 10;
    exponent--;
    if (exponent < FLOAT_EXPONENT_MIN) {
      /* Argh, should not happen */
      return 0;
    }
  }

  /* Scale down if number needs more precision */
  var smantissa = Math.round(mantissa * FLOAT_PERCISION);
  var rmantissa = Math.round(mantissa) * FLOAT_PERCISION;
  var mdiff = Math.abs(smantissa - rmantissa);
  while (mdiff > 0.5 && exponent > FLOAT_EXPONENT_MIN &&
    (mantissa * 100) <= FLOAT_MANTISSA_MAX)
  {
    mantissa *= 10;
    exponent--;
    smantissa = Math.round(mantissa * FLOAT_PERCISION);
    rmantissa = Math.round(mantissa) * FLOAT_PERCISION;
    mdiff = Math.abs(smantissa - rmantissa);
  }

  var int_mantissa = Math.round(sgn * mantissa);
  return ((exponent & FLOAT_EXPONENT_MASK) << FLOAT_EXPONENT_SHIFT) |
    (int_mantissa & FLOAT_MANTISSA_MASK);
}

function numberToSFloat(number) {
  return numberToIeee11073(number, 0x07FF, 20450000000.0, -20450000000.0,
    0x07FE, 0x0802, 1e-8, 0x07FD, 7, -8, 0xF, 12, 0xFFF, 10000);
}

function numberToFloat(number) {
  return numberToIeee11073(number, 0x007FFFFF, 8.388604999999999e+133,
    -8.388604999999999e+133, 0x007FFFFE, 0x00800002, 1e-128, 0x007FFFFD, 127,
    -128, 0xFF, 24, 0xFFFFFF, 10000000);
}

module.exports.bufferToGattTypes = function(buf, types) {
  var res = [];
  var offset = 0;

  _(types).each((type) => {
    var val;

    switch (type) {
      case 'boolean':
        val = buf.readUIntLE(offset, 1);
        val &= 0x01;
        val = val == 0 ? false : true;
        offset += 1;
        break;
      case '2bit':
        val = buf.readUIntLE(offset, 1);
        val &= 0x03;
        offset += 1;
        break;
      case '4bit':
      case 'nibble':
        val = buf.readUIntLE(offset, 1);
        val &= 0x0F;
        offset += 1;
        break;
      case '8bit':
      case 'uint8':
        val = buf.readUIntLE(offset, 1);
        offset += 1;
        break;
      case 'uint12':
        val = buf.readUIntLE(offset, 2);
        val &= 0x0FFF;
        offset += 2;
        break;
      case '16bit':
      case 'uint16':
        val = buf.readUIntLE(offset, 2);
        offset += 2;
        break;
      case '24bit':
      case 'uint24':
        val = buf.readUIntLE(offset, 3);
        offset += 3;
        break;
      case '32bit':
      case 'uint32':
        val = buf.readUIntLE(offset, 4);
        offset += 4;
        break;
      case 'uint40':
        val = buf.readUIntLE(offset, 5);
        offset += 5;
        break;
      case 'uint48':
        val = buf.readUIntLE(offset, 6);
        offset += 6;
        break;
      case 'sint8':
        val = buf.readIntLE(offset, 1);
        offset += 1;
        break;
      case 'sint16':
        val = buf.readIntLE(offset, 2);
        offset += 2;
        break;
      case 'sint24':
        val = buf.readIntLE(offset, 3);
        offset += 3;
        break;
      case 'sint32':
        val = buf.readIntLE(offset, 4);
        offset += 4;
        break;
      case 'sint48':
        val = buf.readIntLE(offset, 6);
        offset += 6;
        break;
      /* String values consume the rest of the buffer */
      case 'utf8s':
        val = buf.toString('utf8', offset);
        offset = buf.length;
        break;
      case 'utf16s':
        val = buf.toString('utf16', offset);
        offset = buf.length;
        break;
      /* IEEE-754 floating point format */
      case 'float32':
        val = buf.readFloatLE(offset);
        offset += 4;
        break;
      case 'float64':
        val = buf.readDoubleLE(offset);
        offset += 8;
        break;
      /* IEEE-11073 floating point format */
      case 'SFLOAT':
        val = buf.readUIntLE(offset, 2);
        var mantissa = val & 0x0FFF;
        var exponent = val >> 12;

        /* Fix sign */
        if (exponent >= 0x0008)
          exponent = -((0x000F + 1) - exponent);
        if (mantissa >= 0x0800)
          mantissa = -((0x0FFF + 1) - mantissa);

        val = mantissa * Math.pow(10, exponent);
        offset += 2;
      case 'FLOAT':
        var exponent = buf.readIntLE(offset, 1);
        var mantissa = buf.readIntLE(offset + 1, 3);
        val = mantissa * Math.pow(10, exponent);
        offset += 4;
      /* Unhandled types */
      case 'uint64':
      case 'uint128':
      case 'sint12':
      case 'sint64':
      case 'sint128':
      case 'duint16':
      case 'struct':
      case 'gatt_uuid':
      case 'reg-cert-data-list':
      case 'variable':
      default:
        debug('Unhandled characteristic format type: ' + type);
        return;
    }

    res.push(val);
  });

  /* Save remaining buffer to byte array */
  if (offset < buf.length)
    res.push(Array.prototype.slice.call(buf.slice(offset), 0));

  return res;
}

module.exports.gattTypesToBuffer = function(arr, length, types) {
  var buf = Buffer.allocUnsafe(length);
  var offset = 0;

  _(types).each((type, i) => {
    var val = arr[i];

    switch (type) {
      case 'boolean':
        buf.writeUIntLE(val == true ? 1 : 0, offset, 1);
        offset += 1;
        break;
      case '2bit':
        buf.writeUIntLE(val & 0x03, offset, 1);
        offset += 1;
        break;
      case '4bit':
      case 'nibble':
        buf.writeUIntLE(val & 0x0F, offset, 1);
        offset += 1;
        break;
      case '8bit':
      case 'uint8':
        buf.writeUIntLE(val, offset, 1);
        offset += 1;
        break;
      case 'uint12':
        buf.writeUIntLE(val & 0x0FFF, offset, 2);
        offset += 2;
        break;
      case '16bit':
      case 'uint16':
        buf.writeUIntLE(val, offset, 2);
        offset += 2;
        break;
      case '24bit':
      case 'uint24':
        buf.writeUIntLE(val, offset, 3);
        offset += 3;
        break;
      case '32bit':
      case 'uint32':
        buf.writeUIntLE(val, offset, 4);
        offset += 4;
        break;
      case 'uint40':
        buf.writeUIntLE(val, offset, 5);
        offset += 5;
        break;
      case 'uint48':
        buf.writeUIntLE(offset, 6);
        offset += 6;
        break;
      case 'sint8':
        buf.writeIntLE(offset, 1);
        offset += 1;
        break;
      case 'sint16':
        buf.writeIntLE(offset, 2);
        offset += 2;
        break;
      case 'sint24':
        buf.writeIntLE(offset, 3);
        offset += 3;
        break;
      case 'sint32':
        buf.writeIntLE(offset, 4);
        offset += 4;
        break;
      case 'sint48':
        buf.writeIntLE(offset, 6);
        offset += 6;
        break;
      /* String values consume the rest of the buffer */
      case 'utf8s':
        offset += buf.write(val, offset, 'utf8');
        break;
      case 'utf16s':
        offset += buf.write(val, offset, 'utf16');
        break;
      /* IEEE-754 floating point format */
      case 'float32':
        buf.writeFloatLE(val, offset);
        offset += 4;
        break;
      case 'float64':
        buf.writeDoubleLE(val, offset);
        offset += 8;
        break;
      /* IEEE-11073 floating point format */
      case 'SFLOAT':
        buf.writeUIntLE(numberToSFloat(val), offset, 2);
        offset += 2;
      case 'FLOAT':
        buf.writeUIntLE(numberToFloat(val), offset, 4);
        offset += 4;
      /* Unhandled types */
      case 'uint64':
      case 'uint128':
      case 'sint12':
      case 'sint64':
      case 'sint128':
      case 'duint16':
      case 'struct':
      case 'gatt_uuid':
      case 'reg-cert-data-list':
      case 'variable':
      default:
        debug('Unhandled characteristic format type: ' + type);
        return;
    }
  });

  return buf;
}
