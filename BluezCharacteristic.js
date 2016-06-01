var EventEmitter = require('events').EventEmitter;
var util = require('util');
var bluezDBus = require('./BluezDBus');

module.exports = BluezCharacteristic;

function BluezCharacteristic(path) {
  this.debug = require('debug')('Bluez:Characteristic:' + path);
  this.path = path;
  this.debug('New characteristic');
}

util.inherits(BluezCharacteristic, EventEmitter);

BluezCharacteristic.prototype.init = function(cb) {
  /* Get GattCharacteristic1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.GattCharacteristic1',
    function(err, iface) {
      if (err) {
        this.debug('Failed getting GattCharacteristic1 interface:' + err);
        if (cb) cb(err);
        return;
      }

      /* Save this interface */
      this.iface = iface;

      /* Get Protperties interface */
      bluezDBus.getProperties(this.path, 'org.bluez.GattCharacteristic1',
        this._characteristicPropertiesUpdate.bind(this), /* Property changed */
        function(err) { /* All propertires were resolved */
          if (err) {
            this.debug('Failed getting all properties:' + err);
            if (cb) cb(err);
            return;
          }

          /* The new characteristic is ready */
          if (cb) cb();
        }.bind(this));
    }.bind(this)
  );
}

BluezCharacteristic.prototype.toString = function() {
  return '[Object BluezCharacteristic (' + this.path + ')]';
}

BluezCharacteristic.prototype._characteristicPropertiesUpdate = function(key, value) {
  this.debug(key + ' changed from ' + this[key] + ' to ' + value);
  this[key] = value;
  this.emit('propertyChanged', key, value);
}

BluezCharacteristic.prototype.Read = function(cb) {
  this.iface.ReadValue['finish'] = function(value) {
    this.debug('Read: ' + value);
    if (cb) cb(null, value);
  }.bind(this);
  this.iface.ReadValue['error'] = function(err) {
    this.debug('Failed reading: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.ReadValue();
}

BluezCharacteristic.prototype.Write = function(value, cb) {
  this.iface.WriteValue['finish'] = function() {
    this.debug('Wrote value: ' + value);
    if (cb) cb();
  }.bind(this);
  this.iface.WriteValue['error'] = function(err) {
    this.debug('Failed writing: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.WriteValue(value);
}

BluezCharacteristic.prototype.NotifyStart = function(cb) {
  this.iface.StartNotify['finish'] = function() {
    this.debug('Listening on notifications');
    if (cb) cb();
  }.bind(this);
  this.iface.StartNotify['error'] = function(err) {
    this.debug('Failed listening on notifications: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.StartNotify();
}

BluezCharacteristic.prototype.NotifyStop = function(cb) {
  this.iface.StopNotify['finish'] = function() {
    this.debug('Stopped listening on notifications');
    if (cb) cb();
  }.bind(this);
  this.iface.StopNotify['error'] = function(err) {
    this.debug('Failed stopping listening on notifications: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.StopNotify();
}
